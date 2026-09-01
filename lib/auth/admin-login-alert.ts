import "server-only";
import { appendInboxNotification } from "@/lib/notifications/inbox";
import { isEmailConfigured, sendEmail } from "@/lib/email/send";
import { emailLayout, escapeHtml } from "@/lib/email/templates";
import { logger } from "@/lib/log";

/**
 * [945 · 실사용50 #36] 관리자 로그인 알림 — 계정 방어의 관측 축.
 *
 * 관리자 세션은 곧 전체 데이터다. 탈취를 "막는" 2차 인증 전(카카오/OTP 도입
 * 전)에도, **알아채는** 것은 지금 바로 할 수 있다: 관리자 계정 로그인이 성공할
 * 때마다 운영 수신함([HEALTH] = ops 채널)과 경보 메일(RESEND 설정 시)에 남긴다.
 *
 * 본인 로그인에도 알림이 온다 — 그게 정상이다. "내가 안 했는데 왔다"가
 * 이 장치가 잡으려는 단 하나의 사건이고, 그 판별은 본인만 할 수 있다.
 *
 * fire-and-forget: 알림 실패가 로그인을 막지 않는다.
 */
export async function notifyAdminLogin(input: {
  email: string;
  provider: string;
}): Promise<void> {
  const when = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
  const body = `[HEALTH] 관리자 로그인 — ${input.email} · ${input.provider} · ${when} KST. 본인이 아니면 즉시 비밀번호를 교체하세요.`;
  try {
    await appendInboxNotification({
      userEmail: input.email,
      title: "관리자 로그인 알림",
      body,
      actionUrl: "/admin/ops",
    });
  } catch (e) {
    logger.warn("[admin-login-alert] 수신함 적재 실패", e);
  }
  if (isEmailConfigured()) {
    try {
      const alertTo = process.env.ALERT_EMAIL_TO?.trim() || input.email;
      await sendEmail({
        to: alertTo,
        subject: `[누구집 보안] 관리자 로그인 — ${when}`,
        html: emailLayout(`
          <h1 style="margin:0 0 10px;font-size:17px;color:#191f28;">관리자 계정 로그인</h1>
          <table style="width:100%;border-collapse:collapse;font-size:14px;color:#3d4657;">
            <tr><td style="padding:6px 12px 6px 0;color:#8a94a6;">계정</td><td style="padding:6px 0;font-weight:700;">${escapeHtml(input.email)}</td></tr>
            <tr><td style="padding:6px 12px 6px 0;color:#8a94a6;">방식</td><td style="padding:6px 0;">${escapeHtml(input.provider)}</td></tr>
            <tr><td style="padding:6px 12px 6px 0;color:#8a94a6;">시각</td><td style="padding:6px 0;">${escapeHtml(when)} KST</td></tr>
          </table>
          <p style="margin:14px 0 0;font-size:13px;line-height:1.7;color:#8a94a6;">
            본인의 로그인이면 조치가 필요 없습니다. 본인이 아니라면 즉시 비밀번호를
            교체하고 세션을 무효화하세요(AUTH_SECRET 교체 = 전체 세션 로그아웃).
          </p>`),
        text: `[누구집 보안] 관리자 로그인 — ${input.email} · ${input.provider} · ${when} KST`,
      });
    } catch (e) {
      logger.warn("[admin-login-alert] 메일 발송 실패", e);
    }
  }
}
