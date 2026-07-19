import { getServiceSupabase } from "@/lib/supabase/service";
import { sendEmail } from "@/lib/notifications/resend-send";
import { logger } from "@/lib/log";

/** 비밀번호 재설정 이메일 직접 발송 (outbox 큐 우회, 즉시 전송) */
export async function sendPasswordResetEmail({
  toEmail,
  resetUrl,
}: {
  toEmail: string;
  resetUrl: string;
}): Promise<void> {
  const html = `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
      <h2 style="color:#1e293b;font-size:20px;margin-bottom:8px">비밀번호 재설정</h2>
      <p style="color:#475569;font-size:14px;line-height:1.6">
        아래 버튼을 눌러 비밀번호를 재설정해 주세요.<br>
        이 링크는 <strong>1시간</strong> 동안 유효합니다.
      </p>
      <a href="${resetUrl}"
         style="display:inline-block;margin:16px 0;padding:12px 24px;background:#3182f6;color:#fff;border-radius:10px;font-size:14px;font-weight:600;text-decoration:none">
        비밀번호 재설정하기
      </a>
      <p style="color:#94a3b8;font-size:12px">
        본 메일을 요청하지 않으셨다면 무시해 주세요.<br>
        링크를 직접 복사: ${resetUrl}
      </p>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0">
      <p style="color:#94a3b8;font-size:11px">우리동네이야기 · support@woodong.kr</p>
    </div>`;

  const text = `비밀번호 재설정 링크 (1시간 유효):\n${resetUrl}\n\n본 메일을 요청하지 않으셨다면 무시해 주세요.`;

  await sendEmail({
    to: toEmail,
    subject: "[우리동네이야기] 비밀번호 재설정 안내",
    html,
    text,
  }).catch(() => undefined);
}

export async function enqueueEmailNotification(input: {
  to: string;
  subject: string;
  body: string;
  metadata?: Record<string, unknown>;
}): Promise<boolean> {
  const sb = getServiceSupabase();
  if (!sb) {
    logger.info("[notify:outbox] Supabase 미설정 — 로그만:", input.subject);
    return false;
  }
  const { error } = await sb.from("notification_outbox").insert({
    channel: "email",
    to_email: input.to.trim(),
    subject: input.subject,
    body: input.body,
    metadata: input.metadata ?? {},
    status: "pending",
  });
  if (error) {
    logger.error("[notify:outbox]", error.message);
    return false;
  }
  return true;
}
