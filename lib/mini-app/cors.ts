/**
 * 앱인토스 미니앱(Webview) CORS 허용 — Edge 미들웨어 전용.
 *
 * 미니앱 번들은 다음 origin에서 서비스되며, 이 origin이 우리 API를 호출할 때만 CORS를 허용합니다.
 * appName 은 **우리 앱 슬러그 하나**로 고정합니다(TOSS_MINI_APP_SLUG, 기본 `nuguzip`).
 *  - 실제 서비스: https://<appName>.apps.tossmini.com
 *  - QR 테스트:   https://<appName>.private-apps.tossmini.com
 * @see https://developers-apps-in-toss.toss.im/development/deploy.md (CORS)
 *
 * 추가 origin이 필요하면 환경변수 MINI_APP_ALLOWED_ORIGINS(쉼표 구분, 정확한 origin)로 등록합니다.
 * 허용 origin이 아니면 어떤 CORS 헤더도 붙이지 않으므로, 웹뷰가 nuguzip.com을 직접 로드하는
 * 동일 출처 구성에서는 동작에 영향이 없습니다.
 */

/**
 * 미니앱 슬러그(= 서브도메인). 기본값은 이 서비스의 앱 이름.
 *
 * 예전 정규식은 서브도메인을 `[a-z0-9-]+` 로 열어 뒀다. 그러면 **다른 개발자의**
 * 토스 미니앱(evil.apps.tossmini.com) 도 전부 통과하고, 아래에서 함께 세우는
 * `Access-Control-Allow-Credentials: true` 때문에 그 앱이 방문자의 세션 쿠키를
 * 실어 우리 API 를 호출할 수 있다(= CSRF 를 브라우저가 대신 해 주는 셈).
 * 우리 슬러그 하나로 좁힌다. 다른 origin 이 필요하면 종전대로
 * MINI_APP_ALLOWED_ORIGINS 에 **정확한 origin** 으로 등록한다.
 */
function tossMiniAppSlug(): string {
  return process.env.TOSS_MINI_APP_SLUG?.trim().toLowerCase() || "nuguzip";
}

function tossMiniOriginRe(): RegExp {
  const slug = tossMiniAppSlug().replace(/[^a-z0-9-]/g, "");
  return new RegExp(
    `^https://${slug}\\.(?:apps|private-apps)\\.tossmini\\.com$`,
    "i",
  );
}

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
  if (tossMiniOriginRe().test(origin)) return true;
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
