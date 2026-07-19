import crypto from "node:crypto";
import {
  TOSS_LOGIN_API_BASE_URL,
  getTossLoginDecryptAad,
  getTossLoginDecryptKey,
  getTossLoginPartnerAuthHeader,
} from "./toss-login";
import { logger } from "@/lib/log";

/**
 * 토스 로그인(앱인토스) 서버 플로우 — 서버 전용.
 * @see https://developers-apps-in-toss.toss.im/login/develop.md
 *
 * 1) 클라이언트가 appLogin()으로 받은 authorizationCode + referrer 를 서버로 전달
 * 2) generate-token 으로 accessToken/refreshToken 발급
 * 3) login-me 로 사용자 정보 조회(userKey + 암호화된 PII)
 * 4) AES-256-GCM 으로 PII 복호화
 */

const TOKEN_URL = "/api-partner/v1/apps-in-toss/user/oauth2/generate-token";
const REFRESH_URL = "/api-partner/v1/apps-in-toss/user/oauth2/refresh-token";
const LOGIN_ME_URL = "/api-partner/v1/apps-in-toss/user/oauth2/login-me";
const REMOVE_BY_ACCESS_TOKEN_URL =
  "/api-partner/v1/apps-in-toss/user/oauth2/access/remove-by-access-token";
const REMOVE_BY_USER_KEY_URL =
  "/api-partner/v1/apps-in-toss/user/oauth2/access/remove-by-user-key";

export type TossLoginReferrer = "DEFAULT" | "SANDBOX";

export type TossTokenResult = {
  tokenType: string;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  scope: string;
};

type TossSuccessEnvelope<T> = {
  resultType?: "SUCCESS" | "FAIL";
  success?: T | null;
  error?: { errorCode?: string; reason?: string } | string | null;
};

type TossTokenSuccess = {
  tokenType: string;
  accessToken: string;
  refreshToken: string;
  expiresIn: number | string;
  scope: string;
};

type TossLoginMeSuccess = {
  userKey: number;
  scope: string;
  agreedTerms?: string[];
  name?: string | null;
  phone?: string | null;
  birthday?: string | null;
  ci?: string | null;
  di?: string | null;
  gender?: string | null;
  nationality?: string | null;
  email?: string | null;
};

export type TossLoginProfile = {
  userKey: number;
  scope: string[];
  agreedTerms: string[];
  name: string | null;
  email: string | null;
  phone: string | null;
  birthday: string | null;
  ci: string | null;
  gender: "MALE" | "FEMALE" | null;
  nationality: "LOCAL" | "FOREIGNER" | null;
};

function apiUrl(path: string): string {
  return `${TOSS_LOGIN_API_BASE_URL}${path}`;
}

function jsonHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  const partnerAuth = getTossLoginPartnerAuthHeader();
  if (partnerAuth) headers.Authorization = partnerAuth;
  return { ...headers, ...extra };
}

/** 응답 봉투에서 에러 메시지를 추출(`{error}` 또는 `{resultType:FAIL, error:{...}}`). */
function extractError(json: unknown): string | null {
  if (!json || typeof json !== "object") return null;
  const j = json as TossSuccessEnvelope<unknown>;
  if (j.resultType === "SUCCESS") return null;
  if (typeof j.error === "string") return j.error;
  if (j.error && typeof j.error === "object") {
    return j.error.reason || j.error.errorCode || "토스 로그인 API 오류";
  }
  return null;
}

function normalizeToken(raw: TossTokenSuccess): TossTokenResult {
  return {
    tokenType: raw.tokenType,
    accessToken: raw.accessToken,
    refreshToken: raw.refreshToken,
    expiresIn: Number(raw.expiresIn) || 0,
    scope: raw.scope ?? "",
  };
}

/** 2. AccessToken 발급 (authorizationCode → token) */
export async function exchangeTossToken(
  authorizationCode: string,
  referrer: string,
): Promise<TossTokenResult> {
  const res = await fetch(apiUrl(TOKEN_URL), {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ authorizationCode, referrer }),
    cache: "no-store",
  });
  const json = (await res.json()) as TossSuccessEnvelope<TossTokenSuccess>;
  const err = extractError(json);
  if (!res.ok || err || !json.success?.accessToken) {
    throw new Error(err || `토스 토큰 발급 실패 (HTTP ${res.status})`);
  }
  return normalizeToken(json.success);
}

/** 3. AccessToken 재발급 (refreshToken → token) */
export async function refreshTossToken(
  refreshToken: string,
): Promise<TossTokenResult> {
  const res = await fetch(apiUrl(REFRESH_URL), {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ refreshToken }),
    cache: "no-store",
  });
  const json = (await res.json()) as TossSuccessEnvelope<TossTokenSuccess>;
  const err = extractError(json);
  if (!res.ok || err || !json.success?.accessToken) {
    throw new Error(err || `토스 토큰 재발급 실패 (HTTP ${res.status})`);
  }
  return normalizeToken(json.success);
}

/** 4. 사용자 정보 조회 (암호화된 PII 포함) */
export async function fetchTossUserRaw(
  accessToken: string,
): Promise<TossLoginMeSuccess> {
  const res = await fetch(apiUrl(LOGIN_ME_URL), {
    method: "GET",
    headers: jsonHeaders({ Authorization: `Bearer ${accessToken}` }),
    cache: "no-store",
  });
  const json = (await res.json()) as TossSuccessEnvelope<TossLoginMeSuccess>;
  const err = extractError(json);
  if (!res.ok || err || !json.success) {
    throw new Error(err || `토스 사용자 정보 조회 실패 (HTTP ${res.status})`);
  }
  return json.success;
}

/**
 * 5. 사용자 정보 복호화 — AES-256-GCM.
 *  - key: base64 디코딩한 복호화 키
 *  - AAD: 이메일로 전달받은 값
 *  - 암호문 = base64( IV(12B) || ciphertext || tag(16B) )
 * 복호화 키/AAD 미설정이거나 값이 비면 null 을 반환합니다(로그인 자체는 실패시키지 않음).
 */
export function decryptTossValue(encrypted: string | null | undefined): string | null {
  if (!encrypted) return null;
  const keyB64 = getTossLoginDecryptKey();
  const aad = getTossLoginDecryptAad();
  if (!keyB64) return null;
  try {
    const key = Buffer.from(keyB64, "base64");
    const buf = Buffer.from(encrypted, "base64");
    const IV_LENGTH = 12;
    const TAG_LENGTH = 16;
    if (buf.length <= IV_LENGTH + TAG_LENGTH) return null;
    const iv = buf.subarray(0, IV_LENGTH);
    const tag = buf.subarray(buf.length - TAG_LENGTH);
    const data = buf.subarray(IV_LENGTH, buf.length - TAG_LENGTH);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    if (aad) decipher.setAAD(Buffer.from(aad));
    decipher.setAuthTag(tag);
    const out = Buffer.concat([decipher.update(data), decipher.final()]);
    return out.toString("utf8");
  } catch (e) {
    logger.warn("[toss-login] decrypt failed", e);
    return null;
  }
}

function normalizeGender(v: string | null): "MALE" | "FEMALE" | null {
  return v === "MALE" || v === "FEMALE" ? v : null;
}

function normalizeNationality(v: string | null): "LOCAL" | "FOREIGNER" | null {
  return v === "LOCAL" || v === "FOREIGNER" ? v : null;
}

/** login-me 원본 응답 → 정규화·복호화된 프로필. */
function normalizeTossProfile(raw: TossLoginMeSuccess): TossLoginProfile {
  return {
    userKey: raw.userKey,
    scope: (raw.scope ?? "")
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean),
    agreedTerms: raw.agreedTerms ?? [],
    name: decryptTossValue(raw.name),
    email: decryptTossValue(raw.email),
    phone: decryptTossValue(raw.phone),
    birthday: decryptTossValue(raw.birthday),
    ci: decryptTossValue(raw.ci),
    gender: normalizeGender(decryptTossValue(raw.gender)),
    nationality: normalizeNationality(decryptTossValue(raw.nationality)),
  };
}

/**
 * authorizationCode → 정규화된 토스 로그인 프로필.
 * PII 는 복호화 키가 설정된 경우에만 복호화되며, 실패/미설정 시 해당 필드는 null 입니다.
 */
export async function loginWithTossAuthorizationCode(
  authorizationCode: string,
  referrer: string,
): Promise<TossLoginProfile> {
  const token = await exchangeTossToken(authorizationCode, referrer);
  const raw = await fetchTossUserRaw(token.accessToken);
  return normalizeTossProfile(raw);
}

/**
 * authorizationCode → 프로필 + 발급 토큰(access/refresh).
 * 토큰은 서버에서 안전하게 보관(연결 끊기/재조회용)하기 위해 함께 반환합니다.
 */
export async function exchangeTossLogin(
  authorizationCode: string,
  referrer: string,
): Promise<{ profile: TossLoginProfile; tokens: TossTokenResult }> {
  const tokens = await exchangeTossToken(authorizationCode, referrer);
  const raw = await fetchTossUserRaw(tokens.accessToken);
  return { profile: normalizeTossProfile(raw), tokens };
}

/** 6. AccessToken 으로 로그인 연결 끊기. */
export async function removeTossByAccessToken(accessToken: string): Promise<void> {
  const res = await fetch(apiUrl(REMOVE_BY_ACCESS_TOKEN_URL), {
    method: "POST",
    headers: jsonHeaders({ Authorization: `Bearer ${accessToken}` }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`토스 연결 끊기 실패 (HTTP ${res.status})`);
}

/** 6. userKey 로 로그인 연결 끊기. */
export async function removeTossByUserKey(
  accessToken: string,
  userKey: number,
): Promise<void> {
  const res = await fetch(apiUrl(REMOVE_BY_USER_KEY_URL), {
    method: "POST",
    headers: jsonHeaders({ Authorization: `Bearer ${accessToken}` }),
    body: JSON.stringify({ userKey }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`토스 연결 끊기(userKey) 실패 (HTTP ${res.status})`);
}
