import { getBaseRate } from "@/lib/market/base-rate";
import { getMortgageRates } from "@/lib/finance/mortgage-rates";
import ScenarioClient, { type RateContext } from "./ScenarioClient";

/* 서버 래퍼 — 실공시 금리(한국은행 기준금리 · 금감원 주담대)를 읽어 계산기에 넘긴다.
   둘 다 24h 캐시(public_data_cache) 위라 조회 비용이 작고, 실패하면 null 로 떨어져
   화면은 참고 블록만 감춘다(사실 우선 — 지어낸 금리를 기본값으로 쓰지 않는다).
   메타데이터·noIndex 는 layout.tsx 가 담당한다. */
export const revalidate = 3600;

/** "3.62~5.13%" | "3.62%" | "-" → 대표값(범위면 중간값). 숫자가 없으면 null. */
function parseRange(s: string): number | null {
  const nums = (s.match(/\d+\.?\d*/g) ?? []).map(Number).filter((n) => Number.isFinite(n));
  if (nums.length === 0) return null;
  if (nums.length === 1) return nums[0];
  return (nums[0] + nums[1]) / 2;
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export default async function ScenarioPage() {
  const [policy, mortgage] = await Promise.all([
    getBaseRate().catch(() => null),
    getMortgageRates().catch(() => null),
  ]);

  // 은행별 변동금리 범위의 중간값 → 그 중앙값을 "시중 주담대 변동 중앙값"으로.
  const midpoints = (mortgage?.rates ?? [])
    .map((r) => parseRange(r.variable))
    .filter((n): n is number => n != null);
  const mortgageMedian = mortgage?.live ? median(midpoints) : null;

  const rates: RateContext = {
    policy: policy ? { label: policy.label, value: policy.value, cycle: policy.cycle } : null,
    mortgageMedian,
    mortgageSource: mortgage?.live ? mortgage.source : null,
    mortgageAsOf: mortgage?.live ? mortgage.asOf : null,
  };

  return <ScenarioClient rates={rates} />;
}
