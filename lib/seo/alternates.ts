import type { Metadata } from "next";
import { headers } from "next/headers";
import { canonicalFor } from "@/lib/platform-host";
import { DEFAULT_DESKTOP_ORIGIN, desktopBaseUrl, detectShellFromHost } from "@/lib/platform-shell";
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
 * G6 — 경로만 알면 되는 canonical + hreflang.
 *
 * 브랜드 도메인(`naezipnow.com`)을 기준으로 절대 URL을 만든다. 프리뷰 배포에서도
 * 같은 값이 나가는데, 이게 맞다: 프리뷰 URL 이 색인되면 안 되고 canonical 은
 * 운영 주소를 가리켜야 한다.
 *
 * 서비스는 한국어 단일 도메인이라 대체 언어판이 없다. 그래도 ko-KR/x-default 를
 * 같은 URL 로 명시해 두면, 크롤러가 지역 변형을 임의로 추정하지 않는다.
 * (없는 언어판을 지어내지 않는다 — 실제로 존재하는 URL 하나만 가리킨다.)
 *
 * 쿼리스트링은 canonical 에 넣지 않는다. `?utm_source=...` 같은 값이 붙은 요청이
 * 별도 URL 로 색인돼 색인 신호가 쪼개지는 걸 막는 게 canonical 의 본래 목적이다.
 */
export function seoAlternates(pathname: string): NonNullable<Metadata["alternates"]> {
  const path = normalizePathname(pathname.split(/[?#]/)[0] ?? "/");
  const url = `${DEFAULT_DESKTOP_ORIGIN}${path === "/" ? "/" : path}`;
  return {
    canonical: url,
    languages: {
      "ko-KR": url,
      "x-default": url,
    },
  };
}

/**
 * 현재 요청 URL 기준 canonical + hreflang(단일 도메인 기준 ko/x-default).
 * `middleware`가 `WOODONG_PATHNAME_HEADER`를 넣어야 경로별로 정확합니다.
 * 단일 도메인 운영이므로 모바일 전용 alternate(media)는 두지 않습니다.
 *
 * 경로를 이미 아는 페이지(대부분의 랜딩)는 `seoAlternates(path)` 를 쓰세요 —
 * `headers()` 를 읽지 않으므로 라우트를 동적 렌더로 끌어내리지 않습니다.
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
