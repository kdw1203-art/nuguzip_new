/**
 * 거래완료 신고 — POST /api/listings/[id]/sold
 * 로그인 + 매물 소유자 본인만. status='closed' 로 변경 후 "거래완료 신고" 포인트 적립.
 * awardPoints 가 refId=listingId 로 중복 지급을 방어한다.
 */
import { NextResponse } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { awardPoints } from "@/lib/points/ledger";
import { getServiceSupabase } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await safeAuth();
  const email = session?.user?.email;
  if (!email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { id } = await params;
  const listingId = String(id ?? "").trim();
  if (!listingId) {
    return NextResponse.json({ error: "매물 ID가 필요합니다." }, { status: 400 });
  }

  const sb = getServiceSupabase();
  if (!sb) {
    return NextResponse.json(
      { error: "저장소가 준비되지 않았어요. 잠시 후 다시 시도해 주세요." },
      { status: 503 },
    );
  }

  const { data } = await sb
    .from("listings")
    .select("author_email, status")
    .eq("id", listingId)
    .maybeSingle();
  const row = (data ?? null) as Record<string, unknown> | null;
  if (!row) {
    return NextResponse.json({ error: "매물을 찾을 수 없습니다." }, { status: 404 });
  }

  const ownerEmail = String(row.author_email ?? "").trim();
  if (!ownerEmail || ownerEmail.toLowerCase() !== email.trim().toLowerCase()) {
    return NextResponse.json({ error: "본인 매물만 신고할 수 있습니다." }, { status: 403 });
  }

  const { error } = await sb
    .from("listings")
    .update({ status: "closed", updated_at: new Date().toISOString() })
    .eq("id", listingId);
  if (error) {
    return NextResponse.json(
      { error: "처리에 실패했어요. 잠시 후 다시 시도해 주세요." },
      { status: 500 },
    );
  }

  // 거래완료 신고 적립 — refId=listingId 로 중복 지급 방지.
  const award = await awardPoints(ownerEmail, "listing_sold", listingId);
  return NextResponse.json({ ok: true, awarded: award.awarded, balance: award.balance });
}
