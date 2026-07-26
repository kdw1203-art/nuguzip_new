/**
 * 거래완료 신고 — POST /api/listings/[id]/sold
 * 로그인 + 매물 소유자 본인만. status='closed' 로 변경 후 "거래완료 신고" 포인트 적립.
 * awardPoints 가 refId=listingId 로 중복 지급을 방어한다.
 */
import { NextResponse } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { awardPoints } from "@/lib/points/ledger";
import { getServiceSupabase } from "@/lib/supabase/service";
import { dbUnavailable } from "@/lib/api/db-unavailable";

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

  const { data, error: readError } = await sb
    .from("listings")
    .select("author_email, status")
    .eq("id", listingId)
    .maybeSingle();
  /* 조회 실패를 아래 404 로 흘려보내면 멀쩡히 있는 자기 매물에 대고
     "매물을 찾을 수 없습니다"라고 답하게 된다. 못 읽은 것은 못 읽었다고 말한다. */
  if (readError) {
    return dbUnavailable("listing-sold", readError);
  }
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
  /* awardPoints 는 실패 경로에서 balance 자리에 0 을 채워 보낸다(ledger.ts 의
     balanceForFailure — 언제나 `ok:false` 와 함께 나가므로 그 자체로는 거짓이
     아니다). 그런데 여기서 바깥에 `ok: true` 를 씌우면 그 0 이 "당신의 잔액은
     0P" 라는 단독 주장이 되어 버린다. 적립이 성사됐을 때만 잔액을 말한다. */
  return NextResponse.json({
    ok: true,
    awarded: award.awarded,
    balance: award.ok ? award.balance : null,
  });
}
