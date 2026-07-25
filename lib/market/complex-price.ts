import "server-only";
/**
 * #150 — 단지 "현재가" 산출 (관심단지 가격 알림용 단일 진실 공급원).
 *
 * ── 왜 새로 만들었나 ────────────────────────────────────────────────
 * 기존 price-alerts 크론은 `complex_transactions` 테이블의 최근월 **전면적 평균가**를
 * 현재가로 썼다. 그 테이블은 운영 DB에 존재하지 않아 조회가 항상 null → 알림이
 * 한 건도 나가지 않는 죽은 경로였다(#150).
 *
 * 그런데 이걸 그대로 `market_transactions` 로 옮기면 **지금보다 나빠진다.**
 * "최근월 전면적 평균" 은 단지의 가격이 아니라 그 달에 우연히 팔린 **평형 구성**을
 * 재는 값이기 때문이다. 실측(2026-07-25, 운영 DB):
 *   - 리센츠(서울 송파구): 202607 은 거래 1건 35.00억, 202606 은 18건 평균 28.27억.
 *     그대로 비교하면 **+23.8% 상승** 알림이 나간다. 실제로는 큰 평형 한 채가
 *     팔렸을 뿐 아무것도 오르지 않았다.
 *   - 전체 5,412개 단지 중 3,095개(57%)가 최근월 거래가 정확히 1건, 4,259개(79%)가
 *     3건 미만. 1% 임계에서 2,252건이 발화하고 그중 841건은 "10% 이상 변동"을
 *     주장한다. 전부 평형 구성 아티팩트다.
 * 알림은 "틀려도 조용한" 실패가 아니라 사용자 휴대폰으로 나가는 사실 주장이다.
 * 그래서 옮기기 전에 **혼합(mix) 통제**를 먼저 넣는다.
 *
 * ── 산출 규칙 ───────────────────────────────────────────────────────
 *  1) 최근 실거래 최대 200건을 읽는다(오늘 한 단지 최대치는 57건 — 잘릴 일이 없다).
 *  2) 전용면적 구간(AREA_BANDS)별로 나눠 **거래가 가장 많은 구간**을 그 단지의
 *     대표 평형으로 삼는다(동수 시 좁은 구간 우선 — 결정적).
 *  3) 그 구간 안에서만 **최근 6건**의 평균을 낸다.
 *  4) 6건을 못 채워도 최소 3건은 있어야 한다. 미만이면 값을 만들지 않고 건너뛴다.
 *
 * 이 규칙으로 오늘 값이 나오는 단지는 5,412개 중 **2,205개(40.7%)** 다. 나머지
 * 59%는 "아직 판단할 근거가 없다" 가 사실이므로 알림하지 않는다. 데이터가
 * 202605~202607 석 달치뿐이라 그런 것이고, ETL 이 달을 쌓을수록 커진다.
 *
 * ── 호출부가 반드시 지켜야 할 것 ────────────────────────────────────
 * 대표 구간이 **바뀌면 직전 값과 비교하면 안 된다.** 59㎡ 평균과 84㎡ 평균의 차이는
 * 가격 변동이 아니다. 그래서 bandSlug 를 함께 돌려주고, 크론은 이를
 * user_watchlist.last_price_band 에 저장해 구간이 같을 때만 알림한다.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { getReadOnlySupabase } from "@/lib/newui/supabase-read";
import { decodeComplexId } from "@/lib/complex/complex-store";
import { AREA_BANDS, areaBandOf } from "@/lib/market/bands";
import { logger } from "@/lib/log";

/** 평균에 쓰는 최근 거래 건수 상한 */
export const PRICE_SAMPLE_SIZE = 6;
/** 이 건수 미만이면 값을 만들지 않는다 */
export const PRICE_MIN_SAMPLE = 3;
/** 한 단지에서 읽어 올 최대 행 수 — 실측 최대 57건이라 여유가 크다 */
const FETCH_LIMIT = 200;

/** 구간 정의 순서(좁은 면적 → 넓은 면적) — 동수 타이브레이커에 쓴다 */
const BAND_ORDER = new Map(AREA_BANDS.map((b, i) => [b.slug, i]));

export type ComplexPriceSkipReason =
  /** complex_id 가 base64url(region+name) 형식이 아니다 */
  | "unresolvable-id"
  /** Supabase 미설정 */
  | "no-store"
  /** 조회 실패 */
  | "query-failed"
  /** 이 단지의 매매 실거래가 없다 */
  | "no-trades"
  /** 대표 구간 거래가 PRICE_MIN_SAMPLE 미만 */
  | "thin-sample";

export interface ComplexPrice {
  /** 대표 구간 최근 거래 평균가(원) */
  priceKrw: number;
  /** 대표 구간 슬러그 — 직전 값과 비교 가능한지 판정하는 열쇠 */
  bandSlug: string;
  /** 화면 표기용 라벨 ("60~85㎡") */
  bandLabel: string;
  /** 평균에 실제로 들어간 건수 (PRICE_MIN_SAMPLE ~ PRICE_SAMPLE_SIZE) */
  sampleSize: number;
  /** 평균에 쓴 거래 중 가장 이른 계약월 */
  firstYm: string;
  /** 평균에 쓴 거래 중 가장 늦은 계약월 */
  latestYm: string;
}

export type ComplexPriceResult =
  | { ok: true; price: ComplexPrice }
  | { ok: false; reason: ComplexPriceSkipReason };

interface TxRow {
  contract_ym: string | null;
  contract_day: number | null;
  deal_amount_krw: number | string | null;
  area_m2: number | string | null;
}

function num(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n) ? n : null;
}

/**
 * 단지 식별자 → 현재가. 절대 throw 하지 않는다(크론에서 호출된다).
 *
 * @param complexId base64url(region_name + U+0001 + complex_name) — encodeComplexId 산출물
 * @param client    재사용할 Supabase 클라이언트(없으면 읽기 전용 클라이언트를 만든다)
 */
export async function resolveComplexPrice(
  complexId: string,
  client?: SupabaseClient | null,
): Promise<ComplexPriceResult> {
  const decoded = decodeComplexId(complexId);
  if (!decoded) return { ok: false, reason: "unresolvable-id" };

  const sb = client ?? getReadOnlySupabase();
  if (!sb) return { ok: false, reason: "no-store" };

  let rows: TxRow[];
  try {
    const { data, error } = await sb
      .from("market_transactions")
      .select("contract_ym, contract_day, deal_amount_krw, area_m2")
      .eq("complex_name", decoded.name)
      .eq("region_name", decoded.region)
      .eq("transaction_type", "trade")
      // 해제(취소)된 계약은 "있었던 거래"가 아니다 — 알림가에서 제외한다.
      // 실측(2026-07-25): 매매 22,869행 중 402행이 해제분이고, 그중 289행이
      // 어떤 단지의 상위 6건 표본 안에 들어와 277개 단지의 현재가를 오염시켰다.
      .eq("is_cancelled", false)
      .eq("property_type", "apartment")
      .gt("deal_amount_krw", 0)
      .not("area_m2", "is", null)
      .order("contract_ym", { ascending: false })
      .order("contract_day", { ascending: false, nullsFirst: false })
      .limit(FETCH_LIMIT);
    if (error) {
      logger.warn("[complex-price] 조회 실패", {
        complexId,
        message: error.message,
      });
      return { ok: false, reason: "query-failed" };
    }
    rows = (data ?? []) as TxRow[];
  } catch (e) {
    logger.warn("[complex-price] 조회 예외", { complexId, err: e });
    return { ok: false, reason: "query-failed" };
  }

  if (rows.length === 0) return { ok: false, reason: "no-trades" };

  /* 1) 구간별로 나눈다. 정렬은 SQL 이 이미 최신순으로 해 뒀으므로 각 버킷도 최신순이다. */
  const byBand = new Map<string, { ym: string; krw: number }[]>();
  for (const r of rows) {
    const band = areaBandOf(num(r.area_m2));
    const krw = num(r.deal_amount_krw);
    const ym = (r.contract_ym ?? "").trim();
    if (!band || krw === null || krw <= 0 || !ym) continue;
    const bucket = byBand.get(band.slug);
    if (bucket) bucket.push({ ym, krw });
    else byBand.set(band.slug, [{ ym, krw }]);
  }
  if (byBand.size === 0) return { ok: false, reason: "no-trades" };

  /* 2) 거래가 가장 많은 구간 = 대표 평형. 동수면 좁은 구간을 택한다(결정적 순서). */
  let repSlug = "";
  let repCount = -1;
  for (const [slug, bucket] of byBand) {
    const better =
      bucket.length > repCount ||
      (bucket.length === repCount &&
        (BAND_ORDER.get(slug) ?? 99) < (BAND_ORDER.get(repSlug) ?? 99));
    if (better) {
      repSlug = slug;
      repCount = bucket.length;
    }
  }

  /* 3) 대표 구간 안에서만 최근 N건 평균. 4) 표본이 얇으면 값을 만들지 않는다. */
  const sample = (byBand.get(repSlug) ?? []).slice(0, PRICE_SAMPLE_SIZE);
  if (sample.length < PRICE_MIN_SAMPLE) return { ok: false, reason: "thin-sample" };

  const priceKrw = Math.round(sample.reduce((s, x) => s + x.krw, 0) / sample.length);
  if (!Number.isFinite(priceKrw) || priceKrw <= 0) return { ok: false, reason: "thin-sample" };

  const yms = sample.map((x) => x.ym).sort();
  const band = AREA_BANDS.find((b) => b.slug === repSlug);

  return {
    ok: true,
    price: {
      priceKrw,
      bandSlug: repSlug,
      bandLabel: band?.label ?? repSlug,
      sampleSize: sample.length,
      firstYm: yms[0],
      latestYm: yms[yms.length - 1],
    },
  };
}
