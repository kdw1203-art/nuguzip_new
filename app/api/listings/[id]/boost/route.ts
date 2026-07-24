/**
 * I5 매물 부스트 셀프서비스(포인트) — POST /api/listings/[id]/boost
 * 로그인 + 매물 소유자 본인. 포인트(listing_boost_7d, 500P)를 소비해 7일 상단 노출.
 * 결제 아닌 포인트 경제 사용 → 키 불필요. 잔액 부족 시 402.
 */
import { NextResponse } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { getListingById, boostListing } from "@/lib/listings/store-db";
import { getSpendItem } from "@/lib/points/catalog";
import { getBalance, spendPoints } from "@/lib/points/ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BOOST_ITEM = "listing_boost_7d";

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

  const item = getSpendItem(BOOST_ITEM);
  if (!item || item.effect !== "listing_boost" || !item.durationDays) {
    return NextResponse.json({ error: "부스트 상품이 설정되지 않았어요." }, { status: 500 });
  }

  const listing = await getListingById(listingId);
  if (!listing) {
    return NextResponse.json({ error: "매물을 찾을 수 없습니다." }, { status: 404 });
  }
  if (listing.authorEmail.toLowerCase() !== email.trim().toLowerCase()) {
    return NextResponse.json({ error: "본인 매물만 부스트할 수 있어요." }, { status: 403 });
  }
  if (listing.status !== "approved") {
    return NextResponse.json(
      { error: "노출 중인 매물만 부스트할 수 있어요." },
      { status: 400 },
    );
  }

  // 잔액 선확인 → 부스트 적용 → 포인트 소비 순서(부스트 실패 시 미차감).
  const balance = await getBalance(email);
  if (balance < item.cost) {
    return NextResponse.json(
      { error: `포인트가 부족해요. (필요 ${item.cost.toLocaleString("ko-KR")}P)`, balance },
      { status: 402 },
    );
  }

  const boostUntil = await boostListing(listingId, email, item.durationDays);
  if (!boostUntil) {
    return NextResponse.json(
      { error: "부스트 적용에 실패했어요. 잠시 후 다시 시도해 주세요." },
      { status: 503 },
    );
  }

  const spend = await spendPoints(email, item.cost, "listing_boost", listingId);
  return NextResponse.json({
    ok: true,
    boostUntil,
    balance: spend.ok ? spend.balance : balance - item.cost,
  });
}
