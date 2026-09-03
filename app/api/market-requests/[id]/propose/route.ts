import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getExpertByOwnerEmail } from "@/lib/experts/store-db";
import { scanExpertConversationText, hasBlockingFraudHit } from "@/lib/experts/fraud-guards";
import { logExpertFraudEvent } from "@/lib/experts/verification-store";
import { getMarketRequestOwnerEmail } from "@/lib/market/store-db";
import { createProposal } from "@/lib/market/proposals-store";
import { appendInboxNotification } from "@/lib/notifications/inbox";
import { rateLimit, getClientIp, tooManyRequests } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/market-requests/[id]/propose — 전문가 견적 제안 보내기.
 *
 * 견적 요청(market_requests)은 여태 쌓이기만 하고 **전문가가 응답할 경로가
 * 없었다**(실사 갭 #7). 이 라우트가 그 루프를 닫는다.
 *
 * [953] 제안이 알림으로만 나가고 행이 남지 않던 것을 고쳤다 — 이제
 * market_request_proposals 에 저장(요청당 전문가 1건)하고, 의뢰자 알림은 상담함
 * (/my/consultations)으로 딥링크한다. 의뢰자는 거기서 제안을 모아 보고 전문가
 * 프로필로 이어간다. 제안 본문은 상담 본문과 같은 사기 스캔을 거친다(외부 결제
 * 유도·계좌번호는 차단, 연락처는 경고 로그).
 *
 * 이메일은 서버 전용 헬퍼(getMarketRequestOwnerEmail)로만 읽는다 — 공개 응답
 * DTO(mapRow)에는 여전히 싣지 않는다.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const rl = rateLimit(`propose:${getClientIp(req)}`, { limit: 10, windowMs: 60 * 60_000 });
  if (!rl.ok) return tooManyRequests(rl.retryAfterSec);

  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const expert = await getExpertByOwnerEmail(session.user.email).catch(() => null);
  if (!expert || !expert.isVerified) {
    return NextResponse.json(
      { error: "견적 제안은 인증 전문가만 보낼 수 있어요." },
      { status: 403 },
    );
  }

  const { id } = await params;
  const owner = await getMarketRequestOwnerEmail(id);
  if (!owner) {
    return NextResponse.json({ error: "요청을 찾을 수 없어요." }, { status: 404 });
  }
  if (owner.status !== "open") {
    return NextResponse.json({ error: "이미 마감된 요청이에요." }, { status: 409 });
  }
  // 자기 요청에 자기 제안은 무의미
  if (owner.email.toLowerCase() === session.user.email.trim().toLowerCase()) {
    return NextResponse.json({ error: "본인 요청에는 제안할 수 없어요." }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as { message?: unknown };
  const message = String(body.message ?? "").trim();
  if (message.length < 10 || message.length > 500) {
    return NextResponse.json(
      { error: "제안 내용은 10~500자로 적어 주세요." },
      { status: 400 },
    );
  }

  const hits = scanExpertConversationText(message);
  if (hasBlockingFraudHit(hits)) {
    void logExpertFraudEvent({
      userEmail: session.user.email,
      expertId: expert.id,
      eventType: "off_platform_payment",
      severity: "block",
      context: { where: "proposal", requestId: id },
    }).catch(() => {});
    return NextResponse.json(
      { error: "제안에는 외부 결제·계좌 안내를 적을 수 없어요. 내용을 고쳐 다시 보내 주세요." },
      { status: 422 },
    );
  }
  if (hits.length > 0) {
    void logExpertFraudEvent({
      userEmail: session.user.email,
      expertId: expert.id,
      eventType: "contact_leak",
      severity: "warn",
      context: { where: "proposal", requestId: id },
    }).catch(() => {});
  }

  const saved = await createProposal({
    requestId: id,
    proposerEmail: session.user.email,
    expertId: expert.id,
    expertLabel: expert.title ? `${expert.name} ${expert.title}` : expert.name,
    message,
  });
  if (!saved.ok) {
    return NextResponse.json({ error: saved.message, code: saved.code }, { status: saved.code === "duplicate" ? 409 : 503 });
  }

  void appendInboxNotification({
    userEmail: owner.email,
    title: `${expert.name} 전문가가 견적 제안을 보냈어요`,
    body: message.length > 160 ? `${message.slice(0, 159)}…` : message,
    actionUrl: "/my/consultations#requests",
  }).catch(() => {});

  return NextResponse.json({ ok: true, proposal: saved.proposal }, { status: 201 });
}
