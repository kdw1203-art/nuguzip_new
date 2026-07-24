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
  type ConsultType,
} from "@/lib/expert-consultations/store-db";
import { getExpert } from "@/lib/experts/store-db";
import { checkExpertConsultQuota, resolveQuotaPlan } from "@/lib/subscriptions/usage-summary";
import { withUserQuotaLock } from "@/lib/subscriptions/quota-lock";
import { FUNNEL_EVENT, recordFunnelEvent } from "@/lib/platform-funnel-events";
import { rateLimit, getClientIp, tooManyRequests } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    if (!expert || expert.ownerEmail !== session.user.email) {
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
    const quota = await checkExpertConsultQuota(userEmail, plan);
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

  // 전문가 본인 확인
  const expert = await getExpert(expertId);
  if (!expert || (expert.ownerEmail !== session.user.email && session.user.role !== "admin")) {
    return NextResponse.json({ error: "답변 권한이 없습니다." }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    consultationId?: string;
    replyMessage?: string;
  };

  const consultationId = String(body.consultationId ?? "").trim();
  const replyMessage = String(body.replyMessage ?? "").trim();

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
  return NextResponse.json({ ok: true, consultation: result });
}
