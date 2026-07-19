import type { Metadata } from "next";
import { headers } from "next/headers";
import { canonicalFor } from "@/lib/platform-host";
import { desktopBaseUrl, detectShellFromHost } from "@/lib/platform-shell";
import { WOODONG_PATHNAME_HEADER } from "@/lib/seo/request-pathname";

function normalizePathname(raw: string | null): string {
  if (!raw || raw === "") return "/";
  const p = raw.startsWith("/") ? raw : `/${raw}`;
  if (p.length > 1 && p.endsWith("/")) {
    return p.replace(/\/+$/, "") || "/";
  }
  return p;
}

/**
 * 현재 요청 URL 기준 canonical + hreflang(단일 도메인 기준 ko/x-default).
 * `middleware`가 `WOODONG_PATHNAME_HEADER`를 넣어야 경로별로 정확합니다.
 * 단일 도메인 운영이므로 모바일 전용 alternate(media)는 두지 않습니다.
 */
export async function buildAlternatesForRequest(): Promise<NonNullable<Metadata["alternates"]>> {
  const h = await headers();
  const shell = detectShellFromHost(h.get("x-forwarded-host") ?? h.get("host"));
  const pathname = normalizePathname(h.get(WOODONG_PATHNAME_HEADER));
  const base = desktopBaseUrl().replace(/\/+$/, "");
  const samePath = pathname === "/" ? "/" : pathname;
  return {
    canonical: canonicalFor(pathname, shell),
    languages: {
      "ko-KR": `${base}${samePath}`,
      "x-default": `${base}${samePath}`,
    },
  };
}
