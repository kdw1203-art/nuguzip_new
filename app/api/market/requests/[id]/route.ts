import { NextResponse } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import {
  getMarketRequest,
  closeMarketRequest,
} from "@/lib/market/store-db";
import { getServiceSupabase } from "@/lib/supabase/service";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/market/requests/[id] — 단일 마켓 의뢰 조회 */
export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const request = await getMarketRequest(id);
  if (!request) {
    return NextResponse.json({ error: "의뢰를 찾을 수 없습니다." }, { status: 404 });
  }
  return NextResponse.json({ request });
}

/** PATCH /api/market/requests/[id] — 의뢰 수정 (작성자 또는 관리자) */
export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const session = await safeAuth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "JSON이 필요합니다." }, { status: 400 });
  }

  const existing = await getMarketRequest(id);
  if (!existing) {
    return NextResponse.json({ error: "의뢰를 찾을 수 없습니다." }, { status: 404 });
  }

  const isAdmin = (session.user as { role?: string }).role === "admin";

  // status=closed 는 closeMarketRequest 사용
  if (body.status === "closed") {
    const result = await closeMarketRequest(id);
    if (!result.ok) {
      return NextResponse.json({ error: result.message ?? "상태 변경 실패" }, { status: 500 });
    }
    return NextResponse.json({ request: { ...existing, status: "closed" } });
  }

  // 일반 필드 수정은 Supabase 직접 업데이트
  const sb = getServiceSupabase();
  if (!sb) {
    return NextResponse.json(
      { error: "DB 미연결 상태에서는 수정이 제한됩니다.", warning: true },
      { status: 503 },
    );
  }

  const allowed = ["title", "description", "budget_min", "budget_max", "due_date", "related_site"];
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (typeof body.title === "string") updates.title = body.title.trim().slice(0, 200);
  if (typeof body.description === "string") updates.description = body.description.trim().slice(0, 2000);
  if (body.budgetMin !== undefined) updates.budget_min = body.budgetMin === "" ? null : Number(body.budgetMin);
  if (body.budgetMax !== undefined) updates.budget_max = body.budgetMax === "" ? null : Number(body.budgetMax);
  if (typeof body.dueDate === "string") updates.due_date = body.dueDate.trim() || null;
  if (typeof body.relatedSite === "string") updates.related_site = body.relatedSite.trim() || null;

  void allowed; // suppress unused warning

  if (Object.keys(updates).length === 1) {
    return NextResponse.json({ error: "변경할 내용이 없습니다." }, { status: 400 });
  }

  const query = sb.from("market_requests").update(updates).eq("id", id);
  if (!isAdmin) {
    query.eq("requester_email", session.user.email);
  }

  const { data, error } = await query.select().single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ request: data });
}

/** DELETE /api/market/requests/[id] — 의뢰 삭제 (작성자 또는 관리자) */
export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const session = await safeAuth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const existing = await getMarketRequest(id);
  if (!existing) {
    return NextResponse.json({ error: "의뢰를 찾을 수 없습니다." }, { status: 404 });
  }

  const isAdmin = (session.user as { role?: string }).role === "admin";
  const sb = getServiceSupabase();

  if (!sb) {
    return NextResponse.json(
      { error: "DB 미연결 상태에서는 삭제가 제한됩니다.", warning: true },
      { status: 503 },
    );
  }

  const query = sb.from("market_requests").delete().eq("id", id);
  if (!isAdmin) {
    query.eq("requester_email", session.user.email);
  }

  const { error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
