import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { appendInboxNotification } from "@/lib/notifications/inbox";
import {
  ExpertVerificationUnavailableError,
  submitExpertApplication,
} from "@/lib/experts/verification-store";
import { dbUnavailable } from "@/lib/api/db-unavailable";
import { hasBlockingFraudHit } from "@/lib/experts/fraud-guards";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const expertType = String(body.expertType ?? body.category ?? "").trim();
  const name = String(body.name ?? "").trim();
  const city = String(body.city ?? "").trim();
  const district = String(body.district ?? "").trim();
  const bio = String(body.bio ?? body.introduction ?? "").trim();
  const yearsExp = Number(body.yearsExp ?? body.yearsExperience ?? 0);
  const specialties = Array.isArray(body.specialties)
    ? body.specialties.map(String)
    : String(body.specialties ?? "")
        .split(/[,，]/)
        .map((s) => s.trim())
        .filter(Boolean);
  const consent = (body.consent ?? {}) as { terms?: boolean; publicProfile?: boolean };

  if (!expertType || !name || !city || !bio) {
    return NextResponse.json(
      { error: "전문가 유형, 이름, 지역, 소개는 필수입니다." },
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
        documentUrls: Array.isArray(body.documentUrls)
          ? body.documentUrls.map(String)
          : [],
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

    if (hasBlockingFraudHit(auto.flags)) {
      return NextResponse.json(
        {
          error: auto.flags.find((f) => f.severity === "block")?.message ??
            "자동 검증에서 차단되었습니다.",
          code: "verification_blocked",
          flags: auto.flags,
        },
        { status: 409 },
      );
    }

    void appendInboxNotification({
      userEmail: session.user.email,
      title: "전문가 인증 접수 완료",
      body: "1차 자동 검증을 마쳤습니다. 문서·출처 검증 후 순차 안내드립니다.",
      actionUrl: "/my/consultations",
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
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "접수 실패" },
      { status: 500 },
    );
  }
}
