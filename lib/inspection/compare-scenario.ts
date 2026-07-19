import type { SessionCompareResult, ScenarioItem } from "@/lib/inspection/ontology";
import type { InspectionSession } from "@/lib/inspection/session-store";
import { mapStructuredToFiveAxis } from "@/lib/inspection/field-labels";

export function compareSessions(sessions: InspectionSession[]): SessionCompareResult {
  const rows = sessions.map((s) => {
    const report = s.structuredReport;
    const scores = report
      ? mapStructuredToFiveAxis(report.scores)
      : { location: 0, school: 0, transport: 0, facility: 0, future_value: 0 };
    return {
      sessionId: s.id,
      label: s.aptName ?? s.region,
      region: s.region,
      aptName: s.aptName ?? undefined,
      overallScore: report?.scores.overall ?? 0,
      scores,
      strengths: report?.strengths ?? [],
      weaknesses: report?.weaknesses ?? [],
      mustVerify: report?.mustVerify ?? [],
    };
  });

  const sorted = [...rows].sort((a, b) => b.overallScore - a.overallScore);
  const top = sorted[0];
  const recommendation = top
    ? `${top.label}(${top.overallScore}점)이 현재 비교군에서 상대적으로 유리합니다. 단, ${top.mustVerify[0] ?? "추가 확인"} 항목을 검증하세요.`
    : "비교할 세션이 없습니다.";

  return {
    sessions: rows,
    recommendation,
    priorityOrder: sorted.map((r) => r.sessionId),
  };
}

export function buildScenarios(input: {
  currentPriceManwon?: number;
  overallScore: number;
  weaknesses: string[];
  holdingYears?: number;
}): ScenarioItem[] {
  const base = input.currentPriceManwon ?? 80000;
  const hold = input.holdingYears ?? 3;
  const riskPenalty = input.weaknesses.length * 2;

  return [
    {
      name: "base",
      priceRange: `${Math.round(base * 0.98)}~${Math.round(base * 1.05)}만원`,
      keyDrivers: ["현재 시세 유지", "금리 안정 가정"],
      risks: input.weaknesses.slice(0, 3),
      triggers: ["실거래가 횡보", "전세가율 유지"],
      invalidation: ["급격한 금리 인상", "지역 공급 급증"],
      certainty: "medium",
    },
    {
      name: "upside",
      priceRange: `${Math.round(base * 1.05)}~${Math.round(base * 1.15)}만원`,
      keyDrivers: ["입지·학군 수요", "개발 호재"],
      risks: ["고점 추격", "정책 변수"],
      triggers: ["거래량 회복", "전세가율 상승"],
      invalidation: ["매도 물량 급증"],
      certainty: input.overallScore >= 75 ? "medium" : "low",
    },
    {
      name: "downside",
      priceRange: `${Math.round(base * 0.85)}~${Math.round(base * 0.95)}만원`,
      keyDrivers: ["금리 민감", "공급 압력"],
      risks: [...input.weaknesses, `${hold}년 보유 시 거래비용`],
      triggers: ["전세가율 하락", "미분양·입주 물량"],
      invalidation: ["정책 완화·수요 회복"],
      certainty: riskPenalty >= 6 ? "medium" : "low",
    },
  ];
}
