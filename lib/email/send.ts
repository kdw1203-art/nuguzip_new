/**
 * 이메일 발송 레이어 (프로바이더 추상화)
 *
 *  - RESEND_API_KEY 환경변수가 설정돼 있고 "re_" 로 시작하면 Resend REST API 로 발송.
 *  - 미설정이면 { sent: false, reason: "미설정" } 을 조용히 반환 (경고 로그는 최초 1회만).
 *
 * 발신 주소는 항상 "누구집 <noreply@nuguzip.com>" 을 사용합니다.
 */
import { logger } from "@/lib/log";

export const EMAIL_FROM = "누구집 <noreply@nuguzip.com>";

export interface SendEmailInput {
  to: string | string[];
  subject: string;
  html: string;
  /** 텍스트 대체 본문 (선택) */
  text?: string;
  /** 답장 받을 주소 (선택) */
  replyTo?: string;
}

export type SendEmailResult =
  | { sent: true; id?: string }
  | { sent: false; reason: string };

let warnedUnconfigured = false;

function resendApiKey(): string | null {
  const key = process.env.RESEND_API_KEY?.trim();
  return key && key.startsWith("re_") ? key : null;
}

/** 이메일 프로바이더(Resend)가 설정돼 있는지 여부 */
export function isEmailConfigured(): boolean {
  return resendApiKey() !== null;
}

/**
 * 이메일 발송. 프로바이더 미설정 시 실패 대신 { sent: false, reason: "미설정" } 반환.
 * 네트워크/API 오류도 throw 하지 않고 결과 객체로 돌려줍니다.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const key = resendApiKey();
  if (!key) {
    if (!warnedUnconfigured) {
      warnedUnconfigured = true;
      logger.warn(
        "[email] RESEND_API_KEY 미설정 — 이메일 발송을 건너뜁니다. (이 경고는 1회만 출력)",
      );
    }
    return { sent: false, reason: "미설정" };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: Array.isArray(input.to) ? input.to : [input.to],
        subject: input.subject,
        html: input.html,
        ...(input.text ? { text: input.text } : {}),
        ...(input.replyTo ? { reply_to: input.replyTo } : {}),
      }),
    });

    if (!res.ok) {
      const detail = (await res.text().catch(() => "")) || res.statusText;
      logger.error("[email] Resend 발송 실패:", res.status, detail.slice(0, 500));
      return { sent: false, reason: `HTTP ${res.status}` };
    }

    const json = (await res.json().catch(() => null)) as { id?: string } | null;
    return { sent: true, id: json?.id };
  } catch (e) {
    const reason = e instanceof Error ? e.message : "알 수 없는 오류";
    logger.error("[email] Resend 요청 오류:", reason);
    return { sent: false, reason };
  }
}
