/* 커버리지 수요 이메일 정제(#413) — 순수함수 (server-only 아님: 유닛 테스트 대상). */

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,64}\.[^\s@]{2,24}$/;

export function sanitizeDemandEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase();
  if (!v || v.length > 120 || !EMAIL_RE.test(v)) return null;
  return v;
}
