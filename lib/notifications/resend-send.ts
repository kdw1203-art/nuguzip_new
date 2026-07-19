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
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  if (!key || !from) {
    return { ok: false, error: "RESEND_API_KEY 또는 RESEND_FROM_EMAIL 없음" };
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
