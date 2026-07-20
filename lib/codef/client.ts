import "server-only";
import { logger } from "@/lib/log";

/**
 * CODEF(codef.io) API 클라이언트 — 환경변수로 자격 증명이 설정된 경우에만 동작.
 *
 * 필요 env:
 *  - CODEF_CLIENT_ID / CODEF_CLIENT_SECRET : OAuth2 클라이언트 (developer.codef.io 발급)
 *  - CODEF_PUBLIC_KEY : RSA 공개키 (비밀번호·인증정보 암호화용, 데모/정식 콘솔에서 발급)
 *  - CODEF_ENV : "demo" | "api" (기본 demo)
 *
 * 자격 증명이 없으면 isCodefConfigured()=false, 모든 호출은 null 을 반환한다(정상 폴백).
 * 컨테이너에서는 codef.io 로 나가는 네트워크가 없을 수 있으므로 실패는 항상 graceful.
 */

const TOKEN_HOST = "https://oauth.codef.io";
function apiBase(): string {
  return (process.env.CODEF_ENV ?? "demo") === "api"
    ? "https://api.codef.io"
    : "https://development.codef.io";
}

export function isCodefConfigured(): boolean {
  return Boolean(
    process.env.CODEF_CLIENT_ID?.trim() &&
      process.env.CODEF_CLIENT_SECRET?.trim(),
  );
}

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string | null> {
  if (!isCodefConfigured()) return null;
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }
  const id = process.env.CODEF_CLIENT_ID!.trim();
  const secret = process.env.CODEF_CLIENT_SECRET!.trim();
  const basic = Buffer.from(`${id}:${secret}`).toString("base64");
  try {
    const res = await fetch(
      `${TOKEN_HOST}/oauth/token?grant_type=client_credentials&scope=read`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${basic}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!res.ok) {
      logger.error("[codef] token request failed", res.status);
      return null;
    }
    const data = (await res.json()) as {
      access_token?: string;
      expires_in?: number;
    };
    if (!data.access_token) return null;
    cachedToken = {
      value: data.access_token,
      expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
    };
    return cachedToken.value;
  } catch (e) {
    logger.error("[codef] token error", e);
    return null;
  }
}

/**
 * CODEF 상품 호출. CODEF 응답 본문은 URL-encoded JSON 문자열이므로 디코드해 반환.
 * @returns 파싱된 응답 객체 또는 null(미설정·오류·2way 추가인증 필요).
 */
export async function callCodef(
  path: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
  const token = await getAccessToken();
  if (!token) return null;
  try {
    const res = await fetch(`${apiBase()}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      logger.error("[codef] call failed", path, res.status);
      return null;
    }
    // CODEF 는 URL-encoded JSON 을 반환
    const raw = await res.text();
    const decoded = decodeURIComponent(raw);
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch (e) {
    logger.error("[codef] call error", path, e);
    return null;
  }
}

/** CODEF 응답에서 data 객체 추출 (result.code === "CF-00000" 성공) */
export function codefData(
  resp: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!resp) return null;
  const result = resp.result as { code?: string } | undefined;
  if (result?.code && result.code !== "CF-00000") {
    // CF-03002 등 추가인증 필요 → 대량 수집에서는 스킵
    return null;
  }
  const data = resp.data;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    return data as Record<string, unknown>;
  }
  return null;
}
