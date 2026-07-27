/**
 * 국토교통부 실거래가(RTMS) → `market_transactions` 적재.
 *
 * 배경(사실 우선): 기존 `molit-transactions-ingest` 크론은 운영 DB에 존재하지 않는
 * `complexes` 테이블을 조회하고 no-op 인 `upsertTransactions()` 를 호출해 매번
 * `{processed:0, reason:"no complexes in DB"}` 만 반환했다 — 즉 실질적으로 죽은 경로였다.
 * 실거래 실데이터는 `market_transactions`(source='MOLIT') 에 있으므로 이 모듈이
 * 같은 스키마로 직접 적재한다.
 *
 * 중복 안전장치: 플랫폼 ETL 이 이미 채운 (region_code, contract_ym) 조합은 건너뛴다.
 * 해시 레시피가 서로 달라 external_key 가 겹치지 않으므로, 같은 구·같은 달을 다시
 * 넣으면 거래 건수·평균가 집계가 이중 계상된다. 따라서 "비어 있는 구·월"만 채운다.
 * → 결과적으로 전국 미커버 시군구/최신월을 넓히는 방향으로만 동작한다.
 */
import { createHash } from "node:crypto";
import { getServiceSupabase } from "@/lib/supabase/service";
import { fetchMolitDeals, type MolitDeal, type MolitRtmsType } from "@/lib/national-data/molit-api";
import { getSigunguInfo, getAllSido, getSigunguBySido, type SigunguInfo } from "@/lib/national-data/region-codes";
import { logIngest } from "@/lib/market/store";
import { refreshMarketAggregates, type RefreshAggregatesResult } from "@/lib/market/refresh-aggregates";
import { logger } from "@/lib/log";

/** 1평 = 3.305785㎡ */
const M2_PER_PYEONG = 3.305785;

/**
 * 적재 대상 유형.
 *
 * ── 왜 아파트만 켜져 있나 (2026-07-27) ──────────────────────────────────────
 * 국토부 API 는 오피스텔·연립다세대도 준다(lib/national-data/molit-api.ts 의
 * RTMS_TYPES 에 이미 있다). 그런데 켜기 전에 두 가지가 먼저 필요했다.
 *
 *  1) 집계가 유형을 구분해야 한다. 어제까지 map_price_point_mv·complex_tx_stats·
 *     tx_band_* 는 property_type 조건이 **없었다**. 그 상태로 오피스텔을 넣으면
 *     지도 색상·평단가·"평균 매매가"가 아파트와 오피스텔을 섞어 평균 낸다.
 *     화면 어디에도 안 드러나고 숫자만 그럴듯하게 틀린다.
 *     → 마이그레이션 20260727150000 에서 다섯 집계에 조건을 명시했다.
 *  2) 화면에 유형 선택이 있어야 한다. 없으면 데이터를 넣어도 아무도 못 본다.
 *     지도 필터의 "유형"은 아직 아파트 단일이다.
 *
 *  (1)은 끝났고 (2)는 남았다. 그래서 수집만 먼저 켤 수 있게 스위치를 둔다 —
 *  국토부 API 는 과거 월을 되짚어 주긴 하지만 지금부터 쌓아 두면 나중에 화면이
 *  붙는 날 바로 보여 줄 수 있다.
 *
 * ── 켜는 법 ─────────────────────────────────────────────────────────────────
 * 환경변수 `MOLIT_PROPERTY_TYPES` (쉼표 구분, 기본 "apartment"):
 *   apartment            아파트 매매·전월세      (기본)
 *   officetel            오피스텔 매매·전월세
 *   rowhouse             연립다세대 매매
 * 예) MOLIT_PROPERTY_TYPES=apartment,officetel
 *
 * 켜기 전에 알아 둘 것: 유형 하나당 시군구 253개 × 월 1회 왕복이 그대로 늘고,
 * market_transactions 행 수도 함께 늘어난다. DB 용량·ETL 시간에 직접 영향이 있다
 * (2026-07-27 에 Nano 티어가 데이터 증가로 응답 불능이 된 전례가 있다).
 */
type TargetType = {
  type: MolitRtmsType;
  transactionType: "trade" | "rent";
  /** market_transactions.property_type 에 그대로 들어간다 — 집계가 이 값으로 유형을 가른다 */
  propertyType: string;
};

const ALL_TARGET_TYPES: Record<string, TargetType[]> = {
  apartment: [
    { type: "apt-sale", transactionType: "trade", propertyType: "apartment" },
    { type: "apt-rent", transactionType: "rent", propertyType: "apartment" },
  ],
  officetel: [
    { type: "offi-sale", transactionType: "trade", propertyType: "officetel" },
    { type: "offi-rent", transactionType: "rent", propertyType: "officetel" },
  ],
  rowhouse: [{ type: "rh-sale", transactionType: "trade", propertyType: "rowhouse" }],
};

/**
 * 이번 실행에서 수집할 유형 목록.
 *
 * 알 수 없는 값은 조용히 무시하지 않고 경고로 남긴다 — 오타 하나로 오피스텔이
 * 안 쌓이고 있는데 아무도 모르는 상황을 만들지 않기 위해서다.
 */
export function resolveTargetTypes(): TargetType[] {
  const raw = (process.env.MOLIT_PROPERTY_TYPES ?? "apartment").trim();
  const keys = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const out: TargetType[] = [];
  const seen = new Set<string>();
  for (const k of keys) {
    const group = ALL_TARGET_TYPES[k];
    if (!group) {
      logger.warn(
        `[molit] MOLIT_PROPERTY_TYPES 에 모르는 값이 있어 건너뜁니다: "${k}" (가능: ${Object.keys(ALL_TARGET_TYPES).join(", ")})`,
      );
      continue;
    }
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(...group);
  }
  // 전부 알 수 없는 값이면 아무것도 안 쌓이는 것보다 기본값이 낫다.
  return out.length > 0 ? out : ALL_TARGET_TYPES.apartment;
}

/**
 * 시군구 정보 → market_transactions.region_name 표기.
 * "서울특별시"+"종로구" → "서울 종로구" · "수원시 영통구" → "수원 영통구" · "광명시" → "광명시"
 * (기존 적재 데이터의 표기 규칙과 동일하게 맞춘다)
 */
export function molitRegionLabel(info: SigunguInfo): string {
  const sigungu = info.sigungu.trim();
  if (sigungu.includes(" ")) return sigungu.replace(/시\s/, " ");
  if (/(특별시|광역시)$/.test(info.sido)) {
    return `${info.sido.replace(/(특별시|광역시)$/, "")} ${sigungu}`;
  }
  return sigungu;
}

/**
 * 구(區)를 가진 시의 **상위 코드** — RTMS 가 한 번도 응답한 적이 없다.
 *
 * 실측(2026-07-27): 이 12개 코드로 적재된 market_transactions 는 전부 0건인데,
 * 각 시의 하위 구 코드에는 거래가 다 들어와 있다 — 수원 22,866건(41111·41113·
 * 41115·41117), 용인 20,029건, 고양 18,115건, 청주 14,446건, 창원 14,320건,
 * 천안 12,883건, 성남 12,691건, 안양 10,311건, 부천 10,246건, 전주 9,051건,
 * 안산 6,837건, 포항 6,670건. 국토교통부 실거래가 API 는 자치구가 있는 시에
 * 대해서는 구 단위 코드로만 답한다.
 *
 * 그래서 이 12개를 대상에서 빼도 **빠지는 거래는 0건**이고, 매 실행 왕복만
 * 12번(유형 2종이므로 호출 24번) 줄어든다. 하위 구 코드는 그대로 남는다 —
 * 위 목록이 그 근거다. 코드를 지우는 게 아니라 수집 대상에서만 빼므로,
 * 나중에 상위 코드가 응답하기 시작하면 이 상수만 비우면 된다.
 *
 * (legal_regions.enabled 로도 같은 13개를 꺼 뒀지만 그 컬럼은 어느 코드도
 *  읽지 않는다 — 기록용이다. 실제로 호출을 줄이는 건 이 목록이다.)
 */
const MOLIT_PARENT_ONLY_CODES = new Set([
  "41110", // 경기 수원시
  "41130", // 경기 성남시
  "41170", // 경기 안양시
  "41190", // 경기 부천시
  "41270", // 경기 안산시
  "41280", // 경기 고양시
  "41460", // 경기 용인시
  "43110", // 충북 청주시
  "44130", // 충남 천안시
  "47110", // 경북 포항시
  "48120", // 경남 창원시
  "52110", // 전북 전주시
]);

/** 전국 시군구 코드(자치구 단위) — 앞자리 코드순 */
export function listMolitSigungu(): SigunguInfo[] {
  return getAllSido()
    .flatMap(getSigunguBySido)
    .filter(
      (i) =>
        i.sigungu !== i.sido &&
        !i.sigunguCd.endsWith("000") &&
        !MOLIT_PARENT_ONLY_CODES.has(i.sigunguCd),
    )
    .sort((a, b) => a.sigunguCd.localeCompare(b.sigunguCd));
}

function pricePerPyeong(amountKrw: number | null, areaM2: number | null): number | null {
  if (!amountKrw || !areaM2 || areaM2 <= 0) return null;
  const pyeong = areaM2 / M2_PER_PYEONG;
  if (pyeong <= 0) return null;
  return Math.round(amountKrw / pyeong);
}

function manwonToKrw(v: number | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) ? Math.round(v * 10000) : null;
}

/**
 * 해제(취소)된 계약인가.
 *
 * RTMS 매매 응답은 정상 거래에 cdealType=" "(공백 한 칸), 해제신고된 계약에
 * cdealType="O" 와 해제사유발생일(cdealDay, 예 "26.07.10")을 준다. 전월세 응답에는
 * 두 필드가 아예 없다.
 *
 * 이 값을 그동안 raw 에 담기만 하고 아무도 보지 않았다. 그 결과 2026-07-25 기준
 * 매매 22,869행 중 402행(1.76%)의 "없던 일이 된 계약"이 평균가·구간집계·지도
 * 시세·알림가에 정상 거래로 섞여 있었다(361개 단지 영향, 그중 33개 단지는 실거래가
 * 전부 해제분이라 존재 근거 자체가 해제된 계약뿐이었다). — #150
 */
export function isCancelledDeal(raw: Record<string, unknown> | null | undefined): boolean {
  const type = String(raw?.cdealType ?? "").trim();
  if (type.toUpperCase() === "O") return true;
  // cdealType 이 비어도 해제일자가 찍혀 오는 응답이 있어 함께 본다(보수적 판정).
  return String(raw?.cdealDay ?? "").trim().length > 0;
}

/** 거래 1건 → market_transactions row. 필수값(계약일·단지명) 없으면 null. */
function toRow(
  deal: MolitDeal,
  ctx: {
    info: SigunguInfo;
    regionName: string;
    yyyymm: string;
    kind: "trade" | "rent";
    type: MolitRtmsType;
    propertyType: string;
  },
): Record<string, unknown> | null {
  const day = Number(deal.dealDate.slice(8, 10));
  if (!deal.dealDate || !Number.isFinite(day) || day <= 0) return null;
  const name = (deal.name ?? "").trim();
  if (!name) return null;

  const dealKrw = manwonToKrw(deal.dealManwon);
  const depositKrw = manwonToKrw(deal.depositManwon);
  const monthlyKrw = manwonToKrw(deal.monthlyManwon);
  if (ctx.kind === "trade" && !dealKrw) return null;
  if (ctx.kind === "rent" && !depositKrw) return null;

  const areaM2 = typeof deal.areaM2 === "number" && deal.areaM2 > 0 ? deal.areaM2 : null;
  const jibun = (deal.raw.jibun ?? "").trim();
  const umd = (deal.umd ?? "").trim();
  const address = [ctx.info.sigungu, umd, jibun].filter(Boolean).join(" ") || null;

  // external_key — 플랫폼 ETL(40자리 sha1 hex)과 절대 충돌하지 않도록 접두사를 둔다.
  const digest = createHash("sha1")
    .update(
      [ctx.type, ctx.info.sigunguCd, ctx.yyyymm, name, umd, jibun, areaM2 ?? "", deal.floor ?? "", day, dealKrw ?? depositKrw ?? "", monthlyKrw ?? ""].join("|"),
    )
    .digest("hex");

  return {
    external_key: `molit-cron:${digest}`,
    source: "MOLIT",
    transaction_type: ctx.kind,
    /* 예전엔 "apartment" 로 고정돼 있었다. 오피스텔·연립다세대를 켜면 그 거래까지
       아파트로 적재돼, 유형을 구분하는 집계가 있어도 소용이 없었다. */
    property_type: ctx.propertyType,
    region_code: ctx.info.sigunguCd,
    region_name: ctx.regionName,
    complex_name: name,
    address,
    contract_ym: ctx.yyyymm,
    contract_day: day,
    deal_amount_krw: dealKrw,
    deposit_krw: depositKrw,
    monthly_rent_krw: monthlyKrw,
    area_m2: areaM2,
    floor: Number.isFinite(deal.floor) ? deal.floor : null,
    build_year: Number.isFinite(deal.buildYear) ? deal.buildYear : null,
    price_per_pyeong_krw: pricePerPyeong(ctx.kind === "trade" ? dealKrw : depositKrw, areaM2),
    // 해제분도 행 자체는 남긴다(해제 이력도 사실이다). 다만 시세·집계·알림에서는
    // is_cancelled=true 로 걸러진다 — 판정은 적재 시 한 번만 한다.
    is_cancelled: isCancelledDeal(deal.raw),
    raw: deal.raw,
    collected_at: new Date().toISOString(),
  };
}

export interface MolitIngestResult {
  ok: boolean;
  configured: boolean;
  yyyymm: string;
  /** 이번 실행이 처리한 시군구 슬라이스 인덱스 */
  slice: number;
  sliceSize: number;
  totalSigungu: number;
  /** 실제 API 호출·적재를 시도한 시군구 수 */
  attempted: number;
  /** 이미 데이터가 있어 건너뛴 시군구 수 */
  alreadyCovered: number;
  /** 적재된 행 수 */
  inserted: number;
  /** API 가 0건을 반환한 시군구 수 */
  empty: number;
  errors: number;
  /**
   * DB 연속 오류로 남은 시군구를 처리하지 못하고 중단했는가.
   *
   * true 면 이 실행은 "슬라이스를 다 돌았는데 데이터가 없었다" 가 아니라
   * "확인하지 못한 채 멈췄다" 는 뜻이다. 두 상태를 섞으면 다음 실행이
   * "이미 봤다" 고 착각한다.
   */
  aborted: boolean;
  regions: { code: string; name: string; rows: number; status: "inserted" | "covered" | "empty" | "error" }[];
  reason?: string;
  /**
   * 적재 후 실거래 집계 MV 재계산 결과.
   * 적재된 행이 0이면 집계가 달라질 수 없어 호출하지 않는다(= undefined).
   */
  aggregates?: RefreshAggregatesResult;
}

/** 기본 대상 월 — 전달(yyyymm) */
export function defaultTargetMonth(now = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * 시군구 슬라이스 단위 실거래 적재.
 *
 * @param opts.yyyymm     대상 계약월(기본: 전달)
 * @param opts.sliceSize  1회 실행에서 처리할 시군구 수(기본 16)
 * @param opts.slice      슬라이스 인덱스(기본: 12시간 창 기준 자동 회전)
 * @param opts.codes      특정 시군구 코드만 처리(수동 실행용)
 */
export async function ingestMolitTransactions(opts: {
  yyyymm?: string;
  sliceSize?: number;
  slice?: number;
  codes?: string[];
  now?: Date;
} = {}): Promise<MolitIngestResult> {
  const now = opts.now ?? new Date();
  const yyyymm = (opts.yyyymm ?? defaultTargetMonth(now)).replace(/[^0-9]/g, "").slice(0, 6);
  const all = listMolitSigungu();
  const sliceSize = Math.max(1, Math.min(60, opts.sliceSize ?? 16));
  /* 수집 유형은 실행마다 환경변수로 정해진다(기본 아파트). 왜 스위치로 뒀는지는
     ALL_TARGET_TYPES 위 주석 참고. */
  const targetTypes = resolveTargetTypes();
  logger.info(
    `[molit] ${yyyymm} 수집 유형: ${targetTypes.map((t) => t.type).join(", ")}`,
  );

  const base: Omit<MolitIngestResult, "ok" | "reason"> = {
    configured: true,
    yyyymm,
    slice: 0,
    sliceSize,
    totalSigungu: all.length,
    attempted: 0,
    alreadyCovered: 0,
    inserted: 0,
    empty: 0,
    errors: 0,
    aborted: false,
    regions: [],
  };

  const sb = getServiceSupabase();
  if (!sb) {
    return { ...base, ok: false, configured: false, reason: "Supabase 미설정" };
  }

  let targets: SigunguInfo[];
  let sliceIdx = 0;
  if (opts.codes?.length) {
    targets = opts.codes
      .map((c) => getSigunguInfo(c.trim()))
      .filter((i): i is SigunguInfo => Boolean(i))
      .slice(0, 60);
  } else {
    const windows = Math.max(1, Math.ceil(all.length / sliceSize));
    sliceIdx = opts.slice ?? Math.floor(now.getTime() / (1000 * 60 * 60 * 12)) % windows;
    targets = all.slice(sliceIdx * sliceSize, sliceIdx * sliceSize + sliceSize);
  }

  const result: MolitIngestResult = { ...base, ok: true, slice: sliceIdx };

  /* 첫 오류의 실제 메시지. 2026-07-25 장애 때 적재 로그에는 "오류=13"이라는 숫자만
     남아 있어서, 원인(legal_regions FK 위반)을 찾으려면 Postgres 로그를 뒤져야 했다 —
     Vercel 런타임 로그는 보존 기간이 짧아 이미 사라진 뒤였다. 로그는 "몇 개 실패"가
     아니라 "왜 실패"까지 남아야 다음 사람이 같은 삽질을 반복하지 않는다. */
  let firstError: string | null = null;

  /* 연속 DB 오류 차단기 ───────────────────────────────────────────────────
     2026-07-26, 무료 플랜 DB 가 디스크 I/O 로 막혀 PostgREST 가 사실상 모든
     요청에 503 을 내는 동안, 이 루프는 두 시간 넘게 시군구를 끝까지 돌며
     HEAD·POST 를 계속 쐈다. 적재된 행은 0이었고, 그 부하 자체가 DB 회복을
     막았다(= 배포까지 같이 멈췄다).

     DB 가 연속으로 죽어 있으면 남은 시군구도 같은 답을 받는다. 계속 두드려서
     얻는 것은 없고 잃는 것만 있다 — 조기에 멈추고 "중단했다" 고 보고하는 편이
     사실에 가깝고 DB 에도 숨통을 준다. 성공하면 카운터는 0으로 돌아가므로
     간헐적 오류로는 멈추지 않는다. */
  const DB_ERROR_ABORT_THRESHOLD = 5;
  let consecutiveDbErrors = 0;
  let aborted = false;

  /** DB 오류 1건 기록. 차단 임계에 닿으면 true(= 루프를 끊어라)를 돌려준다. */
  async function noteDbFailure(info: SigunguInfo, regionName: string, msg: string): Promise<boolean> {
    consecutiveDbErrors += 1;
    result.errors += 1;
    result.regions.push({ code: info.sigunguCd, name: regionName, rows: 0, status: "error" });
    firstError ??= `${info.sigunguCd}: ${msg}`;
    logger.warn("[molit-tx]", info.sigunguCd, msg);
    if (consecutiveDbErrors >= DB_ERROR_ABORT_THRESHOLD) return true;
    /* 흔들리는 DB 에 곧바로 다음 요청을 얹지 않는다 — 연속 실패마다 물러선다. */
    await new Promise((r) => setTimeout(r, 1_000 * consecutiveDbErrors));
    return false;
  }

  for (const info of targets) {
    const regionName = molitRegionLabel(info);
    try {
      // 이미 플랫폼 ETL 이 채운 구·월이면 건너뜀 (이중 계상 방지)
      const { count, error: coverageError } = await sb
        .from("market_transactions")
        .select("id", { count: "exact", head: true })
        .eq("region_code", info.sigunguCd)
        .eq("contract_ym", yyyymm);
      /* 조회 실패를 "아직 안 채워졌다" 로 바꾸지 않는다. 여기서 그냥 진행하면
         이미 채운 달을 MOLIT 에서 다시 받아 다시 upsert 한다 — 실패한 DB 를
         더 두드리면서, 확인도 못 한 채. 못 읽었으면 못 읽었다고 센다. */
      if (coverageError) {
        if (await noteDbFailure(info, regionName, `기존 적재 여부 확인 실패 — ${coverageError.message}`)) {
          aborted = true;
          break;
        }
        continue;
      }
      consecutiveDbErrors = 0;
      if ((count ?? 0) > 0) {
        result.alreadyCovered += 1;
        result.regions.push({ code: info.sigunguCd, name: regionName, rows: count ?? 0, status: "covered" });
        continue;
      }

      result.attempted += 1;
      const rows: Record<string, unknown>[] = [];
      let mode: "live" | "mock" = "mock";
      for (const t of targetTypes) {
        const res = await fetchMolitDeals(t.type, {
          lawdCd: info.sigunguCd, // 이름 매칭 금지 — 동명이구 오적재 방지 (아래 커밋 메시지 참고)
          district: info.sigungu,
          yyyymm,
          numOfRows: 1000,
        });
        if (res.mode === "live") mode = "live";
        for (const deal of res.deals) {
          const row = toRow(deal, {
            info,
            regionName,
            yyyymm,
            kind: t.transactionType,
            type: t.type,
            propertyType: t.propertyType,
          });
          if (row) rows.push(row);
        }
      }

      if (mode !== "live") {
        // 인증키 미설정/응답 실패 — 조용히 종료(가짜 데이터 생성 금지)
        result.configured = false;
        result.regions.push({ code: info.sigunguCd, name: regionName, rows: 0, status: "empty" });
        result.empty += 1;
        continue;
      }
      if (rows.length === 0) {
        result.empty += 1;
        result.regions.push({ code: info.sigunguCd, name: regionName, rows: 0, status: "empty" });
        continue;
      }

      // external_key 중복 제거 후 upsert
      const dedup = new Map<string, Record<string, unknown>>();
      for (const r of rows) dedup.set(String(r.external_key), r);
      const payload = [...dedup.values()];

      const { error } = await sb
        .from("market_transactions")
        .upsert(payload, { onConflict: "external_key" });
      if (error) {
        if (await noteDbFailure(info, regionName, error.message)) {
          aborted = true;
          break;
        }
        continue;
      }
      consecutiveDbErrors = 0;
      result.inserted += payload.length;
      result.regions.push({ code: info.sigunguCd, name: regionName, rows: payload.length, status: "inserted" });
    } catch (e) {
      result.errors += 1;
      result.regions.push({ code: info.sigunguCd, name: regionName, rows: 0, status: "error" });
      const msg = e instanceof Error ? e.message : String(e);
      firstError ??= `${info.sigunguCd}: ${msg}`;
      logger.warn("[molit-tx]", info.sigunguCd, msg);
    }

    // data.go.kr rate limit 여유
    await new Promise((r) => setTimeout(r, 150));
  }

  result.aborted = aborted;
  result.ok = result.errors === 0;
  if (aborted) {
    /* "슬라이스를 다 봤다" 와 구분되게 이유를 남긴다 — 남은 시군구는 미확인이다. */
    result.reason =
      `데이터베이스 오류가 ${DB_ERROR_ABORT_THRESHOLD}회 연속이라 중단했습니다. ` +
      `남은 시군구(${Math.max(0, targets.length - result.regions.length)}곳)는 확인하지 못했습니다 — ` +
      `적재 완료가 아니라 중단입니다.` +
      (firstError ? ` 첫오류=${firstError.slice(0, 200)}` : "");
  }

  // 새 실거래가 들어왔을 때만 집계 MV 를 다시 계산한다.
  // (`/tx` 랜딩과 지도 시세 색상이 이 집계를 읽는다. 갱신하지 않으면 새로 적재한
  //  거래가 화면에 영영 반영되지 않는다.)
  // 적재 0건이면 집계 결과가 바뀔 수 없으므로 8초짜리 재계산을 건너뛴다.
  // 갱신이 실패해도 적재 자체는 이미 성공했으므로 result.ok 를 뒤집지 않는다.
  /* 중단했으면 재계산도 하지 않는다. DB 가 죽어 있는 판에 8초짜리 MV 재계산을
     얹으면 회복만 늦추고, 어차피 실패한다. */
  if (result.inserted > 0 && !aborted) {
    result.aggregates = await refreshMarketAggregates();
  }

  await logIngest({
    source: "molit",
    dataset: `아파트 매매·전월세 실거래 ${yyyymm}`,
    origin: "cron-fetch",
    rows: result.inserted,
    status: result.errors > 0 ? "error" : result.inserted > 0 ? "ok" : "skipped",
    message:
      `slice=${result.slice} 시도=${result.attempted} 기존커버=${result.alreadyCovered} 빈응답=${result.empty} 오류=${result.errors}` +
      (aborted ? ` 중단=DB오류${DB_ERROR_ABORT_THRESHOLD}회연속(남은 시군구 미확인)` : "") +
      (firstError ? ` 첫오류=${firstError.slice(0, 300)}` : ""),
  });

  return result;
}
