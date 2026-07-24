/**
 * 소유확인 신청 — POST /api/listings/[id]/verify
 * 로그인 + 매물 소유자 본인만. body: { proofUrl, proofPath?, proofMime?, note? }
 * 증빙 파일은 클라이언트가 미리 /api/upload(folder="listing-verify")로 올려 URL을 전달한다.
 *
 * 이전 구현의 결함(I1): 받은 proofUrl 을 어디에도 저장하지 않고 신청자 본인에게 보내는
 * 인박스 알림만 남겼다. 관리자는 증빙을 볼 방법이 없는데도 /admin/listings 에서
 * owner_verified 를 바로 켤 수 있었다 — 근거 없는 "소유확인" 배지가 이용자에게
 * 사실처럼 보이는 구조였다. 이제 신청을 owner_verifications 에 적재하고,
 * 배지는 관리자가 증빙을 확인해 승인한 뒤에만 세워진다.
 *
 * 남용 방지: 사용자 기준 3회/시간.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { getListingById } from "@/lib/listings/store-db";
import { createOwnerVerificationRequest } from "@/lib/listings/owner-verification";
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
  const proofPath = body.proofPath ? String(body.proofPath).slice(0, 300) : null;
  const proofMime = body.proofMime ? String(body.proofMime).slice(0, 100) : null;
  const note = typeof body.note === "string" ? body.note.slice(0, 500) : "";

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

  const created = await createOwnerVerificationRequest({
    listingId,
    applicantEmail: email,
    complexName: listing.complexName,
    region: listing.regionName ?? "",
    propertyAddress: listing.address ?? "",
    note,
    documents: [{ url: proofUrl, path: proofPath, mime: proofMime }],
  });

  if (!created.ok) {
    return NextResponse.json({ error: created.error }, { status: 503 });
  }
  if (created.alreadyPending) {
    return NextResponse.json({ ok: true, alreadyPending: true });
  }

  // 접수 알림 — 실제 인증 배지는 관리자가 증빙을 확인한 뒤에 표시된다.
  try {
    await appendInboxNotification({
      userEmail: email,
      title: "소유확인 신청 접수",
      body: "소유확인 신청이 접수됐어요 · 증빙 검토 후 인증 배지가 표시됩니다.",
      actionUrl: `/listings/${listingId}`,
    });
  } catch {
    // 알림 발송 실패는 신청 결과에 영향 주지 않는다.
  }

  return NextResponse.json({ ok: true });
}
