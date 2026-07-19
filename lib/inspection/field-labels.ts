import type { StructuredScores } from "@/lib/inspection/ontology";
import type { InspectionSession } from "@/lib/inspection/session-store";

/** 전략 문서 lens ↔ DB mode */
export type FieldLens = "residential" | "investment" | "redevelopment" | "rent";

export const LENS_OPTIONS: Array<{
  id: FieldLens;
  label: string;
  mode: InspectionSession["mode"];
  hint: string;
}> = [
  { id: "residential", label: "실거주", mode: "field_note", hint: "생활권·학군·소음 중심" },
  { id: "investment", label: "투자", mode: "investment_note", hint: "수익·유동성·호재 중심" },
  { id: "redevelopment", label: "정비사업", mode: "field_note", hint: "사업 단계·리스크 중심" },
  { id: "rent", label: "전월세", mode: "rent_note", hint: "전세가율·임대 수요 중심" },
];

export const SCORE_AXIS_KEYS = [
  "location",
  "school",
  "transport",
  "facility",
  "future_value",
] as const;

export type FiveAxisKey = (typeof SCORE_AXIS_KEYS)[number];

export const SCORE_AXIS_LABELS: Record<FiveAxisKey, string> = {
  location: "입지",
  school: "학군",
  transport: "교통",
  facility: "시설",
  future_value: "미래가치",
};

/** structured_report scores → 전략 문서 5축 (입지·학군·교통·시설·미래가치) */
export function mapStructuredToFiveAxis(scores: StructuredScores): Record<FiveAxisKey, number> {
  return {
    location: scores.livability,
    school: scores.school,
    transport: scores.transport,
    facility: scores.condition,
    future_value: scores.future_value,
  };
}

export function overallGrade(score: number): string {
  if (score >= 90) return "A";
  if (score >= 80) return "A-";
  if (score >= 70) return "B+";
  if (score >= 60) return "B";
  if (score >= 50) return "C";
  return "D";
}

export function lensFromSession(session: Pick<InspectionSession, "mode" | "metadata">): FieldLens {
  const meta = session.metadata?.lens;
  if (meta === "redevelopment" || meta === "investment" || meta === "residential" || meta === "rent") {
    return meta;
  }
  if (session.mode === "investment_note") return "investment";
  if (session.mode === "rent_note") return "rent";
  return "residential";
}

export function lensToInspectionIntent(
  lens: FieldLens,
): import("@/lib/inspection/public-data-context-shared").InspectionIntent {
  if (lens === "investment") return "투자";
  if (lens === "rent") return "전월세";
  if (lens === "redevelopment") return "정비사업";
  return "실거주";
}
