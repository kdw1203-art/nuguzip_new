/**
 * POST /api/admin/molit-csv
 * 관리자 전용. 국토교통부 실거래가 CSV 업로드 → `market_transactions` 적재.
 *
 * 배경(사실 우선): 이 엔드포인트는 원래 운영 DB에 존재하지 않는 `complexes` ·
 * `complex_transactions` 테이블에 집계 결과를 넣으려 했다. 두 테이블 모두 없기 때문에
 * 업로드는 항상 실패했고(=죽은 경로), 성공한 것처럼 보이는 응답만 돌려줬다.
 * 실거래 실데이터는 `market_transactions`(source='MOLIT') 이므로 거래 1건 = 1행으로
 * 원본 그대로 적재한다. 집계는 조회 시점에 한다.
 *
 * 지원 CSV (공공데이터포털 RTMS 다운로드 원본, 앞머리 안내문 포함 가능):
 *   매매   … 시군구, 번지, 단지명, 전용면적(㎡), 계약년월, 계약일, 거래금액(만원), 층, 건축년도
 *   전월세 … 시군구, 번지, 단지명, 전용면적(㎡), 계약년월, 계약일, 보증금(만원), 월세금(만원), 층, 건축년도
 *
 * 중복 안전장치: (region_code, contract_ym) 조합에 이미 행이 있으면 그 구·월 전체를
 * 건너뛴다. 플랫폼 ETL 과 external_key 해시 레시피가 달라 같은 거래가 두 번 들어가면
 * 거래량·평균가가 이중 계상되기 때문이다. (molit-transactions-ingest 와 동일 정책)
 */
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { isAdminApiRequest } from "@/lib/admin/api-auth";
import { getServiceSupabase } from "@/lib/supabase/service";
import { logIngest } from "@/lib/market/store";
import { molitRegionLabel, listMolitSigungu } from "@/lib/market/molit-transactions";
import { getAllSido, getSigunguBySido, type SigunguInfo } from "@/lib/national-data/region-codes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const M2_PER_PYEONG = 3.305785;

/* ── 시군구 인덱스 ────────────────────────────────────────────────────────
 * CSV 의 "시군구" 는 "서울특별시 강남구 개포동" · "경기도 수원시 영통구 망포동" 형태.
 * region-codes 의 resolveSigunguCd() 는 못 찾으면 강남구(11680)로 폴백하므로 여기서는
 * 쓰지 않는다 — 잘못된 지역으로 실거래를 적재하는 것은 사실 왜곡이다. 매칭 실패 행은
 * 건너뛰고 개수를 보고한다.
 */
let INDEX: Map<string, SigunguInfo> | null = null;

function sigunguIndex(): Map<string, SigunguInfo> {
  if (INDEX) return INDEX;
  const all = getAllSido().flatMap(getSigunguBySido);
  // 시도명으로 쓰인 "시"(예: sido="수원시")의 상위 도를 역참조하기 위한 맵
  const parentOf = new Map<string, string>();
  for (const i of all) {
    if (i.sigungu === i.sido) continue;
    if (!i.sigungu.includes(" ")) parentOf.set(i.sigungu, i.sido);
  }
  const map = new Map<string, SigunguInfo>();
  for (const i of all) {
    const province = parentOf.get(i.sido) ?? i.sido; // "수원시" → "경기도"
    map.set(`${province}|${i.sigungu}`, i);
  }
  INDEX = map;
  return map;
}

interface Located {
  info: SigunguInfo;
  /** 읍면동 (매칭 후 남은 토큰) */
  umd: string;
}

/** "경기도 수원시 영통구 망포동" → {41117, umd:"망포동"} · 실패 시 null */
function locate(raw: string): Located | null {
  const tokens = raw.trim().split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return null;
  const province = tokens[0];
  const idx = sigunguIndex();
  // 긴 이름부터 (수원시 영통구 → 2토큰, 강남구 → 1토큰)
  for (const take of [3, 2, 1]) {
    if (tokens.length < 1 + take) continue;
    const name = tokens.slice(1, 1 + take).join(" ");
    const hit = idx.get(`${province}|${name}`);
    if (hit) return { info: hit, umd: tokens.slice(1 + take).join(" ") };
  }
  // 세종특별자치시처럼 시도 = 시군구 인 경우
  const self = idx.get(`${province}|${province}`);
  if (self) return { info: self, umd: tokens.slice(1).join(" ") };
  return null;
}

/* ── CSV 파싱 (따옴표 인식) ───────────────────────────────────────────── */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else quoted = false;
      } else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

interface ParsedCsv {
  headers: string[];
  rows: Record<string, string>[];
  error?: string;
}

function parseCsvText(text: string): ParsedCsv {
  const clean = text.replace(/^﻿/, "");
  const lines = clean.split(/\r?\n/).filter((l) => l.trim().length > 0);
  // 공공데이터포털 원본은 헤더 앞에 안내문 몇 줄이 붙는다 → 실제 헤더 줄을 찾는다
  const headerIdx = lines.findIndex(
    (l) => l.includes("시군구") && l.includes("계약년월") && l.includes("단지명"),
  );
  if (headerIdx < 0) {
    return { headers: [], rows: [], error: "헤더(시군구·단지명·계약년월)를 찾지 못했습니다." };
  }
  const headers = splitCsvLine(lines[headerIdx]).map((h) => h.replace(/\s/g, ""));
  const rows: Record<string, string>[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const vals = splitCsvLine(lines[i]);
    if (vals.length < 3) continue;
    const obj: Record<string, string> = {};
    headers.forEach((h, k) => {
      obj[h] = vals[k] ?? "";
    });
    rows.push(obj);
  }
  if (rows.length === 0) return { headers, rows, error: "데이터 행이 없습니다." };
  return { headers, rows };
}

function num(v: string | undefined): number | null {
  if (!v) return null;
  const n = Number(v.replace(/[,\s원]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function manwonToKrw(v: number | null): number | null {
  return v == null ? null : Math.round(v * 10000);
}

function pricePerPyeong(krw: number | null, areaM2: number | null): number | null {
  if (!krw || !areaM2 || areaM2 <= 0) return null;
  return Math.round(krw / (areaM2 / M2_PER_PYEONG));
}

export async function POST(req: Request) {
  if (!(await isAdminApiRequest())) {
    return NextResponse.json({ error: "관리자만 업로드할 수 있습니다." }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "multipart/form-data 형식이 필요합니다." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file 필드가 필요합니다." }, { status: 400 });
  }
  if (!file.name.toLowerCase().endsWith(".csv")) {
    return NextResponse.json({ error: ".csv 파일만 지원합니다." }, { status: 400 });
  }

  const sb = getServiceSupabase();
  if (!sb) {
    return NextResponse.json({ error: "Supabase 서비스 연결 실패" }, { status: 503 });
  }

  const buf = new Uint8Array(await file.arrayBuffer());
  // 공공데이터포털 CSV 는 EUC-KR 인 경우가 많다 → UTF-8 로 읽어 깨지면 EUC-KR 재시도
  let text = new TextDecoder("utf-8").decode(buf);
  if (text.includes("�")) {
    try {
      text = new TextDecoder("euc-kr").decode(buf);
    } catch {
      /* 런타임이 euc-kr 을 모르면 utf-8 결과 유지 */
    }
  }

  const { headers, rows, error } = parseCsvText(text);
  if (error) return NextResponse.json({ error, headers }, { status: 422 });

  const isRent = headers.some((h) => h.includes("보증금"));
  const transactionType = isRent ? "rent" : "trade";

  const skipped = { region: 0, required: 0, price: 0 };
  /** region_code|contract_ym → rows */
  const buckets = new Map<string, { info: SigunguInfo; ym: string; rows: Record<string, unknown>[] }>();
  const collectedAt = new Date().toISOString();

  for (const r of rows) {
    const sgg = r["시군구"] ?? "";
    const name = (r["단지명"] ?? r["아파트"] ?? "").trim();
    const ym = (r["계약년월"] ?? "").replace(/[^0-9]/g, "").slice(0, 6);
    const day = num(r["계약일"]);
    if (!sgg || !name || ym.length !== 6 || !day) {
      skipped.required += 1;
      continue;
    }

    const located = locate(sgg);
    if (!located) {
      skipped.region += 1;
      continue;
    }

    const dealKrw = manwonToKrw(num(r["거래금액(만원)"] ?? r["거래금액"]));
    const depositKrw = manwonToKrw(num(r["보증금(만원)"] ?? r["보증금"]));
    const monthlyKrw = manwonToKrw(num(r["월세금(만원)"] ?? r["월세"]));
    if (transactionType === "trade" ? !dealKrw : !depositKrw) {
      skipped.price += 1;
      continue;
    }

    const areaM2 = num(r["전용면적(㎡)"] ?? r["전용면적"]);
    const jibun = (r["번지"] ?? "").trim();
    /* #150 — 해제(취소) 계약. RTMS CSV 는 API 의 cdealType/cdealDay 대신
       "해제사유발생일"(예 "26.07.10") 또는 "해제여부"("O") 로 준다. 행은 남기되
       is_cancelled 로 표시해 시세·집계·알림에서 빠지게 한다. */
    const cancelDay = (r["해제사유발생일"] ?? "").trim();
    const cancelFlag = (r["해제여부"] ?? "").trim().toUpperCase();
    const isCancelled = cancelFlag === "O" || cancelDay.length > 0;
    const floor = num(r["층"]);
    const buildYear = num(r["건축년도"]);
    const address =
      [located.info.sigungu, located.umd, jibun].filter(Boolean).join(" ") || null;

    const digest = createHash("sha1")
      .update(
        [
          transactionType,
          located.info.sigunguCd,
          ym,
          day,
          name,
          located.umd,
          jibun,
          areaM2 ?? "",
          floor ?? "",
          dealKrw ?? depositKrw ?? "",
          monthlyKrw ?? "",
        ].join("|"),
      )
      .digest("hex");

    const key = `${located.info.sigunguCd}|${ym}`;
    const bucket =
      buckets.get(key) ?? { info: located.info, ym, rows: [] as Record<string, unknown>[] };
    bucket.rows.push({
      external_key: `molit-csv:${digest}`,
      source: "MOLIT",
      transaction_type: transactionType,
      property_type: "apartment",
      region_code: located.info.sigunguCd,
      region_name: molitRegionLabel(located.info),
      complex_name: name,
      address,
      contract_ym: ym,
      contract_day: day,
      deal_amount_krw: dealKrw,
      deposit_krw: depositKrw,
      /* 전세 표기 0 통일 + 월세 행 평단가 미계산 — lib/market/molit-transactions.ts
         toRow() 와 같은 규칙(그쪽 주석에 근거). 두 적재 경로가 다르게 쓰면
         데이터 품질 검사(jeonse_dual_encoding·rent_ppp_from_deposit)가 이 경로로
         들어온 행에서만 다시 살아난다. */
      monthly_rent_krw: transactionType === "rent" ? (monthlyKrw ?? 0) : monthlyKrw,
      area_m2: areaM2,
      floor,
      build_year: buildYear,
      price_per_pyeong_krw:
        transactionType === "rent" && (monthlyKrw ?? 0) > 0
          ? null
          : pricePerPyeong(transactionType === "trade" ? dealKrw : depositKrw, areaM2),
      is_cancelled: isCancelled,
      raw: {
        aptNm: name,
        umdNm: located.umd,
        jibun,
        sggCd: located.info.sigunguCd,
        month: ym,
        day,
        floor,
        buildYear,
        // API 응답과 같은 키로 담아 두 경로의 raw 모양을 맞춘다.
        cdealType: isCancelled ? "O" : " ",
        ...(cancelDay ? { cdealDay: cancelDay } : {}),
        ingest: "admin-csv",
        file: file.name,
      },
      collected_at: collectedAt,
    });
    buckets.set(key, bucket);
  }

  // ── (구, 월) 단위 적재 — 이미 데이터가 있는 조합은 통째로 건너뜀 ──────────
  let inserted = 0;
  let covered = 0;
  const errors: string[] = [];
  const regions: { code: string; name: string; ym: string; rows: number; status: string }[] = [];

  for (const [, b] of buckets) {
    const label = molitRegionLabel(b.info);
    const { count, error: cErr } = await sb
      .from("market_transactions")
      .select("id", { count: "exact", head: true })
      .eq("region_code", b.info.sigunguCd)
      .eq("contract_ym", b.ym);
    if (cErr) {
      errors.push(`${label} ${b.ym}: ${cErr.message}`);
      regions.push({ code: b.info.sigunguCd, name: label, ym: b.ym, rows: 0, status: "error" });
      continue;
    }
    if ((count ?? 0) > 0) {
      covered += 1;
      regions.push({
        code: b.info.sigunguCd,
        name: label,
        ym: b.ym,
        rows: count ?? 0,
        status: "covered",
      });
      continue;
    }

    const dedup = new Map<string, Record<string, unknown>>();
    for (const row of b.rows) dedup.set(String(row.external_key), row);
    const payload = [...dedup.values()];

    let ok = 0;
    for (let i = 0; i < payload.length; i += 500) {
      const chunk = payload.slice(i, i + 500);
      const { error: uErr } = await sb
        .from("market_transactions")
        .upsert(chunk, { onConflict: "external_key" });
      if (uErr) errors.push(`${label} ${b.ym} [${i}]: ${uErr.message}`);
      else ok += chunk.length;
    }
    inserted += ok;
    regions.push({
      code: b.info.sigunguCd,
      name: label,
      ym: b.ym,
      rows: ok,
      status: ok > 0 ? "inserted" : "error",
    });
  }

  await logIngest({
    source: "molit",
    dataset: `실거래 CSV 업로드 (${transactionType === "rent" ? "전월세" : "매매"})`,
    origin: "upload",
    rows: inserted,
    status: errors.length > 0 ? "error" : inserted > 0 ? "ok" : "skipped",
    message: `${file.name} 파싱=${rows.length} 적재=${inserted} 기존커버=${covered}개 구·월`,
  });

  return NextResponse.json({
    ok: errors.length === 0,
    fileName: file.name,
    kind: transactionType,
    parsed: rows.length,
    candidates: [...buckets.values()].reduce((a, b) => a + b.rows.length, 0),
    inserted,
    coveredGroups: covered,
    skipped,
    regions: regions.sort((a, b) => b.rows - a.rows).slice(0, 60),
    errors: errors.length > 0 ? errors.slice(0, 10) : undefined,
  });
}
