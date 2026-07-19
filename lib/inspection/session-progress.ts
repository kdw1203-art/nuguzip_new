/** 임장 세션 진행률 추정 — UI용 */

export function estimateCaptureProgress(capture: Record<string, unknown>): number {
  if (capture.wizardComplete === true) return 100;

  let score = 0;
  const voice = String(capture.voiceText ?? capture.memoLine ?? "").trim();
  const chips = Array.isArray(capture.chips) ? capture.chips : [];
  const checklist = capture.checklist as Record<string, boolean> | undefined;
  const checked = checklist ? Object.values(checklist).filter(Boolean).length : 0;
  const timeline = Array.isArray(capture.timeline) ? capture.timeline : [];

  if (voice.length > 0) score += 25;
  if (chips.length > 0) score += 15;
  if (checked > 0) score += Math.min(25, checked * 8);
  if (timeline.some((t: { kind?: string }) => t.kind === "photo")) score += 30;
  else if (Number(capture.photoCount) > 0) score += 30;

  return Math.min(95, Math.max(5, score));
}
