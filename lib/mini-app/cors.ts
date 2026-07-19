/**
 * 앱인토스 미니앱(Webview) CORS 허용 — Edge 미들웨어 전용.
 *
 * 미니앱 번들은 다음 origin에서 서비스되며, 이 origin이 우리 API를 호출할 때만 CORS를 허용합니다.
 *  - 실제 서비스: https://<appName>.apps.tossmini.com
 *  - QR 테스트:   https://<appName>.private-apps.tossmini.com
 * @see https://developers-apps-in-toss.toss.im/development/deploy.md (CORS)
 *
 * 추가 origin이 필요하면 환경변수 MINI_APP_ALLOWED_ORIGINS(쉼표 구분, 정확한 origin)로 등록합니다.
 * 허용 origin이 아니면 어떤 CORS 헤더도 붙이지 않으므로, 웹뷰가 nuguzip.com을 직접 로드하는
 * 동일 출처 구성에서는 동작에 영향이 없습니다.
 */

const TOSSMINI_ORIGIN_RE =
  /^https:\/\/[a-z0-9-]+\.(?:apps|private-apps)\.tossmini\.com$/i;

function envAllowlist(): Set<string> {
  const raw = process.env.MINI_APP_ALLOWED_ORIGINS?.trim();
  if (!raw) return new Set();
  const out = new Set<string>();
  for (const part of raw.split(/[\s,]+/)) {
    const o = part.trim().replace(/\/$/, "");
    if (o) out.add(o);
  }
  return out;
}

/** 요청 origin이 미니앱 허용 대상인지. */
export function isAllowedMiniAppOrigin(origin: string | null): boolean {
  if (!origin) return false;
  if (TOSSMINI_ORIGIN_RE.test(origin)) return true;
  return envAllowlist().has(origin.replace(/\/$/, ""));
}

const ALLOW_METHODS = "GET,POST,PUT,PATCH,DELETE,OPTIONS";
const ALLOW_HEADERS = "Content-Type, Authorization, X-Requested-With";
const MAX_AGE = "86400"; // preflight 캐시 1일

/** 허용 origin이면 응답에 CORS 헤더를 부여합니다(아니면 무변경). */
export function applyMiniAppCors(headers: Headers, origin: string | null): void {
  if (!isAllowedMiniAppOrigin(origin)) return;
  headers.set("Access-Control-Allow-Origin", origin as string);
  headers.set("Access-Control-Allow-Credentials", "true");
  headers.set("Access-Control-Expose-Headers", "Content-Length");
  // 캐시가 origin별로 분기되도록(허용/비허용 응답 혼동 방지)
  appendVary(headers, "Origin");
}

/** OPTIONS preflight 응답 헤더(허용 origin 한정). */
export function applyMiniAppPreflight(headers: Headers, origin: string | null): void {
  if (!isAllowedMiniAppOrigin(origin)) return;
  applyMiniAppCors(headers, origin);
  headers.set("Access-Control-Allow-Methods", ALLOW_METHODS);
  headers.set("Access-Control-Allow-Headers", ALLOW_HEADERS);
  headers.set("Access-Control-Max-Age", MAX_AGE);
}

function appendVary(headers: Headers, value: string): void {
  const existing = headers.get("Vary");
  if (!existing) {
    headers.set("Vary", value);
    return;
  }
  const parts = existing.split(",").map((s) => s.trim().toLowerCase());
  if (!parts.includes(value.toLowerCase())) {
    headers.set("Vary", `${existing}, ${value}`);
  }
}
