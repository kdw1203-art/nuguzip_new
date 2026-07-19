import type {
  IdentityProvider,
  IdentityVerificationResult,
  IdentityVerificationStart,
  StartInput,
  VerifyInput,
} from "./types";
import { createTossSession, decryptTossField } from "./toss-crypto";

/**
 * 토스인증(간편인증 · 표준창 USER_NONE) 제공자.
 *
 * 흐름:
 *  1) startVerification → Access Token 발급 → 간편인증 요청(USER_NONE) → { txId, authUrl }
 *  2) 프런트는 TossCert SDK 표준창(authUrl, txId)으로 사용자 인증
 *  3) verifyResult → 결과조회(txId + 새 sessionKey) → personalData 복호화 → { verified, name, phone, ci }
 *
 * 필요한 환경변수: TOSS_CERT_CLIENT_ID, TOSS_CERT_CLIENT_SECRET
 * (선택) TOSS_CERT_OAUTH_URL, TOSS_CERT_API_URL, TOSS_CERT_PUBLIC_KEY
 */

const OAUTH_URL =
  process.env.TOSS_CERT_OAUTH_URL?.trim().replace(/\/$/, "") ||
  "https://oauth2.cert.toss.im";
const API_URL =
  process.env.TOSS_CERT_API_URL?.trim().replace(/\/$/, "") || "https://cert.toss.im";

const AUTH_EXPIRE_SECONDS = 60 * 30; // 표준창 유효시간(최대 1800초)

type TokenCache = { token: string; expiresAt: number };
let tokenCache: TokenCache | null = null;

function getCredentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.TOSS_CERT_CLIENT_ID?.trim();
  const clientSecret = process.env.TOSS_CERT_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error(
      "토스인증 자격증명이 없습니다. TOSS_CERT_CLIENT_ID·TOSS_CERT_CLIENT_SECRET 를 설정하세요.",
    );
  }
  return { clientId, clientSecret };
}

async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt > now + 60_000) return tokenCache.token;

  const { clientId, clientSecret } = getCredentials();
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope: "ca",
  });

  const res = await fetch(`${OAUTH_URL}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`토스 Access Token 발급 실패 (HTTP ${res.status})`);
  }
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) throw new Error("토스 Access Token 응답이 비어 있습니다.");

  const expiresIn = Number(json.expires_in) > 0 ? Number(json.expires_in) : 3600;
  tokenCache = { token: json.access_token, expiresAt: now + expiresIn * 1000 };
  return json.access_token;
}

type TossAuthRequestSuccess = {
  txId: string;
  authUrl?: string;
  appScheme?: string | null;
  requestedDt?: string;
};

type TossApiResponse<T> = {
  resultType: "SUCCESS" | "FAIL";
  success?: T | null;
  error?: { errorCode?: string; reason?: string; title?: string } | null;
};

export const tossIdentityProvider: IdentityProvider = {
  id: "toss",

  async startVerification(_input: StartInput): Promise<IdentityVerificationStart> {
    void _input;
    const token = await getAccessToken();
    const res = await fetch(`${API_URL}/api/v2/sign/user/auth/request`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requestType: "USER_NONE",
        expireSeconds: AUTH_EXPIRE_SECONDS,
      }),
      cache: "no-store",
    });

    const json = (await res.json()) as TossApiResponse<TossAuthRequestSuccess>;
    if (json.resultType !== "SUCCESS" || !json.success?.txId) {
      throw new Error(json.error?.reason || "토스 간편인증 요청에 실패했습니다.");
    }

    return {
      sessionId: json.success.txId,
      redirectUrl: json.success.authUrl,
      expiresAt: new Date(Date.now() + AUTH_EXPIRE_SECONDS * 1000).toISOString(),
    };
  },

  async verifyResult({ sessionId }: VerifyInput): Promise<IdentityVerificationResult> {
    const txId = sessionId;
    const token = await getAccessToken();

    // 결과조회는 매 호출마다 새 세션키를 생성해야 하고, 응답 복호화에 같은 세션을 사용합니다.
    const session = createTossSession();
    const res = await fetch(`${API_URL}/api/v2/sign/user/auth/result`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ txId, sessionKey: session.sessionKey }),
      cache: "no-store",
    });

    const json = (await res.json()) as TossApiResponse<{
      status?: string;
      personalData?: Record<string, string | null> | null;
      completedDt?: string;
    }>;

    if (json.resultType !== "SUCCESS" || !json.success) {
      return {
        verified: false,
        provider: "toss",
        message: json.error?.reason || "본인인증이 아직 완료되지 않았습니다.",
      };
    }
    if (json.success.status !== "COMPLETED") {
      return {
        verified: false,
        provider: "toss",
        message: "본인인증이 아직 완료되지 않았습니다. 토스 앱에서 인증을 마쳐 주세요.",
      };
    }

    const pd = json.success.personalData ?? {};
    return {
      verified: true,
      provider: "toss",
      name: decryptTossField(session, pd.name),
      phone: decryptTossField(session, pd.phone),
      birthdate: decryptTossField(session, pd.birthday),
      gender: decryptTossField(session, pd.gender),
      ci: decryptTossField(session, pd.ci),
      message: "토스 본인인증이 완료되었습니다.",
    };
  },
};
