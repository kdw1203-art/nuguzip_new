import {
  baseUrlForShell,
  detectShellFromHost,
  type PlatformShell,
} from "@/lib/platform-shell";

export type { PlatformShell };

/** 호스트 문자열로 데스크톱/모바일 셸 구분 (`m.` 접두면 mobile). */
export function detectShell(host?: string | null): PlatformShell {
  return detectShellFromHost(host);
}

/** 셸별 공개 사이트 베이스 URL (트레일링 슬래시 없음). */
export function siteBaseUrl(shell: PlatformShell): string {
  return baseUrlForShell(shell).replace(/\/+$/, "");
}

/** 동일 경로에 대한 절대 canonical URL. */
export function canonicalFor(pathname: string, shell: PlatformShell): string {
  const base = siteBaseUrl(shell);
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${base}${path === "//" ? "/" : path}`;
}
