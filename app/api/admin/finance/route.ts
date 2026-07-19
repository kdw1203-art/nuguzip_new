/**
 * /api/admin/finance
 *  GET    : { entries, cashBalance, monthly }
 *  POST   : { kind: "entry" | "cash", ...payload }
 *  DELETE : ?kind=entry&id=
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  aggregateFinanceMonths,
  createFinanceEntry,
  deleteFinanceEntry,
  listFinanceCashBalance,
  listFinanceEntries,
  upsertFinanceCashBalance,
  type FinanceKind,
} from "@/lib/admin/business-dashboards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function assertAdmin() {
  const s = await auth();
  if (!s?.user?.email || s.user.role !== "admin") return null;
  return s;
}

export async function GET() {
  if (!(await assertAdmin())) return NextResponse.json({ error: "관리자 권한 필요" }, { status: 403 });
  const [entries, cashBalance, monthly] = await Promise.all([
    listFinanceEntries(),
    listFinanceCashBalance(),
    aggregateFinanceMonths(),
  ]);
  return NextResponse.json({ entries, cashBalance, monthly });
}

export async function POST(req: Request) {
  const s = await assertAdmin();
  if (!s) return NextResponse.json({ error: "관리자 권한 필요" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const kind = String(body.kind ?? "entry");

  if (kind === "entry") {
    const month = String(body.month ?? "").trim();
    const k = String(body.entryKind ?? "revenue") as FinanceKind;
    const amount = Number(body.amountKrw ?? 0);
    if (!month || !Number.isFinite(amount)) {
      return NextResponse.json({ error: "month/amount 필수" }, { status: 400 });
    }
    const ok = await createFinanceEntry({
      month,
      kind: k === "expense" ? "expense" : "revenue",
      category: body.category ? String(body.category) : "general",
      amountKrw: amount,
      memo: body.memo ? String(body.memo) : "",
      createdBy: s.user.email ?? undefined,
    });
    if (!ok) return NextResponse.json({ error: "Supabase 미설정" }, { status: 503 });
    return NextResponse.json({ ok: true }, { status: 201 });
  }

  if (kind === "cash") {
    const month = String(body.month ?? "").trim();
    const balance = Number(body.balanceKrw ?? 0);
    if (!month) return NextResponse.json({ error: "month 필수" }, { status: 400 });
    const ok = await upsertFinanceCashBalance({ month, balanceKrw: balance });
    if (!ok) return NextResponse.json({ error: "Supabase 미설정" }, { status: 503 });
    return NextResponse.json({ ok: true }, { status: 201 });
  }

  return NextResponse.json({ error: "알 수 없는 kind" }, { status: 400 });
}

export async function DELETE(req: Request) {
  if (!(await assertAdmin())) return NextResponse.json({ error: "관리자 권한 필요" }, { status: 403 });
  const url = new URL(req.url);
  const id = url.searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ error: "id 필수" }, { status: 400 });
  const ok = await deleteFinanceEntry(id);
  if (!ok) return NextResponse.json({ error: "삭제 실패" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
