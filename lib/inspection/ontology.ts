/** AI 임장노트 구조화 온톨로지 — 보고서 JSON 스키마 */

export type ConfidenceLevel = "low" | "medium" | "high";
export type FactorType =
  | "transport"
  | "school"
  | "livability"
  | "condition"
  | "noise"
  | "parking"
  | "commercial"
  | "future_value"
  | "safety";

export type SourceType =
  | "user_audio"
  | "user_photo"
  | "user_text"
  | "checklist"
  | "public_data"
  | "inferred";

export interface Observation {
  id: string;
  factor: FactorType;
  sentiment: "positive" | "neutral" | "negative" | "mixed";
  statement: string;
  evidenceIds: string[];
  confidence: ConfidenceLevel;
  inferred: boolean;
  sourceType: SourceType;
}

export interface Evidence {
  id: string;
  sourceType: SourceType;
  label: string;
  excerpt?: string;
  mediaId?: string;
  publicDataRef?: string;
}

export interface StructuredScores {
  transport: number;
  school: number;
  livability: number;
  condition: number;
  future_value: number;
  overall: number;
}

export interface StructuredReport {
  version: number;
  topSummary: string;
  strengths: string[];
  weaknesses: string[];
  unknowns: string[];
  observations: Observation[];
  evidence: Evidence[];
  scores: StructuredScores;
  scoreExplanations: Array<{ factor: string; text: string; confidence: ConfidenceLevel }>;
  mustVerify: string[];
  followUpQuestions: string[];
  disclaimer: string;
  notFinancialAdvice: boolean;
  generatedAt: string;
  modelVersion?: string;
  /** 정비사업 lens 전용 — lens=redevelopment 일 때 채움 */
  redevelopment?: {
    projectType: string;
    currentStage: string;
    knownFacts: string[];
    uncertainties: string[];
    keyRisks: string[];
    nextDocumentsToCheck: string[];
  };
}

export interface ScenarioItem {
  name: "base" | "upside" | "downside";
  priceRange: string;
  keyDrivers: string[];
  risks: string[];
  triggers: string[];
  invalidation: string[];
  certainty: ConfidenceLevel;
}

export interface InvestmentScoreResult {
  score: number;
  confidenceBand: { low: number; high: number };
  featureContributions: Array<{ feature: string; contribution: number; direction: "positive" | "negative" }>;
  explanation: string;
  model: string;
}

import type { FiveAxisKey } from "@/lib/inspection/field-labels";

export interface SessionCompareRow {
  sessionId: string;
  label: string;
  region: string;
  aptName?: string;
  overallScore: number;
  scores: Record<FiveAxisKey, number>;
  strengths: string[];
  weaknesses: string[];
  mustVerify: string[];
}

export interface SessionCompareResult {
  sessions: SessionCompareRow[];
  recommendation: string;
  priorityOrder: string[];
}
