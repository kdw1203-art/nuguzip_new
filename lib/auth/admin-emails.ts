/** 관리자 이메일 allowlist — `PROJECT_ADMIN_EMAIL` + `ADMIN_EMAILS` (쉼표·세미콜론·공백). */

function parseEmailList(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/[,;\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.includes("@"));
}

/** 비상 토큰·레거시 super_admin fallback용 대표 관리자 이메일 */
export function resolveProjectAdminEmail(): string | null {
  const primary = process.env.PROJECT_ADMIN_EMAIL?.trim().toLowerCase();
  if (primary?.includes("@")) return primary;
  const fromList = parseEmailList(process.env.ADMIN_EMAILS);
  return fromList[0] ?? null;
}

export function parseAdminEmailAllowlist(): Set<string> {
  const out = new Set<string>();
  for (const e of parseEmailList(process.env.PROJECT_ADMIN_EMAIL)) out.add(e);
  for (const e of parseEmailList(process.env.ADMIN_EMAILS)) out.add(e);
  return out;
}

export function isAllowlistedAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  return parseAdminEmailAllowlist().has(normalized);
}
