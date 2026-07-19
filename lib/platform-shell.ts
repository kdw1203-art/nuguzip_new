export type PlatformShell = "desktop" | "mobile";

/** 실운영 기본 origin (환경변수·호스트 파싱 실패 시). 모바일·데스크톱 단일 도메인. */
export const DEFAULT_DESKTOP_ORIGIN = "https://nuguzip.com";
/**
 * @deprecated 단일 도메인 운영으로 전환되어 데스크톱 origin과 동일합니다.
 * 남은 참조 호환을 위해 유지합니다.
 */
export const DEFAULT_MOBILE_ORIGIN = DEFAULT_DESKTOP_ORIGIN;

function trimHost(host: string): string {
  return host.trim().toLowerCase().replace(/\.$/, "");
}

/**
 * 호스트명만 소문자로 정규화 (포트·경로·프로토콜 제거).
 * 비정상 문자만 있으면 빈 문자열 → 셸은 desktop 으로 처리.
 */
export function normalizeHost(input: string | null | undefined): string {
  if (!input) return "";
  const host = trimHost(String(input).split(",")[0] ?? "");
  const withoutProtocol = host.replace(/^https?:\/\//, "");
  const hostname = withoutProtocol.split("/")[0]?.split(":")[0] ?? "";
  if (!hostname) return "";
  if (!/^[a-z0-9.-]+$/i.test(hostname)) return "";
  return hostname.toLowerCase();
}

/**
 * 단일 도메인 운영으로 전환되어 항상 "desktop" 을 반환합니다.
 * (모바일/데스크톱 UI는 호스트가 아니라 뷰포트 기준 반응형으로 동작)
 *
 * 과거 `m.` 서브도메인 기반 셸 분리를 제거했습니다. 시그니처는 호출부 호환을 위해 유지합니다.
 */
export function detectShellFromHost(_host?: string | null): PlatformShell {
  void _host;
  return "desktop";
}

const MOBILE_UA_RE = /Android|iPhone|iPod|iPad|Mobile|Windows Phone|BlackBerry|Opera Mini|IEMobile/i;

/**
 * User-Agent로 모바일/데스크톱 판별 (분석·세그먼트용).
 * 단일 도메인 운영에서 호스트로는 셸을 구분할 수 없으므로, 플랫폼 통계는 UA로 추정한다.
 * UA가 없으면 desktop (보수적 기본값).
 */
export function detectShellFromUserAgent(userAgent: string | null | undefined): PlatformShell {
  if (!userAgent) return "desktop";
  return MOBILE_UA_RE.test(userAgent) ? "mobile" : "desktop";
}

function stripTrailingSlash(s: string): string {
  return s.replace(/\/+$/, "");
}

/** `https://https://...` 등 이중 프로토콜·공백 제거. */
export function sanitizeOriginUrl(input: string | null | undefined): string {
  if (!input) return "";
  let s = String(input).trim();
  s = stripTrailingSlash(s);
  while (/^https?:\/\//i.test(s)) {
    const rest = s.replace(/^https?:\/\//i, "");
    if (/^https?:\/\//i.test(rest)) s = rest;
    else break;
  }
  return stripTrailingSlash(s);
}

/** 스킴 없는 host·도메인 문자열에 http/https 부여. */
export function ensureOriginWithScheme(origin: string): string {
  const s = stripTrailingSlash(origin.trim());
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  const host = s.split("/")[0]?.split(":")[0]?.toLowerCase() ?? "";
  const isLocal =
    host === "localhost" || host.startsWith("127.") || host === "0.0.0.0" || host.endsWith(".local");
  return isLocal ? `http://${s}` : `https://${s}`;
}

export function desktopBaseUrl(): string {
  const candidates = [
    process.env.NEXT_PUBLIC_DESKTOP_APP_URL?.trim(),
    process.env.AUTH_URL?.trim(),
    process.env.NEXT_PUBLIC_APP_URL?.trim(),
  ];
  for (const raw of candidates) {
    const s = sanitizeOriginUrl(raw);
    if (s) return ensureOriginWithScheme(s);
  }
  if (process.env.VERCEL_URL) {
    const v = sanitizeOriginUrl(`https://${process.env.VERCEL_URL}`);
    if (v) return ensureOriginWithScheme(v);
  }
  return DEFAULT_DESKTOP_ORIGIN;
}

/**
 * 단일 도메인 운영: 모바일도 데스크톱과 동일한 origin을 사용하며 UI는 뷰포트 기준 반응형으로 동작합니다.
 * (과거 `m.` 서브도메인 분리 운영에서 통합)
 */
export function mobileBaseUrl(): string {
  return desktopBaseUrl();
}

export function baseUrlForShell(shell: PlatformShell): string {
  return shell === "mobile" ? mobileBaseUrl() : desktopBaseUrl();
}

export function detectShellFromRequestLike(headers: {
  get(name: string): string | null | undefined;
}): PlatformShell {
  const forwarded = headers.get("x-forwarded-host");
  const host = headers.get("host");
  return detectShellFromHost(forwarded || host);
}

/**
 * Stripe success/cancel 등 리다이렉트용 공개 origin.
 * - localhost / 127.* / 비정상 Host → `desktopBaseUrl()` (로컬은 env로 http 설정 권장)
 * - 그 외 https
 */
export function resolvePublicOriginFromHeaders(headers: Headers): string {
  const raw = (headers.get("x-forwarded-host") ?? headers.get("host") ?? "").split(",")[0]?.trim();
  if (!raw) return stripTrailingSlash(desktopBaseUrl());

  const withoutProto = raw.replace(/^https?:\/\//i, "");
  const hostPort = withoutProto.split("/")[0] ?? "";
  const hostname = (hostPort.split(":")[0] ?? "").toLowerCase();

  if (!hostname || !/^[a-z0-9.-]+$/i.test(hostname)) {
    return stripTrailingSlash(desktopBaseUrl());
  }

  const isLocal =
    hostname === "localhost" ||
    hostname.startsWith("127.") ||
    hostname === "0.0.0.0" ||
    hostname.endsWith(".local");

  if (isLocal) {
    const port = hostPort.includes(":") ? hostPort.split(":").pop() : process.env.PORT ?? "3000";
    return stripTrailingSlash(`http://${hostname}:${port ?? "3000"}`);
  }

  return `https://${hostname}`;
}
