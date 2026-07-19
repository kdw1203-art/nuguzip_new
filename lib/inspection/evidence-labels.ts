import type { Evidence, SourceType } from "@/lib/inspection/ontology";

export type EvidenceBadgeKind = "official" | "observation" | "inferred" | "verify";

export const EVIDENCE_BADGE_LABELS: Record<EvidenceBadgeKind, string> = {
  official: "공식 데이터",
  observation: "사용자 관찰",
  inferred: "AI 추론",
  verify: "검증 필요",
};

export function sourceToBadgeKind(source: SourceType, inferred?: boolean): EvidenceBadgeKind {
  if (source === "public_data") return "official";
  if (inferred || source === "inferred") return "inferred";
  if (source === "user_audio" || source === "user_photo" || source === "user_text" || source === "checklist") {
    return "observation";
  }
  return "verify";
}

export function countEvidenceByBadge(evidence: Evidence[]): Record<EvidenceBadgeKind, number> {
  const counts: Record<EvidenceBadgeKind, number> = {
    official: 0,
    observation: 0,
    inferred: 0,
    verify: 0,
  };
  for (const e of evidence) {
    counts[sourceToBadgeKind(e.sourceType)] += 1;
  }
  return counts;
}
