/**
 * POST /api/experts/[id]/consult    — 전문가 상담 신청
 * GET  /api/experts/[id]/consult    — 내 상담 내역 조회 (해당 전문가)
 * PATCH /api/experts/[id]/consult   — 전문가가 답변 등록 (expertOwner 전용)
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  createConsultation,
  listConsultationsForExpert,
  listMyConsultations,
  replyConsultation,
  closeConsultation,
  type ConsultType,
} from "@/lib/expert-consultations/store-db";
import { getExpert, refreshExpertResponseStats } from "@/lib/experts/store-db";
import { appendInboxNotification } from "@/lib/notifications/inbox";
import { checkExpertConsultQuota, resolveQuotaPlan } from "@/lib/subscriptions/usage-summary";
import { withUserQuotaLock } from "@/lib/subscriptions/quota-lock";
import { FUNNEL_EVENT, recordFunnelEvent } from "@/lib/platform-funnel-events";
import { rateLimit, getClientIp, tooManyRequests } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isOwner(ownerEmail: string | null | undefined, sessionEmail: string): boolean {
  return Boolean(ownerEmail) && ownerEmail!.trim().toLowerCase() === sessionEmail.trim().toLowerCase();
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { id: expertId } = await params;
  const url = new URL(req.url);
  const mode = url.searchParams.get("mode") ?? "my";

  if (mode === "expert") {
    // 전문가 본인만 조회 가능
    const expert = await getExpert(expertId);
    /* [965] 소유자 비교는 소문자 정규화 — 세션 이메일은 provider 가 준 대소문자
       그대로 올 수 있고 owner_email 은 소문자로 저장된다. */
    if (!expert || !isOwner(expert.ownerEmail, session.user.email)) {
      if (session.user.role !== "admin") {
        return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
      }
    }
    const items = await listConsultationsForExpert(expertId);
    return NextResponse.json({ items });
  }

  // 내 상담 내역
  const items = await listMyConsultations(session.user.email);
  const filtered = items.filter((c) => c.expertId === expertId);
  return NextResponse.json({ items: filtered });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  // IP당 1시간에 10회 (인스턴스별 best-effort)
  const rl = rateLimit(`consult:${getClientIp(req)}`, { limit: 10, windowMs: 60 * 60_000 });
  if (!rl.ok) return tooManyRequests(rl.retryAfterSec);

  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { id: expertId } = await params;
  const expert = await getExpert(expertId);
  if (!expert) {
    return NextResponse.json({ error: "전문가를 찾을 수 없습니다." }, { status: 404 });
  }
  /* [965] 인증 전 프로필에는 상담을 받지 않는다 — 상세 화면은 "인증 심사 중" 을
     그리는데 API 는 신청을 받아 사용량(한도)까지 소모했다. 인증이 나야 상담이 열린다. */
  if (!expert.isVerified) {
    return NextResponse.json(
      {
        error: "이 전문가는 아직 인증 심사 중이라 상담 신청을 받을 수 없어요. 인증이 끝나면 열립니다.",
        code: "expert_unverified",
      },
      { status: 409 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    message?: string;
    contactInfo?: string;
    preferredTime?: string;
    consultType?: ConsultType;
  };

  const message = String(body.message ?? "").trim();
  if (!message || message.length < 10) {
    return NextResponse.json(
      { error: "상담 내용은 10자 이상 입력해 주세요." },
      { status: 400 },
    );
  }
  if (message.length > 2000) {
    return NextResponse.json(
      { error: "상담 내용은 2,000자 이하로 입력해 주세요." },
      { status: 400 },
    );
  }

  const userEmail = session.user.email;

  return withUserQuotaLock(`consult:${userEmail}`, async () => {
    const plan = await resolveQuotaPlan(userEmail, session.user.plan);
    /* 사용량 조회 실패는 한도 통과가 아니다 — 503 으로 멈춘다. */
    let quota: Awaited<ReturnType<typeof checkExpertConsultQuota>>;
    try {
      quota = await checkExpertConsultQuota(userEmail, plan);
    } catch {
      return NextResponse.json(
        { error: "사용량을 지금 확인할 수 없어 상담 요청을 진행하지 않았어요. 잠시 후 다시 시도해 주세요." },
        { status: 503 },
      );
    }
    if (!quota.allowed) {
      return NextResponse.json(
        {
          error: quota.message,
          code: quota.code,
          requiredTier: quota.requiredTier === "basic" ? "pro" : quota.requiredTier,
          usage: { used: quota.used, limit: quota.limit },
        },
        { status: 403 },
      );
    }

    try {
      const consultation = await createConsultation({
        expertId,
        expertLabel: expert.name,
        userEmail,
        userName: session.user.name ?? userEmail,
        message,
        contactInfo: body.contactInfo ? String(body.contactInfo).trim() : undefined,
        preferredTime: body.preferredTime ? String(body.preferredTime).trim() : undefined,
        type: body.consultType ?? "text",
      });
      void recordFunnelEvent(req, {
        eventName: FUNNEL_EVENT.EXPERT_CONSULT_SUBMIT,
        userEmail,
        path: `/api/experts/${expertId}/consult`,
        metadata: { expertId, consultationId: consultation.id },
      });
      return NextResponse.json({ ok: true, consultation }, { status: 201 });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "상담 신청 실패" },
        { status: 500 },
      );
    }
  });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { id: expertId } = await params;

  const body = (await req.json().catch(() => ({}))) as {
    consultationId?: string;
    replyMessage?: string;
    action?: string;
  };

  const consultationId = String(body.consultationId ?? "").trim();
  const replyMessage = String(body.replyMessage ?? "").trim();

  /* [953] 의뢰자 마감 — 아직 답변이 없는 내 상담을 접는다(전문가 응답률 분모에서
     빠진다). 본인 소유(requester_email) 확인은 내 상담 목록에서 찾는 것으로 대신한다. */
  if (body.action === "close") {
    if (!consultationId) {
      return NextResponse.json({ error: "consultationId가 필요합니다." }, { status: 400 });
    }
    const mine = (await listMyConsultations(session.user.email)).find(
      (c) => c.id === consultationId && c.expertId === expertId,
    );
    if (!mine) return NextResponse.json({ error: "내 상담이 아니에요." }, { status: 403 });
    if (mine.status !== "pending") {
      return NextResponse.json({ error: "답변이 있거나 이미 마감된 상담이에요." }, { status: 409 });
    }
    const ok = await closeConsultation(consultationId);
    if (!ok) return NextResponse.json({ error: "마감 실패" }, { status: 500 });
    void refreshExpertResponseStats(expertId).catch(() => {});
    return NextResponse.json({ ok: true });
  }

  // 전문가 본인 확인
  const expert = await getExpert(expertId);
  if (!expert || (!isOwner(expert.ownerEmail, session.user.email) && session.user.role !== "admin")) {
    return NextResponse.json({ error: "답변 권한이 없습니다." }, { status: 403 });
  }

  if (!consultationId || !replyMessage) {
    return NextResponse.json(
      { error: "consultationId, replyMessage가 필요합니다." },
      { status: 400 },
    );
  }

  const result = await replyConsultation(consultationId, replyMessage, expertId);
  if (!result) {
    return NextResponse.json({ error: "답변 실패" }, { status: 500 });
  }
  /* 답변 알림 — 신청 완료 화면이 "답변은 알림으로 안내됩니다"라고 약속한다.
     [953] 의뢰자 상담함(/my/consultations)이 생겼으므로 거기로 딥링크한다 — 답변
     전문과 후기 작성 버튼이 그 화면에 있다. */
  void appendInboxNotification({
    userEmail: result.userEmail,
    title: `${expert.name} 전문가 답변이 도착했어요`,
    body: replyMessage.length > 160 ? `${replyMessage.slice(0, 159)}…` : replyMessage,
    actionUrl: "/my/consultations#sent",
  }).catch(() => {});
  /* [953] 응답률·상담 완료 수를 프로필 컬럼에 반영 — 목록 정렬("응답 빠른 순")과
     카드 지표가 실측값을 쓴다. 실패해도 답변 자체는 이미 저장됐다. */
  void refreshExpertResponseStats(expertId).catch(() => {});
  return NextResponse.json({ ok: true, consultation: result });
}
