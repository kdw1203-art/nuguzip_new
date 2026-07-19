/**
 * GET  /api/admin/users  — 사용자 목록 (관리자 전용)
 * PATCH /api/admin/users — 사용자 계정 조작 (ban/unban/setRole/setPlan)
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/auth";
import { getServiceSupabase } from "@/lib/supabase/service";
import { writeAuditLog } from "@/lib/audit/log";
import { applyRateLimit, WRITE_RATE_LIMIT } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function assertAdmin() {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session || role !== "admin") {
    throw new Error("FORBIDDEN");
  }
  return session?.user?.email ?? "unknown";
}

export async function GET(req: NextRequest) {
  try {
    await assertAdmin();
  } catch {
    return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  }

  const { searchParams } = req.nextUrl;
  const q = searchParams.get("q")?.trim() ?? "";
  const role = searchParams.get("role")?.trim() ?? "";
  const plan = searchParams.get("plan")?.trim() ?? "";
  const page = Math.max(1, Number(searchParams.get("page") ?? 1));
  const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") ?? 50)));
  const offset = (page - 1) * limit;

  const sb = getServiceSupabase();
  if (!sb) {
    return NextResponse.json({ error: "Supabase 미설정", users: [], total: 0 }, { status: 503 });
  }

  let query = sb
    .from("app_users")
    .select("id, email, name, role, plan, is_banned, ban_until, ban_reason, created_at", {
      count: "exact",
    })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (q) query = query.or(`email.ilike.%${q}%,name.ilike.%${q}%`);
  if (role) query = query.eq("role", role);
  if (plan) query = query.eq("plan", plan);

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ users: data ?? [], total: count ?? 0, page, limit });
}

export async function PATCH(req: NextRequest) {
  const limited = await applyRateLimit(req, WRITE_RATE_LIMIT);
  if (limited) return limited;

  let actorEmail = "unknown";
  try {
    actorEmail = await assertAdmin();
  } catch {
    return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "JSON이 필요합니다." }, { status: 400 });
  }

  const userId = String(body.userId ?? "").trim();
  const action = String(body.action ?? "").trim() as
    | "ban"
    | "unban"
    | "setRole"
    | "setPlan";
  const value = body.value;
  const banReason = body.banReason ? String(body.banReason).trim() : null;
  const banUntil = body.banUntil ? String(body.banUntil).trim() : null;

  if (!userId) return NextResponse.json({ error: "userId가 필요합니다." }, { status: 400 });

  const sb = getServiceSupabase();
  if (!sb) return NextResponse.json({ error: "Supabase 미설정" }, { status: 503 });

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

  let updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  let auditAction: Parameters<typeof writeAuditLog>[0]["action"] = "user.ban";

  switch (action) {
    case "ban":
      updates = {
        ...updates,
        is_banned: true,
        ban_reason: banReason,
        ban_until: banUntil ?? null,
      };
      auditAction = "user.ban";
      break;
    case "unban":
      updates = {
        ...updates,
        is_banned: false,
        ban_reason: null,
        ban_until: null,
      };
      auditAction = "user.unban";
      break;
    case "setRole":
      if (!["user", "admin"].includes(String(value))) {
        return NextResponse.json({ error: "올바른 역할값이 아닙니다." }, { status: 400 });
      }
      updates = { ...updates, role: String(value) };
      auditAction = "user.role_change";
      break;
    case "setPlan":
      if (!["free", "trial", "pro", "expert"].includes(String(value))) {
        return NextResponse.json({ error: "올바른 플랜값이 아닙니다." }, { status: 400 });
      }
      updates = { ...updates, plan: String(value) };
      auditAction = "user.plan_change";
      break;
    default:
      return NextResponse.json({ error: "올바른 action이 아닙니다." }, { status: 400 });
  }

  const { data, error } = await sb
    .from("app_users")
    .update(updates)
    .eq("id", userId)
    .select("id, email, name, role, plan, is_banned, ban_until, ban_reason")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAuditLog({
    actorEmail,
    action: auditAction,
    targetType: "user",
    targetId: userId,
    detail: { action, value, banReason, banUntil },
    ip,
  });

  return NextResponse.json({ user: data });
}
