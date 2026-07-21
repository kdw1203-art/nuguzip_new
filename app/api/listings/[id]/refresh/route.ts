/**
 * #6 매물 끌어올리기(갱신) — POST /api/listings/[id]/refresh
 * 로그인 + 매물 소유자 본인만. refreshed_at·updated_at 을 now 로 갱신해
 * "확인 필요"(stale) 상태를 해제한다. 자동 삭제 없음.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { getListingById, refreshListing } from "@/lib/listings/store-db";
import { logger } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await safeAuth();
  const email = session?.user?.email ?? null;
  if (!email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { id } = await params;
  const listingId = String(id ?? "").trim();
  if (!listingId) {
    return NextResponse.json({ error: "매물 ID가 필요합니다." }, { status: 400 });
  }

  const listing = await getListingById(listingId);
  if (!listing) {
    return NextResponse.json({ error: "매물을 찾을 수 없습니다." }, { status: 404 });
  }
  if (listing.authorEmail.trim().toLowerCase() !== email.trim().toLowerCase()) {
    return NextResponse.json(
      { error: "본인 매물만 끌어올릴 수 있어요." },
      { status: 403 },
    );
  }

  try {
    const res = await refreshListing(listingId, listing.authorEmail);
    if (!res.ok) {
      return NextResponse.json(
        { error: "갱신에 실패했어요. 잠시 후 다시 시도해 주세요." },
        { status: 500 },
      );
    }
    return NextResponse.json({ ok: true, refreshedAt: res.refreshedAt });
  } catch (e) {
    logger.error("[listings:refresh]", e);
    return NextResponse.json(
      { error: "갱신에 실패했어요. 잠시 후 다시 시도해 주세요." },
      { status: 500 },
    );
  }
}
