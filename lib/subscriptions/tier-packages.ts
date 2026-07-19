export type TierPackage = {
  tier: "free" | "pro" | "expert";
  label: string;
  summary: string;
  capabilities: string[];
};

export const TIER_PACKAGES: TierPackage[] = [
  {
    tier: "free",
    label: "Free",
    summary: "기본 카드·기본 노트",
    capabilities: ["기본 탐색", "커뮤니티", "기본 임장노트"],
  },
  {
    tier: "pro",
    label: "Pro",
    summary: "고급 필터·비교·알림",
    capabilities: ["고급 필터", "비교 리포트", "주간 알림", "AI 노트 확장"],
  },
  {
    tier: "expert",
    label: "Expert",
    summary: "심화 AI·전문가 기능",
    capabilities: ["AI 심화분석", "전문가 우선응답", "PDF/데이터보내기"],
  },
];

export function tierPackage(tier: TierPackage["tier"]): TierPackage | undefined {
  return TIER_PACKAGES.find((p) => p.tier === tier);
}
