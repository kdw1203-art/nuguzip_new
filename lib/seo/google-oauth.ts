import "server-only";

import { createSign } from "node:crypto";

/**
 * 구글 서비스 계정 → 액세스 토큰 (JWT Bearer 흐름, RFC 7523).
 *
 * ── 왜 라이브러리를 안 쓰는가 ────────────────────────────────────────────
 * `googleapis` 패키지는 이 한 가지 용도로 쓰기에는 무겁다(수십 MB, 서버리스 콜드
 * 스타트에 그대로 얹힌다). 필요한 것은 "JWT 하나 만들어 RS256 으로 서명하고 토큰
 * 엔드포인트에 던지는 것"뿐이고, 그건 node:crypto 로 30줄이다. 의존성을 늘리지
 * 않는 편이 낫다.
 *
 * ── 키를 환경변수에 어떻게 넣는가 ────────────────────────────────────────
 * 서비스 계정 JSON 의 `client_email` 과 `private_key` 두 개만 있으면 된다.
 * private_key 는 여러 줄 PEM 이라 Vercel 환경변수에 넣을 때 줄바꿈이 `\n`
 * 문자열로 들어가는 경우가 많다 — 아래에서 둘 다 받아들인다.
 *
 *   GSC_SERVICE_ACCOUNT_EMAIL=...@....iam.gserviceaccount.com
 *   GSC_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMII...\n-----END PRIVATE KEY-----\n"
 *
 * 그리고 **서치콘솔 속성에 이 서비스 계정 이메일을 사용자로 추가**해야 한다
 * (권한: 전체 또는 제한). 이 단계를 빼먹으면 호출은 되는데 403 이 온다.
 */

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

export interface ServiceAccountCreds {
  clientEmail: string;
  privateKey: string;
}

export function readServiceAccountCreds(): ServiceAccountCreds | null {
  const clientEmail = process.env.GSC_SERVICE_ACCOUNT_EMAIL?.trim();
  const rawKey = process.env.GSC_SERVICE_ACCOUNT_PRIVATE_KEY?.trim();
  if (!clientEmail || !rawKey) return null;
  /* 따옴표째 붙여 넣는 실수가 잦고, 그때 서명은 "키가 틀렸다"가 아니라
     "PEM 파싱 실패"로 죽어 원인이 안 보인다. 여기서 벗겨 둔다. */
  const unquoted = rawKey.replace(/^["']|["']$/g, "");
  const privateKey = unquoted.includes("\\n") ? unquoted.replace(/\\n/g, "\n") : unquoted;
  return { clientEmail, privateKey };
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/* 토큰은 1시간짜리다. 같은 요청 안에서 URL 을 수십 개 검사하므로 매번 새로
   받아 올 이유가 없다. 프로세스 수명 동안만 들고 있는다(만료 60초 전에 버린다). */
let cached: { token: string; expiresAtMs: number } | null = null;

/**
 * 지정한 스코프의 액세스 토큰을 받는다.
 *
 * 실패하면 던진다 — 이 함수를 부르는 곳은 "토큰이 없으면 아무것도 못 하는" 경로라,
 * 빈 문자열을 돌려주면 그다음 호출이 401 로 죽으면서 원인이 한 겹 멀어진다.
 */
export async function getServiceAccountToken(
  scope: string,
  nowMs: number = Date.now(),
): Promise<string> {
  if (cached && cached.expiresAtMs > nowMs + 60_000) return cached.token;

  const creds = readServiceAccountCreds();
  if (!creds) throw new Error("GSC 서비스 계정 환경변수(GSC_SERVICE_ACCOUNT_EMAIL / _PRIVATE_KEY) 미설정");

  const iat = Math.floor(nowMs / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64url(
    JSON.stringify({
      iss: creds.clientEmail,
      scope,
      aud: TOKEN_ENDPOINT,
      exp: iat + 3600,
      iat,
    }),
  );

  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claim}`);
  const signature = base64url(signer.sign(creds.privateKey));
  const assertion = `${header}.${claim}.${signature}`;

  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`구글 토큰 발급 실패: HTTP ${res.status} ${text.slice(0, 200)}`);
  }

  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) throw new Error("구글 토큰 응답에 access_token 이 없습니다");

  cached = {
    token: json.access_token,
    expiresAtMs: nowMs + (json.expires_in ?? 3600) * 1000,
  };
  return cached.token;
}

/** 테스트·크론 재실행용 — 캐시된 토큰을 버린다. */
export function resetServiceAccountTokenCache(): void {
  cached = null;
}
