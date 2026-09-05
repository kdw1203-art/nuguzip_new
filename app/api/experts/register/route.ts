import { NextResponse } from "next/server";
import { EXPERT_TYPE_LABELS, isExpertTypeLabel, normalizeSpecialties } from "@/lib/experts/taxonomy";
import { auth } from "@/auth";
import { appendInboxNotification } from "@/lib/notifications/inbox";
import {
  ExpertApplicationBlockedError,
  ExpertApplicationPendingError,
  ExpertVerificationUnavailableError,
  submitExpertApplication,
} from "@/lib/experts/verification-store";
import { dbUnavailable } from "@/lib/api/db-unavailable";
import { validateDocumentUrls } from "@/lib/experts/fraud-guards";
import { rateLimit, getClientIp, tooManyRequests } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  /* [965] 접수 제한 — 계정당 1시간 3회, IP 당 1시간 10회. 예전엔 제한이 없어
     한 계정이 큐를 신청서로 채울 수 있었다(중복 접수 자체는 store 가 막는다). */
  const applicant = session.user.email.trim().toLowerCase();
  const rlUser = rateLimit(`expert-register:${applicant}`, { limit: 3, windowMs: 60 * 60_000 });
  if (!rlUser.ok) return tooManyRequests(rlUser.retryAfterSec);
  const rlIp = rateLimit(`expert-register:ip:${getClientIp(req)}`, { limit: 10, windowMs: 60 * 60_000 });
  if (!rlIp.ok) return tooManyRequests(rlIp.retryAfterSec);

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const expertType = String(body.expertType ?? body.category ?? "").trim();
  const name = String(body.name ?? "").trim();
  const city = String(body.city ?? "").trim();
  const district = String(body.district ?? "").trim();
  const bio = String(body.bio ?? body.introduction ?? "").trim();
  const yearsExp = Number(body.yearsExp ?? body.yearsExperience ?? 0);
  const specialties = normalizeSpecialties(
    Array.isArray(body.specialties)
      ? body.specialties.map(String)
      : String(body.specialties ?? "")
          .split(/[,，]/)
          .map((s) => s.trim())
          .filter(Boolean),
  );
  const consent = (body.consent ?? {}) as { terms?: boolean; publicProfile?: boolean };

  if (!expertType || !name || !city || !bio) {
    return NextResponse.json(
      { error: "전문가 유형, 이름, 지역, 소개는 필수입니다." },
      { status: 400 },
    );
  }
  /* [953] 유형은 분류 체계(lib/experts/taxonomy.ts)에 있는 것만 — 법률 서비스 등
     정책상 받지 않는 유형이 자유 입력으로 들어오는 길을 막는다. */
  if (!isExpertTypeLabel(expertType)) {
    return NextResponse.json(
      { error: `전문가 유형은 ${EXPERT_TYPE_LABELS.join("·")} 중 하나여야 합니다.` },
      { status: 400 },
    );
  }
  if (bio.length < 20) {
    return NextResponse.json(
      { error: "자기소개는 20자 이상 입력해 주세요." },
      { status: 400 },
    );
  }
  if (!consent.terms) {
    return NextResponse.json(
      { error: "전문가 운영정책 및 약관에 동의해 주세요." },
      { status: 400 },
    );
  }
  /* [965] 첨부 서류 링크 서버 검증(https·5개·공개 주소) — 화면 검증만 믿지 않는다 */
  const docs = validateDocumentUrls(body.documentUrls);
  if (!docs.ok) {
    return NextResponse.json({ error: docs.error, code: "invalid_document_urls" }, { status: 400 });
  }

  try {
    const { request, auto } = await submitExpertApplication(
      session.user.email,
      {
        expertType,
        name,
        city,
        district,
        bio,
        certNumber: body.certNumber ? String(body.certNumber) : null,
        yearsExp,
        specialties,
        phone: body.phone ? String(body.phone) : null,
        organization: body.organization ? String(body.organization) : null,
        documentUrls: docs.urls,
        businessRegNo: body.businessRegNo ? String(body.businessRegNo) : null,
        payoutAccountHolder: body.payoutAccountHolder
          ? String(body.payoutAccountHolder)
          : null,
        payoutAccountLast4: body.payoutAccountLast4
          ? String(body.payoutAccountLast4)
          : null,
        termsAgreed: true,
      },
      session.user.name,
    );

    /* [965] 접수 알림은 진행 상태를 보는 화면(/my/expert-profile)으로 — 예전엔
       상담함(/my/consultations)으로 보내 신청자가 자기 심사 상태를 볼 곳이 없었다.
       자동 검증에서 검토 플래그가 있으면 그 사실도 말한다. */
    const reviewFlags = auto.flags.filter((f) => f.severity !== "block");
    void appendInboxNotification({
      userEmail: session.user.email,
      title: "전문가 인증 신청을 접수했어요",
      body:
        reviewFlags.length > 0
          ? `자동 검증에서 확인이 필요한 항목 ${reviewFlags.length}건이 있어 운영자가 함께 검토합니다. 결과는 알림으로 알려드려요.`
          : "자동 검증을 통과했어요. 운영자가 서류·등록 상태를 확인한 뒤 결과를 알림으로 알려드려요.",
      actionUrl: "/my/expert-profile",
    });

    return NextResponse.json({
      ok: true,
      requestId: request.id,
      workflowStage: request.workflowStage,
      flags: auto.flags,
    });
  } catch (e) {
    /* 자동 검증 조회가 실패한 것은 "검증에서 떨어졌다"가 아니다. 500 으로
       뭉뚱그리지 않고, 다시 시도하면 되는 상태라는 것을 503 으로 말한다. */
    if (e instanceof ExpertVerificationUnavailableError) {
      return dbUnavailable("expert-register", e);
    }
    if (e instanceof ExpertApplicationBlockedError) {
      return NextResponse.json(
        { error: e.message, code: "verification_blocked", flags: e.auto.flags },
        { status: 409 },
      );
    }
    if (e instanceof ExpertApplicationPendingError) {
      return NextResponse.json(
        {
          error: "이미 심사 중인 신청이 있어요. 결과가 나오면 알림으로 알려드릴게요.",
          code: "application_pending",
          requestId: e.request.id,
          submittedAt: e.request.createdAt,
        },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "접수 실패" },
      { status: 500 },
    );
  }
}
