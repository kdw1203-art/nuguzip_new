import { getNcpAccessKey, getNcpSecretKey, ncpApigwHeaders } from "@/lib/ncp/apigw-signature";

export type SensMessageType = "SMS" | "LMS" | "MMS";

export type SensSendInput = {
  type?: SensMessageType;
  contentType?: "COMM" | "AD";
  countryCode?: string;
  from?: string;
  subject?: string;
  content: string;
  messages: Array<{
    to: string;
    subject?: string;
    content?: string;
  }>;
  reserveTime?: string;
  reserveTimeZone?: string;
};

export type SensSendResult =
  | {
      ok: true;
      requestId: string;
      requestTime: string;
      statusCode: string;
      statusName: string;
    }
  | {
      ok: false;
      status: number;
      error: string;
      body?: unknown;
    };

export function isNcpSensConfigured(): boolean {
  return Boolean(
    getNcpAccessKey() &&
      getNcpSecretKey() &&
      process.env.NCP_SENS_SERVICE_ID?.trim() &&
      process.env.NCP_SENS_FROM_NUMBER?.trim(),
  );
}

export function getSensConfigSummary() {
  return {
    configured: isNcpSensConfigured(),
    serviceId: process.env.NCP_SENS_SERVICE_ID?.trim() ?? null,
    fromNumber: maskPhone(process.env.NCP_SENS_FROM_NUMBER?.trim() ?? ""),
    hasAccessKey: Boolean(getNcpAccessKey()),
    hasSecretKey: Boolean(getNcpSecretKey()),
  };
}

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 8) return phone ? "***" : "";
  return `${digits.slice(0, 3)}****${digits.slice(-4)}`;
}

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

/**
 * NCP SENS SMS/LMS 발송
 * @see https://api.ncloud-docs.com/docs/sens-sms-send
 */
export async function sendSensSms(input: SensSendInput): Promise<SensSendResult> {
  const accessKey = getNcpAccessKey();
  const secretKey = getNcpSecretKey();
  const serviceId = process.env.NCP_SENS_SERVICE_ID?.trim();
  const defaultFrom = process.env.NCP_SENS_FROM_NUMBER?.trim();

  if (!accessKey || !secretKey || !serviceId || !defaultFrom) {
    return {
      ok: false,
      status: 503,
      error: "NCP SENS 환경변수가 설정되지 않았습니다.",
    };
  }

  const type = input.type ?? "SMS";
  const from = normalizePhone(input.from ?? defaultFrom);
  const messages = input.messages
    .map((m) => ({
      to: normalizePhone(m.to),
      ...(m.subject ? { subject: m.subject } : {}),
      ...(m.content ? { content: m.content } : {}),
    }))
    .filter((m) => m.to.length >= 10);

  if (!input.content.trim()) {
    return { ok: false, status: 400, error: "메시지 내용이 비어 있습니다." };
  }
  if (messages.length === 0) {
    return { ok: false, status: 400, error: "유효한 수신 번호가 없습니다." };
  }
  if (messages.length > 100) {
    return { ok: false, status: 400, error: "수신 번호는 최대 100건까지 가능합니다." };
  }

  const urlPath = `/sms/v2/services/${serviceId}/messages`;
  const body = {
    type,
    contentType: input.contentType ?? "COMM",
    countryCode: input.countryCode ?? "82",
    from,
    ...(input.subject ? { subject: input.subject } : {}),
    content: input.content,
    messages,
    ...(input.reserveTime ? { reserveTime: input.reserveTime } : {}),
    ...(input.reserveTimeZone ? { reserveTimeZone: input.reserveTimeZone } : {}),
  };

  const res = await fetch(`https://sens.apigw.ntruss.com${urlPath}`, {
    method: "POST",
    headers: ncpApigwHeaders("POST", urlPath, accessKey, secretKey),
    body: JSON.stringify(body),
  });

  const raw = await res.text();
  let parsed: Record<string, unknown> = {};
  try {
    parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    parsed = { raw };
  }

  if (!res.ok) {
    const errMsg =
      (typeof parsed.message === "string" && parsed.message) ||
      (typeof parsed.error === "string" && parsed.error) ||
      `SENS API 오류 (${res.status})`;
    return { ok: false, status: res.status, error: errMsg, body: parsed };
  }

  return {
    ok: true,
    requestId: String(parsed.requestId ?? ""),
    requestTime: String(parsed.requestTime ?? ""),
    statusCode: String(parsed.statusCode ?? res.status),
    statusName: String(parsed.statusName ?? "success"),
  };
}
