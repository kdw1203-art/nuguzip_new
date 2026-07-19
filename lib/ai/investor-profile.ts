/**
 * AI 분석 워크벤치 개인화 프로필 (브라우저 localStorage).
 * 서버로 전송하지 않으며, 클라이언트에서 가중치·추천 문구에만 반영합니다.
 */

export const INVESTOR_PROFILE_KEY = "woodong_ai_investor_v1";

export type InvestorGoal = "live" | "invest" | "both";

export type InvestorProfile = {
  displayName: string;
  goal: InvestorGoal;
  /** 투자·거주 계획 기간 (년) */
  horizonYears: number;
  /** 예산 하한 (억 원) */
  budgetMinEok: number;
  /** 예산 상한 (억 원) */
  budgetMaxEok: number;
  /** 1(보수) ~ 5(공격) */
  riskTolerance: 1 | 2 | 3 | 4 | 5;
  /** 관심 자치구 코드 (예: gangnam) */
  preferredDistrictIds: string[];
  household: "1" | "2" | "3+";
  /** 월 상환 가능 추정액 (만원) — 대출 시뮬 가이드용 */
  monthlyRepayBudgetMan: number;
  /** 세대주 여부 (세금·대출 정책 가이드용 라벨) */
  isHouseholdHead: boolean;
  /** 관심 평형 (㎡) */
  preferredAreaSqm: number;
  /** 실거주 비중 0~100 (투자 vs 거주 혼합 시) */
  liveWeightPct: number;
  updatedAt: string;
};

export const DEFAULT_INVESTOR_PROFILE: InvestorProfile = {
  displayName: "",
  goal: "both",
  horizonYears: 7,
  budgetMinEok: 5,
  budgetMaxEok: 15,
  riskTolerance: 3,
  preferredDistrictIds: ["gangnam", "mapo", "songpa"],
  household: "2",
  monthlyRepayBudgetMan: 250,
  isHouseholdHead: true,
  preferredAreaSqm: 84,
  liveWeightPct: 40,
  updatedAt: new Date(0).toISOString(),
};

/** `useSyncExternalStore` 는 getSnapshot 이 값이 같을 때 동일 참조를 기대함 — 매번 새 객체를 만들면 React #185(무한 렌더) */
let investorSnapshotKey: string | null = null;
let investorSnapshot: InvestorProfile | null = null;

export function loadInvestorProfile(): InvestorProfile {
  if (typeof window === "undefined") return DEFAULT_INVESTOR_PROFILE;
  try {
    const raw = localStorage.getItem(INVESTOR_PROFILE_KEY);
    const key = raw ?? "";
    if (investorSnapshot && investorSnapshotKey === key) return investorSnapshot;
    if (!raw) {
      investorSnapshotKey = key;
      investorSnapshot = DEFAULT_INVESTOR_PROFILE;
      return DEFAULT_INVESTOR_PROFILE;
    }
    const j = JSON.parse(raw) as Partial<InvestorProfile>;
    const merged: InvestorProfile = {
      ...DEFAULT_INVESTOR_PROFILE,
      ...j,
      riskTolerance: clampRisk(j.riskTolerance),
      horizonYears: clamp(
        typeof j.horizonYears === "number" ? j.horizonYears : DEFAULT_INVESTOR_PROFILE.horizonYears,
        1,
        30,
      ),
      budgetMinEok: Math.max(0, Number(j.budgetMinEok) || DEFAULT_INVESTOR_PROFILE.budgetMinEok),
      budgetMaxEok: Math.max(0, Number(j.budgetMaxEok) || DEFAULT_INVESTOR_PROFILE.budgetMaxEok),
      preferredDistrictIds: Array.isArray(j.preferredDistrictIds)
        ? j.preferredDistrictIds.filter(Boolean)
        : DEFAULT_INVESTOR_PROFILE.preferredDistrictIds,
      monthlyRepayBudgetMan: Math.max(
        0,
        Number(j.monthlyRepayBudgetMan) ?? DEFAULT_INVESTOR_PROFILE.monthlyRepayBudgetMan,
      ),
      liveWeightPct: clamp(
        Number(j.liveWeightPct) || DEFAULT_INVESTOR_PROFILE.liveWeightPct,
        0,
        100,
      ),
      preferredAreaSqm: clamp(
        Number(j.preferredAreaSqm) || DEFAULT_INVESTOR_PROFILE.preferredAreaSqm,
        20,
        200,
      ),
    };
    investorSnapshotKey = key;
    investorSnapshot = merged;
    return merged;
  } catch {
    investorSnapshotKey = "!err";
    investorSnapshot = DEFAULT_INVESTOR_PROFILE;
    return DEFAULT_INVESTOR_PROFILE;
  }
}

export function saveInvestorProfile(p: InvestorProfile): void {
  if (typeof window === "undefined") return;
  investorSnapshotKey = null;
  investorSnapshot = null;
  localStorage.setItem(
    INVESTOR_PROFILE_KEY,
    JSON.stringify({ ...p, updatedAt: new Date().toISOString() }),
  );
  window.dispatchEvent(new Event("woodong_ai_profile"));
}

function clamp(n: number, a: number, b: number) {
  return Math.min(b, Math.max(a, n));
}

function clampRisk(v: unknown): 1 | 2 | 3 | 4 | 5 {
  const n = Number(v);
  if (n <= 1) return 1;
  if (n === 2) return 2;
  if (n === 4) return 4;
  if (n >= 5) return 5;
  return 3;
}

/** 개인화 가중치: 점수 보정(-12 ~ +12), 예측 보수성 등에 사용 */
export function personalizationBias(profile: InvestorProfile): number {
  return (profile.riskTolerance - 3) * 3 + (profile.goal === "live" ? -2 : profile.goal === "invest" ? 4 : 0);
}

export function districtBoost(profile: InvestorProfile, districtId: string): number {
  if (!profile.preferredDistrictIds?.length) return 0;
  return profile.preferredDistrictIds.includes(districtId) ? 6 : 0;
}
