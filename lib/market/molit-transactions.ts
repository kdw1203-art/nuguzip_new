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

/** 적재 대상 유형 — 아파트 매매/전월세 (기존 market_transactions 구성과 동일) */
const TARGET_TYPES: { type: MolitRtmsType; transactionType: "trade" | "rent" }[] = [
  { type: "apt-sale", transactionType: "trade" },
  { type: "apt-rent", transactionType: "rent" },
];

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

/** 전국 시군구 코드(자치구 단위) — 앞자리 코드순 */
export function listMolitSigungu(): SigunguInfo[] {
  return getAllSido()
    .flatMap(getSigunguBySido)
    .filter((i) => i.sigungu !== i.sido && !i.sigunguCd.endsWith("000"))
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

/** 거래 1건 → market_transactions row. 필수값(계약일·단지명) 없으면 null. */
function toRow(
  deal: MolitDeal,
  ctx: { info: SigunguInfo; regionName: string; yyyymm: string; kind: "trade" | "rent"; type: MolitRtmsType },
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
    property_type: "apartment",
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

  for (const info of targets) {
    const regionName = molitRegionLabel(info);
    try {
      // 이미 플랫폼 ETL 이 채운 구·월이면 건너뜀 (이중 계상 방지)
      const { count } = await sb
        .from("market_transactions")
        .select("id", { count: "exact", head: true })
        .eq("region_code", info.sigunguCd)
        .eq("contract_ym", yyyymm);
      if ((count ?? 0) > 0) {
        result.alreadyCovered += 1;
        result.regions.push({ code: info.sigunguCd, name: regionName, rows: count ?? 0, status: "covered" });
        continue;
      }

      result.attempted += 1;
      const rows: Record<string, unknown>[] = [];
      let mode: "live" | "mock" = "mock";
      for (const t of TARGET_TYPES) {
        const res = await fetchMolitDeals(t.type, {
          district: info.sigungu,
          yyyymm,
          numOfRows: 1000,
        });
        if (res.mode === "live") mode = "live";
        for (const deal of res.deals) {
          const row = toRow(deal, { info, regionName, yyyymm, kind: t.transactionType, type: t.type });
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
        result.errors += 1;
        result.regions.push({ code: info.sigunguCd, name: regionName, rows: 0, status: "error" });
        logger.warn("[molit-tx]", info.sigunguCd, error.message);
        continue;
      }
      result.inserted += payload.length;
      result.regions.push({ code: info.sigunguCd, name: regionName, rows: payload.length, status: "inserted" });
    } catch (e) {
      result.errors += 1;
      result.regions.push({ code: info.sigunguCd, name: regionName, rows: 0, status: "error" });
      logger.warn("[molit-tx]", info.sigunguCd, e instanceof Error ? e.message : String(e));
    }

    // data.go.kr rate limit 여유
    await new Promise((r) => setTimeout(r, 150));
  }

  result.ok = result.errors === 0;

  // 새 실거래가 들어왔을 때만 집계 MV 를 다시 계산한다.
  // (`/tx` 랜딩과 지도 시세 색상이 이 집계를 읽는다. 갱신하지 않으면 새로 적재한
  //  거래가 화면에 영영 반영되지 않는다.)
  // 적재 0건이면 집계 결과가 바뀔 수 없으므로 8초짜리 재계산을 건너뛴다.
  // 갱신이 실패해도 적재 자체는 이미 성공했으므로 result.ok 를 뒤집지 않는다.
  if (result.inserted > 0) {
    result.aggregates = await refreshMarketAggregates();
  }

  await logIngest({
    source: "molit",
    dataset: `아파트 매매·전월세 실거래 ${yyyymm}`,
    origin: "cron-fetch",
    rows: result.inserted,
    status: result.errors > 0 ? "error" : result.inserted > 0 ? "ok" : "skipped",
    message: `slice=${result.slice} 시도=${result.attempted} 기존커버=${result.alreadyCovered} 빈응답=${result.empty} 오류=${result.errors}`,
  });

  return result;
}
