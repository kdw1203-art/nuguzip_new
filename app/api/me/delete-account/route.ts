import { NextResponse, type NextRequest } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { getServiceSupabase } from "@/lib/supabase/service";
import { applyRateLimit, AUTH_RATE_LIMIT } from "@/lib/rate-limit";
import { isEmailConfigured, sendEmail } from "@/lib/email/send";
import { emailLayout, escapeHtml } from "@/lib/email/templates";
import { getBusinessInfo } from "@/lib/brand/business-info";
import { logger } from "@/lib/log";
import { maskEmailPublic } from "@/lib/privacy/mask-email";
import { DELETE_CONFIRM_WORD, DELETE_GRACE_DAYS as GRACE_DAYS } from "@/lib/account/deletion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/me/delete-account — 회원탈퇴 요청(서비스 내 기능).
 *
 * [965] 이용약관·FAQ 는 "서비스 내 회원탈퇴 기능" 을 약속했는데 설정 화면은
 * "고객센터로 메일" 이었다. 여기서 접수하고, 절차는 docs/ops/privacy-requests.md 의
 * SOP 그대로다:
 *   접수 즉시 — 로그인 차단(app_users.is_banned) · 공개 콘텐츠 비공개(임장노트·매물)
 *   30일 유예 — 취소는 고객센터(가입 이메일에서 보낸 메일만)
 *   30일 뒤   — SOP 4·5 항대로 파기(법령 보존 대상은 가명화해 보존)
 * 자동결제(billing_subscriptions.active) 가 살아 있으면 먼저 해지해야 한다(약관).
 * 단건 이용권의 남은 기간은 탈퇴와 함께 소멸한다 — 화면이 그 사실을 먼저 알린다.
 */
export async function POST(req: NextRequest) {
  const limited = await applyRateLimit(req, AUTH_RATE_LIMIT);
  if (limited) return limited;

  const session = await safeAuth();
  const email = session?.user?.email?.trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    confirm?: unknown;
    reason?: unknown;
  };
  if (String(body.confirm ?? "").trim() !== DELETE_CONFIRM_WORD) {
    return NextResponse.json(
      { error: `확인을 위해 '${DELETE_CONFIRM_WORD}' 를 정확히 입력해 주세요.`, code: "confirm_mismatch" },
      { status: 400 },
    );
  }
  const reason =
    typeof body.reason === "string" ? body.reason.trim().slice(0, 500) || null : null;

  const sb = getServiceSupabase();
  if (!sb) {
    return NextResponse.json(
      { error: "지금은 탈퇴 요청을 받을 수 없습니다. 고객센터로 문의해 주세요." },
      { status: 503 },
    );
  }

  /* 관리자 계정은 앱 안에서 탈퇴하지 않는다 — 운영 권한이 사라지는 사고를 막는다 */
  if (session?.user?.role === "admin") {
    return NextResponse.json(
      { error: "관리자 계정은 앱에서 탈퇴할 수 없어요. 운영 절차로 처리해 주세요.", code: "admin_account" },
      { status: 403 },
    );
  }

  /* 자동결제가 살아 있으면 먼저 해지 */
  try {
    const { data: sub } = await sb
      .from("billing_subscriptions")
      .select("id, status")
      .eq("user_email", email)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (sub) {
      return NextResponse.json(
        {
          error: "자동결제 구독이 진행 중이에요. 구독을 먼저 해지한 뒤 탈퇴할 수 있어요.",
          code: "active_subscription",
        },
        { status: 409 },
      );
    }
  } catch {
    /* 표가 없는 배포 — 구독 없음으로 본다 */
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    null;
  const ua = req.headers.get("user-agent")?.slice(0, 300) ?? null;
  const purgeAfter = new Date(Date.now() + GRACE_DAYS * 86_400_000);

  const { error: insErr } = await sb.from("account_deletion_requests").insert({
    user_email: email,
    reason,
    ip_address: ip,
    user_agent: ua,
    purge_after: purgeAfter.toISOString(),
  });
  if (insErr) {
    if (insErr.code === "23505") {
      return NextResponse.json(
        { error: "이미 탈퇴 요청이 접수돼 있어요.", code: "already_requested" },
        { status: 409 },
      );
    }
    logger.error("[me/delete-account] 요청 기록 실패", {
      code: insErr.code,
      message: insErr.message,
      email: maskEmailPublic(email),
    });
    return NextResponse.json(
      { error: "탈퇴 요청을 기록하지 못했어요. 잠시 후 다시 시도해 주세요." },
      { status: 500 },
    );
  }

  /* 접수 즉시: 로그인 차단 + 마케팅 수신 해제 */
  const { error: banErr } = await sb
    .from("app_users")
    .update({
      is_banned: true,
      ban_until: null,
      ban_reason: "account_deletion_requested",
      marketing_agreed: false,
      consent_updated_at: new Date().toISOString(),
    })
    .eq("email", email);
  if (banErr) {
    logger.error("[me/delete-account] 로그인 차단 실패", {
      message: banErr.message,
      email: maskEmailPublic(email),
    });
  }

  /* 공개 콘텐츠 비공개 — 실패해도 요청은 유지(SOP 2항을 운영자가 재확인) */
  const hidden: Record<string, number | "error"> = {};
  try {
    const { data } = await sb
      .from("inspection_notes")
      .update({ is_public: false })
      .eq("author_email", email)
      .eq("is_public", true)
      .select("id");
    hidden.inspection_notes = data?.length ?? 0;
  } catch {
    hidden.inspection_notes = "error";
  }
  try {
    const { data } = await sb
      .from("listings")
      .update({ is_hidden: true })
      .eq("author_email", email)
      .is("deleted_at", null)
      .select("id");
    hidden.listings = data?.length ?? 0;
  } catch {
    hidden.listings = "error";
  }

  /* 접수 회신 메일 — 취소 방법과 파기 예정일을 알린다(SOP 1항) */
  if (isEmailConfigured()) {
    const biz = getBusinessInfo();
    const purgeDate = purgeAfter.toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "Asia/Seoul",
    });
    void sendEmail({
      to: email,
      subject: "[내집나우] 회원탈퇴 요청을 접수했어요",
      html: emailLayout(`
        <h1 style="margin:0 0 12px;font-size:18px;color:#0B2545;">회원탈퇴 요청을 접수했어요</h1>
        <p style="margin:0 0 12px;font-size:14px;line-height:1.7;color:#333;">
          지금부터 로그인이 막히고 공개했던 임장노트·매물은 비공개로 바뀝니다.<br/>
          개인정보는 <b>${escapeHtml(purgeDate)}</b> 이후 파기됩니다(법령상 보존 의무가 있는
          결제·환불 기록 등은 가명 처리해 보존).
        </p>
        <p style="margin:0 0 12px;font-size:14px;line-height:1.7;color:#333;">
          마음이 바뀌셨다면 그 전에 <b>가입한 이메일로</b>
          <a href="mailto:${escapeHtml(biz.privacyEmail)}" style="color:#1D4FD8;">${escapeHtml(biz.privacyEmail)}</a>
          에 "탈퇴 취소" 라고 보내 주세요. 계정을 다시 열어 드립니다.
        </p>
      `),
    }).catch(() => {});
  }

  logger.info("[me/delete-account] 탈퇴 요청 접수", {
    email: maskEmailPublic(email),
    hidden,
    purgeAfter: purgeAfter.toISOString(),
  });

  return NextResponse.json({
    ok: true,
    purgeAfter: purgeAfter.toISOString(),
    graceDays: GRACE_DAYS,
    hidden,
  });
}
