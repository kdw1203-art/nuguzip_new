/**
 * 어드민 전문가 인증 심사 — PATCH /api/admin/experts
 * body: { id, action: "approve" | "reject", note? }
 *   - approve: expert_verification_requests 승인 → expert_profiles 생성/인증(J1 브리지)
 *   - reject:  접수 상태 반려(사유 필수)
 * 관리자 게이트: isAdminApiRequest. 결과는 신청자 인박스 알림 + 감사로그(best-effort).
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isAdminApiRequest } from "@/lib/admin/api-auth";
import { safeAuth } from "@/lib/safe-auth";
import {
  approveExpertVerification,
  rejectExpertVerification,
} from "@/lib/experts/verification-store";
import { appendInboxNotification } from "@/lib/notifications/inbox";
import { writeAuditLog } from "@/lib/audit/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest) {
  if (!(await isAdminApiRequest())) {
    return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  }
  const session = await safeAuth();
  const actorEmail = session?.user?.email?.trim().toLowerCase() || "admin";

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "JSON이 필요합니다." }, { status: 400 });
  }

  const id = String(body.id ?? "").trim();
  const action = String(body.action ?? "").trim();
  const note = String(body.note ?? body.reason ?? "").trim().slice(0, 500);
  if (!id || (action !== "approve" && action !== "reject")) {
    return NextResponse.json(
      { error: "id와 action(approve|reject)이 필요합니다." },
      { status: 400 },
    );
  }

  if (action === "approve") {
    const res = await approveExpertVerification(id, actorEmail, note || null);
    if (!res.ok) {
      return NextResponse.json({ error: res.error }, { status: 500 });
    }
    if (res.applicantEmail) {
      void appendInboxNotification({
        userEmail: res.applicantEmail,
        title: "전문가 인증이 승인되었어요",
        body: "인증이 완료되어 전문가 배지가 표시됩니다. 상담·프로필을 관리해 보세요.",
        actionUrl: "/my/consultations",
      });
    }
    void writeAuditLog({
      actorEmail,
      action: "expert.verify",
      targetType: "expert_verification_request",
      targetId: id,
      detail: { expertId: res.expertId, applicant: res.applicantEmail },
      ip: null,
    });
    return NextResponse.json({ ok: true, expertId: res.expertId });
  }

  // reject
  if (!note) {
    return NextResponse.json({ error: "반려 사유를 입력해 주세요." }, { status: 400 });
  }
  const res = await rejectExpertVerification(id, actorEmail, note);
  if (!res.ok) {
    return NextResponse.json({ error: res.error }, { status: 500 });
  }
  if (res.applicantEmail) {
    void appendInboxNotification({
      userEmail: res.applicantEmail,
      title: "전문가 인증이 반려되었어요",
      body: `제출하신 인증 신청이 반려되었어요. 사유: ${note}`,
      actionUrl: "/town/experts",
    });
  }
  void writeAuditLog({
    actorEmail,
    action: "expert.reject",
    targetType: "expert_verification_request",
    targetId: id,
    detail: { note },
    ip: null,
  });
  return NextResponse.json({ ok: true });
}
