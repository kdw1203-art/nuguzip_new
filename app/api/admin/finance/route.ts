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
import { dbUnavailable } from "@/lib/api/db-unavailable";

/** 조회가 실패한 것을 "0건"으로 그리지 않기 위한 안내. */
const UNAVAILABLE = "지금은 데이터를 불러올 수 없습니다. 잠시 후 다시 시도해 주세요.";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function assertAdmin() {
  const s = await auth();
  if (!s?.user?.email || s.user.role !== "admin") return null;
  return s;
}

export async function GET() {
  if (!(await assertAdmin())) return NextResponse.json({ error: "관리자 권한 필요" }, { status: 403 });
  /* 재무는 이 화면으로 판단한다. 못 읽은 것을 "이번 달 0원"으로 그리면
     숫자가 아니라 결론이 틀린다. */
  try {
    const [entries, cashBalance, monthly] = await Promise.all([
      listFinanceEntries(),
      listFinanceCashBalance(),
      aggregateFinanceMonths(),
    ]);
    return NextResponse.json({ entries, cashBalance, monthly });
  } catch (err) {
    return dbUnavailable("재무 대시보드 조회 실패", err, UNAVAILABLE);
  }
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
