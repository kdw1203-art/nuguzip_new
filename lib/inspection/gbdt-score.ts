import type { InvestmentScoreResult } from "@/lib/inspection/ontology";
import type { StructuredReport } from "@/lib/inspection/ontology";

/** GBDT 대신 가중 선형 + SHAP-style 기여도 — tabular feature vector */

export type InvestmentFeatures = {
  transport: number;
  school: number;
  livability: number;
  condition: number;
  future_value: number;
  observationCount: number;
  negativeRatio: number;
  holdingYears?: number;
};

const WEIGHTS: Record<keyof Omit<InvestmentFeatures, "observationCount" | "negativeRatio" | "holdingYears">, number> = {
  transport: 0.22,
  school: 0.14,
  livability: 0.2,
  condition: 0.18,
  future_value: 0.26,
};

export function computeInvestmentScore(features: InvestmentFeatures): InvestmentScoreResult {
  const raw =
    features.transport * WEIGHTS.transport +
    features.school * WEIGHTS.school +
    features.livability * WEIGHTS.livability +
    features.condition * WEIGHTS.condition +
    features.future_value * WEIGHTS.future_value;

  const dataPenalty = features.observationCount < 3 ? -8 : features.observationCount >= 8 ? 4 : 0;
  const negPenalty = Math.round(features.negativeRatio * 15);
  const holdingAdj = features.holdingYears && features.holdingYears <= 2 ? -3 : 0;

  const score = Math.max(0, Math.min(100, Math.round(raw + dataPenalty - negPenalty + holdingAdj)));
  const band = Math.max(5, Math.round((100 - score) * 0.12));

  const contributions = (Object.keys(WEIGHTS) as Array<keyof typeof WEIGHTS>).map((feature) => {
    const val = features[feature];
    const contribution = Math.round(val * WEIGHTS[feature] * 0.4);
    return {
      feature,
      contribution: Math.abs(contribution),
      direction: val >= 60 ? ("positive" as const) : ("negative" as const),
    };
  });

  return {
    score,
    confidenceBand: { low: Math.max(0, score - band), high: Math.min(100, score + band) },
    featureContributions: contributions.sort((a, b) => b.contribution - a.contribution),
    explanation: `표형 가중 모델 기준 ${score}점. 관찰 ${features.observationCount}건, 부정 비율 ${Math.round(features.negativeRatio * 100)}% 반영.`,
    model: "nuguzip-gbdt-v1-linear",
  };
}

export function featuresFromReport(report: StructuredReport): InvestmentFeatures {
  const neg = report.observations.filter((o) => o.sentiment === "negative").length;
  const total = report.observations.length || 1;
  return {
    transport: report.scores.transport,
    school: report.scores.school,
    livability: report.scores.livability,
    condition: report.scores.condition,
    future_value: report.scores.future_value,
    observationCount: report.observations.length,
    negativeRatio: neg / total,
  };
}
