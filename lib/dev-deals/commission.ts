/**
 * 중개 수수료(매칭 커미션) 기준 산정.
 *
 * 표기 수수료는 "기준(협의 가능)" 이며 사업 규모·조건에 따라 협의된다.
 * 실제 계약·정산은 당사자 간에 이뤄지고, 누구집은 소개·매칭만 담당한다.
 */

export interface CommissionTier {
  /** 구간 하한(원, 포함) */
  minKrw: number;
  /** 구간 상한(원, 미만). null 이면 상한 없음 */
  maxKrw: number | null;
  /** 구간 라벨 (예: "50억 ~ 200억") */
  label: string;
  /** 요율(소수). null 이면 정률 없음(성사 시 협의) */
  rate: number | null;
  /** 요율 표기 (예: "0.9%") */
  rateText: string;
}

/** 기준 수수료 구간 (협의 가능). 사업비(총사업비, 원) 기준. */
export const COMMISSION_TIERS: CommissionTier[] = [
  { minKrw: 0, maxKrw: 5e9, label: "50억 미만", rate: null, rateText: "성사 시 협의" },
  { minKrw: 5e9, maxKrw: 2e10, label: "50억 ~ 200억", rate: 0.009, rateText: "0.9%" },
  { minKrw: 2e10, maxKrw: 5e10, label: "200억 ~ 500억", rate: 0.007, rateText: "0.7%" },
  { minKrw: 5e10, maxKrw: 1e11, label: "500억 ~ 1,000억", rate: 0.005, rateText: "0.5%" },
  { minKrw: 1e11, maxKrw: null, label: "1,000억 이상", rate: 0.003, rateText: "0.3%" },
];

/** 이 요율 안내가 "기준(협의 가능)" 임을 알리는 공통 라벨 */
export const COMMISSION_BASIS_LABEL = "기준 수수료(협의 가능)";

export interface CommissionEstimate {
  /** 해당 구간 라벨 */
  tierLabel: string;
  /** 요율 표기 (정률 없으면 "성사 시 협의") */
  rateText: string;
  /** 예상 수수료(원). 정률 구간이 아니면 null */
  estimatedKrw: number | null;
}

/**
 * 총사업비(원) → 기준 예상 중개수수료.
 * 사업비가 없거나(협의 대상) 50억 미만이면 estimatedKrw = null(성사 시 협의).
 */
export function estimateCommission(totalCostKrw: number | null): CommissionEstimate {
  if (
    totalCostKrw == null ||
    !Number.isFinite(totalCostKrw) ||
    totalCostKrw <= 0
  ) {
    return { tierLabel: "사업비 미정", rateText: "성사 시 협의", estimatedKrw: null };
  }
  const tier =
    COMMISSION_TIERS.find(
      (t) =>
        totalCostKrw >= t.minKrw && (t.maxKrw === null || totalCostKrw < t.maxKrw),
    ) ?? COMMISSION_TIERS[COMMISSION_TIERS.length - 1]!;
  const estimatedKrw = tier.rate != null ? Math.round(totalCostKrw * tier.rate) : null;
  return { tierLabel: tier.label, rateText: tier.rateText, estimatedKrw };
}
