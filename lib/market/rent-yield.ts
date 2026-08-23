import "server-only";

import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/log";

/* [#94 잔여] 지역별 월세 환산 수익률 재료 — region_rent_yield_summary RPC(1회 호출).
 * RPC 는 최근 3개월 전월세 신고를 region_name 별로 묶어 중앙값·건수를 돌려준다.
 * 여기서는 그 결과를 "이름 후보 → 값" 맵으로 바꿔, 스냅샷 지역명("강남구"/"평택시")과
 * 실거래 지역명("서울 강남구"/"평택시")의 표기 차이를 흡수한다
 * (lib/market/store.transactionNameCandidates 와 같은 규칙의 역방향). */

export type RegionRentYieldRow = {
  jeonseCount: number;
  jeonseMedianDepositKrw: number | null;
  wolseCount: number;
  wolseMedianDepositKrw: number | null;
  wolseMedianMonthlyKrw: number | null;
};

export type RegionRentYieldMap = Map<string, RegionRentYieldRow>;

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * region_name(원본 표기) 키의 맵. 못 읽으면 throw — 호출부가 접는다.
 * 표기 변형("서울 강남구" → "강남구")도 함께 키로 넣어 조회를 단순화한다.
 * (충돌 가능성: "중구"류 축약이 서울·인천 양쪽에서 나올 수 있어, 축약 키는
 *  이미 있으면 덮어쓰지 않는다 — 원본 표기 키는 항상 정확하다.)
 */
export async function getRegionRentYieldMap(): Promise<RegionRentYieldMap> {
  const sb = getServiceSupabase();
  if (!sb) return new Map();
  const { data, error } = await sb.rpc("region_rent_yield_summary", { p_months: 3 });
  if (error) {
    logger.error("[rent-yield] RPC 조회 실패", error);
    throw new Error(`region_rent_yield_summary 실패: ${error.message}`);
  }
  const map: RegionRentYieldMap = new Map();
  for (const r of (data ?? []) as Array<Record<string, unknown>>) {
    const name = String(r.region_name ?? "").trim();
    if (!name) continue;
    const row: RegionRentYieldRow = {
      jeonseCount: Number(r.jeonse_count) || 0,
      jeonseMedianDepositKrw: num(r.jeonse_median_deposit_krw),
      wolseCount: Number(r.wolse_count) || 0,
      wolseMedianDepositKrw: num(r.wolse_median_deposit_krw),
      wolseMedianMonthlyKrw: num(r.wolse_median_monthly_krw),
    };
    map.set(name, row);
    // "서울 강남구" → "강남구" 축약 키 (있으면 보존 — 원본 표기가 항상 우선)
    const short = name.replace(/^(서울|인천)\s+/, "");
    if (short !== name && !map.has(short)) map.set(short, row);
    // "고양 덕양구" → "고양시 덕양구" 복원 키
    if (/^[^\s]+ [^\s]+구$/.test(name) && !name.startsWith("서울") && !name.startsWith("인천")) {
      const restored = name.replace(" ", "시 ");
      if (!map.has(restored)) map.set(restored, row);
    }
  }
  return map;
}

/**
 * 월세 환산 수익률(연, %) — (월세 중앙값 × 12) ÷ (평균 매매가 − 월세 보증금 중앙값).
 * 표본 30건 미만·분모 0 이하면 null (지역 평균 매매가와 단지 혼합 중앙값의 결합이라
 * 어디까지나 참고 지표 — 표본이 얇으면 아예 만들지 않는다).
 */
export function rentYieldPct(
  avgSaleKrw: number | undefined,
  row: RegionRentYieldRow | undefined,
): number | null {
  if (!avgSaleKrw || avgSaleKrw <= 0 || !row) return null;
  if (row.wolseCount < 30) return null;
  const monthly = row.wolseMedianMonthlyKrw;
  const deposit = row.wolseMedianDepositKrw ?? 0;
  if (!monthly || monthly <= 0) return null;
  const base = avgSaleKrw - deposit;
  if (base <= 0) return null;
  return ((monthly * 12) / base) * 100;
}
