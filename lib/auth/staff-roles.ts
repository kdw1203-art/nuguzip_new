import type { Session } from "next-auth";
import { isAllowlistedAdmin } from "@/lib/auth/admin-emails";

/**
 * 관리자 콘솔 역할 — `app_users.staff_role` 또는 레거시 `role=admin` 으로 해석.
 * Expert(전문가)는 일반 사용자 플랜·전문가 포털에서 처리하며 admin staff 와 분리.
 */
export type StaffRole =
  | "super_admin"
  | "ops_admin"
  | "verification_admin"
  | "data_admin"
  | "cs_manager";

export type AdminSection =
  | "overview"
  | "billing"
  | "policy"
  | "moderation"
  | "verification"
  | "etl"
  | "support"
  | "users"
  | "analytics"
  | "invest";

export const STAFF_ROLE_LABEL: Record<StaffRole, string> = {
  super_admin: "Super Admin",
  ops_admin: "Ops Admin",
  verification_admin: "Verification Admin",
  data_admin: "Data Admin",
  cs_manager: "CS Manager",
};

const ROLE_SECTIONS: Record<StaffRole, AdminSection[] | "*"> = {
  super_admin: "*",
  ops_admin: [
    "overview",
    "moderation",
    "users",
    "analytics",
    "support",
  ],
  verification_admin: ["overview", "verification", "moderation"],
  data_admin: ["overview", "etl", "analytics"],
  cs_manager: ["overview", "support", "moderation", "billing"],
};

function parseStaffRoleMap(): Map<string, StaffRole> {
  const out = new Map<string, StaffRole>();
  const raw = process.env.STAFF_ROLE_MAP?.trim();
  if (!raw) return out;
  for (const part of raw.split(/[,;\n]+/)) {
    const [emailPart, rolePart] = part.split(":").map((s) => s.trim());
    const email = emailPart?.toLowerCase();
    const role = rolePart as StaffRole;
    if (email?.includes("@") && role in STAFF_ROLE_LABEL) {
      out.set(email, role);
    }
  }
  return out;
}

/** JWT·세션에서 staff 역할 해석 */
export function resolveStaffRole(session: Session | null): StaffRole | null {
  if (!session?.user?.email) return null;
  const email = session.user.email.trim().toLowerCase();

  const fromEnv = parseStaffRoleMap().get(email);
  if (fromEnv) return fromEnv;

  const staffFromToken = (session.user as { staffRole?: string }).staffRole;
  if (
    staffFromToken &&
    staffFromToken in STAFF_ROLE_LABEL
  ) {
    return staffFromToken as StaffRole;
  }

  if (session.user.role === "admin" || isAllowlistedAdmin(email)) {
    return "super_admin";
  }
  return null;
}

export function canAccessAdminConsole(session: Session | null): boolean {
  return resolveStaffRole(session) !== null;
}

export function canAccessAdminSection(
  session: Session | null,
  section: AdminSection,
): boolean {
  const role = resolveStaffRole(session);
  if (!role) return false;
  const allowed = ROLE_SECTIONS[role];
  if (allowed === "*") return true;
  return allowed.includes(section);
}

/** `/admin/*` 경로 → 필요 섹션 */
export function adminPathSection(pathname: string): AdminSection {
  if (pathname.startsWith("/admin/finance") || pathname.startsWith("/admin/invest")) {
    return pathname.includes("invest") ? "invest" : "billing";
  }
  if (
    pathname.startsWith("/admin/settings") ||
    pathname.startsWith("/admin/banned-words")
  ) {
    return "policy";
  }
  if (
    pathname.startsWith("/admin/reports") ||
    pathname.startsWith("/admin/posts") ||
    pathname.startsWith("/admin/chat") ||
    pathname.startsWith("/admin/market")
  ) {
    return "moderation";
  }
  if (
    pathname.startsWith("/admin/experts") ||
    pathname.startsWith("/admin/expert-ops")
  ) {
    return "verification";
  }
  if (
    pathname.startsWith("/admin/public-data") ||
    pathname.startsWith("/admin/market-data") ||
    pathname.startsWith("/admin/complex-data")
  ) {
    return "etl";
  }
  if (pathname.startsWith("/admin/support") || pathname.startsWith("/admin/sms")) {
    return "support";
  }
  if (pathname.startsWith("/admin/users") || pathname.startsWith("/admin/meetings")) {
    return "users";
  }
  if (pathname.startsWith("/admin/analytics") || pathname.startsWith("/admin/acquisition")) {
    return "analytics";
  }
  return "overview";
}
