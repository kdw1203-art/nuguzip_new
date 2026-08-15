import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getExpertByOwnerEmail } from "@/lib/experts/store-db";
import { getMarketRequestOwnerEmail } from "@/lib/market/store-db";
import { appendInboxNotification } from "@/lib/notifications/inbox";
import { rateLimit, getClientIp, tooManyRequests } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/market-requests/[id]/propose — 전문가 견적 제안 보내기.
 *
 * 견적 요청(market_requests)은 여태 쌓이기만 하고 **전문가가 응답할 경로가
 * 없었다**(실사 갭 #7 — 요청자에게 "전문가 연결" 을 약속하고 아무도 못 봤다).
 * 이 라우트가 그 루프를 닫는다: 인증 전문가가 제안 메시지를 보내면 요청자
 * 인박스로 알림이 가고, 알림은 전문가 상세 페이지(/town/experts/[id])로
 * 딥링크된다 — 요청자는 프로필을 보고 상담 신청으로 이어간다.
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

  try {
    await appendInboxNotification({
      userEmail: owner.email,
      title: `${expert.name} 전문가가 견적 제안을 보냈어요`,
      body: message,
      actionUrl: `/town/experts/${expert.id}`,
    });
  } catch {
    return NextResponse.json(
      { error: "제안 전송에 실패했어요. 잠시 후 다시 시도해 주세요." },
      { status: 503 },
    );
  }
  return NextResponse.json({ ok: true });
}
