/**
 * 소유확인 신청 — POST /api/listings/[id]/verify
 * 로그인 + 매물 소유자 본인만. body: { proofUrl }.
 * 증빙 이미지는 클라이언트가 미리 /api/upload(folder="listing-verify")로 올려 URL을 전달한다.
 * 여기서는 "신청 접수" 인박스 알림만 남긴다 — 실제 인증(owner_verified=true)은
 * 어드민 PATCH /api/admin/listings action:"verify" 에서 처리한다.
 * 남용 방지: 사용자 기준 3회/시간.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { getListingById } from "@/lib/listings/store-db";
import { appendInboxNotification } from "@/lib/notifications/inbox";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
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

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "JSON이 필요합니다." }, { status: 400 });
  }
  const proofUrl = String(body.proofUrl ?? "").trim();
  if (!proofUrl || !/^https?:\/\//i.test(proofUrl)) {
    return NextResponse.json(
      { error: "증빙 이미지를 먼저 업로드해 주세요." },
      { status: 400 },
    );
  }

  const listing = await getListingById(listingId);
  if (!listing) {
    return NextResponse.json({ error: "매물을 찾을 수 없습니다." }, { status: 404 });
  }
  if (listing.authorEmail.trim().toLowerCase() !== email.trim().toLowerCase()) {
    return NextResponse.json(
      { error: "본인 매물만 소유확인을 신청할 수 있어요." },
      { status: 403 },
    );
  }
  if (listing.ownerVerified) {
    return NextResponse.json({ ok: true, alreadyVerified: true });
  }

  // 3회/시간 — 정상 신청만 카운트(위 검증 통과 후)
  const rl = rateLimit(`listing-verify:${email.trim().toLowerCase()}`, {
    limit: 3,
    windowMs: 60 * 60_000,
  });
  if (!rl.ok) return tooManyRequests(rl.retryAfterSec);

  // 신청 접수 알림 — 실제 인증 배지는 어드민 검토 후 표시된다.
  try {
    await appendInboxNotification({
      userEmail: email,
      title: "소유확인 신청 접수",
      body: "소유확인 신청이 접수됐어요 · 검토 후 인증 배지가 표시됩니다.",
      actionUrl: `/listings/${listingId}`,
    });
  } catch {
    // 알림 발송 실패는 신청 결과에 영향 주지 않는다.
  }

  return NextResponse.json({ ok: true });
}
