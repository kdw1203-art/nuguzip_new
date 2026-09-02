import { EMAIL_FROM } from "@/lib/email/send";

/** 범용 이메일 발송 함수 (Resend 래퍼) */
export async function sendEmail(input: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<{ ok: boolean; error?: string }> {
  return trySendViaResend(input);
}

/** Resend HTTP API (의존성 없이 fetch) */
export async function trySendViaResend(input: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const key = process.env.RESEND_API_KEY?.trim();
  /* 고도화 49 — 발신명 단일화. RESEND_FROM_EMAIL 이 있으면 그 값을,
     없으면 lib/email/send 의 표준 발신자("내집나우 <noreply@…>")를 쓴다.
     두 발송 경로(email/send · resend-send)가 서로 다른 발신명으로 나가면
     수신함에서 다른 서비스처럼 보이고 스팸 평판도 갈라진다. */
  const from = process.env.RESEND_FROM_EMAIL?.trim() || EMAIL_FROM;
  if (!key) {
    return { ok: false, error: "RESEND_API_KEY 없음" };
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: input.subject,
      html: input.html,
      ...(input.text ? { text: input.text } : {}),
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    return { ok: false, error: t || res.statusText };
  }
  return { ok: true };
}
