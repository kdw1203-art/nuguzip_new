import { NextRequest, NextResponse } from "next/server";
import { applyPrivateSiteGate } from "@/lib/site-private-edge";
import { DEFAULT_DESKTOP_ORIGIN, detectShellFromHost, normalizeHost } from "@/lib/platform-shell";
import { WOODONG_PATHNAME_HEADER } from "@/lib/seo/request-pathname";
import { updateSession } from "@/utils/supabase/middleware";
import {
  applyMiniAppCors,
  applyMiniAppPreflight,
  isAllowedMiniAppOrigin,
} from "@/lib/mini-app/cors";
import { buildContentSecurityPolicy } from "@/lib/security/content-security-policy";
import { CSP_REV_COOKIE, CSP_REVISION, currentDeployId, DEPLOY_COOKIE } from "@/lib/security/deploy-sync";
import {
  CRAWLER_ENDPOINT_CACHE_CONTROL,
  isCrawlerEndpoint,
  publicDocumentCacheControl,
} from "@/lib/http/cache-policy";

function applySecurityHeaders(response: NextResponse, request?: NextRequest) {
  const isDev = process.env.NODE_ENV === "development";
  const isApiPath = request?.nextUrl.pathname.startsWith("/api") ?? false;
  // robots.txt·sitemap.xml 은 Accept 에 text/html 이 섞여 와서 문서로 오인된다.
  // 크롤러에게 세션 쿠키·Clear-Site-Data 를 심을 이유가 없으므로 따로 뗀다.
  const isCrawlerDoc = isCrawlerEndpoint(request?.nextUrl.pathname ?? "");
  const isDocument =
    !isCrawlerDoc &&
    (request?.headers.get("sec-fetch-dest") === "document" ||
      (request?.headers.get("accept")?.includes("text/html") ?? false));

  // CSP는 HTML 문서 응답에만 포함 (API·정적자산에는 불필요하고 노이즈)
  if (!isApiPath) {
    response.headers.set("Content-Security-Policy", buildContentSecurityPolicy(isDev));
  }
  // 모든 미들웨어 통과 응답에 타입 스니핑 방지 헤더 추가
  response.headers.set("X-Content-Type-Options", "nosniff");

  /* ── G5 공유 캐시 가능 여부를 "우리 쿠키를 심기 전에" 판정한다 ──────────────
     이전 구현은 배포·CSP 쿠키를 먼저 심고 나서 `cookies.getAll().length > 0` 로
     캐시 가능 여부를 봤다. 그런데 그 두 쿠키는 쿠키를 안 들고 오는 요청(= 첫 방문,
     CDN 재검증, 크롤러)에는 **항상** 붙는다. 그래서 조건이 영영 참이 되지 않아
     공개 캐시 헤더가 단 한 번도 나가지 못했다(운영에서 실측 확인).

     여기서 재는 것은 "사용자별 상태"뿐이다. 이 시점의 쿠키는 updateSession 이 실은
     Supabase 세션 갱신 쿠키밖에 없다. 배포 ID·CSP 리비전은 배포 전역 상수라
     사용자 상태가 아니지만, Set-Cookie 가 붙은 응답은 공유 캐시가 저장하지 않으므로
     공유 가능한 응답에는 아예 심지 않는다.

     안전 근거 — 쿠키를 건너뛰어도 배포 갱신 감지는 죽지 않는다:
     deploy-sync 인라인 스크립트가 `wd-deploy` 쿠키가 없으면 /api/health 를 찔러
     deployId·cspRevision 을 직접 확인한다(API 응답은 공유 캐시 대상이 아니라 항상
     쿠키가 실린다). 즉 첫 요청 뒤 한 번의 폴링으로 스스로 복구된다. */
  const carriesUserState = response.cookies.getAll().length > 0;
  const publicCache =
    request && !isCrawlerDoc ? publicDocumentCacheControl(request.nextUrl.pathname) : null;
  const shareable =
    !carriesUserState && (isCrawlerDoc || (isDocument && Boolean(publicCache)));

  const deployId = currentDeployId();
  const needsDeployCookie =
    !isCrawlerDoc &&
    !shareable &&
    Boolean(deployId) &&
    request?.cookies.get(DEPLOY_COOKIE)?.value !== deployId;
  if (deployId && needsDeployCookie) {
    response.cookies.set(DEPLOY_COOKIE, deployId, {
      path: "/",
      sameSite: "lax",
      secure: !isDev,
      maxAge: 60 * 60 * 24,
    });
  }
  const needsCspCookie =
    !isCrawlerDoc &&
    !shareable &&
    request?.cookies.get(CSP_REV_COOKIE)?.value !== CSP_REVISION;
  if (needsCspCookie) {
    response.cookies.set(CSP_REV_COOKIE, CSP_REVISION, {
      path: "/",
      sameSite: "lax",
      secure: !isDev,
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  if (isCrawlerDoc) {
    /* G6 — robots.txt·sitemap.xml 은 요청자와 무관하게 같은 내용이라 공유 캐시 가능.
       단 이 응답에 세션 쿠키가 실렸다면(로그인 사용자가 브라우저로 연 경우) 공개
       문서와 같은 이유로 캐시를 포기한다. 근거는 lib/http/cache-policy.ts 주석 참고. */
    response.headers.set(
      "Cache-Control",
      shareable ? CRAWLER_ENDPOINT_CACHE_CONTROL : "no-store",
    );
    response.headers.delete("Pragma");
    response.headers.delete("Expires");
  } else if (isDocument) {
    /* G5 — 공개 prerender 라우트만 CDN 공유 캐시를 허용한다.
       세션 쿠키가 실린 응답(로그인 사용자)은 사용자별 상태가 섞였으므로 no-store.
       판단 근거와 대상 목록은 lib/http/cache-policy.ts 주석 참고. */
    if (shareable) {
      response.headers.set("Cache-Control", publicCache as string);
    } else {
      // Vercel CDN이 추가하는 must-revalidate 포함 조합을 no-store로 덮어씀
      response.headers.set("Cache-Control", "no-store");
    }
    response.headers.delete("Pragma");
    response.headers.delete("Expires");
    if (needsCspCookie) {
      /* CSP 리비전 쿠키를 실제로 새로 심는 응답에서만 낡은 캐시를 비운다.
         쿠키를 심지 않는(= 공유 캐시로 나가는) 응답에 이게 섞이면 그 한 벌을 받는
         모든 방문자의 브라우저 캐시를 지우게 된다. needsCspCookie 는 위에서 이미
         !shareable 로 묶여 있어 그 경우가 나오지 않는다. */
      response.headers.set("Clear-Site-Data", '"cache"');
    }
  } else if (isApiPath) {
    if (!response.headers.has("Cache-Control")) {
      response.headers.set("Cache-Control", "no-store");
    }
    response.headers.delete("Pragma");
    response.headers.delete("Expires");
  }

  return response;
}

function requestWithPathnameHeader(request: NextRequest): NextRequest {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(WOODONG_PATHNAME_HEADER, request.nextUrl.pathname);
  return new NextRequest(request.nextUrl, { headers: requestHeaders });
}

/**
 * Vite export `src/utils/routes.tsx` 경로를 Next App Router에 맞춥니다.
 * (flat `map-price` ↔ `/map/price` 등)
 */
export const EXACT_REDIRECTS: Record<string, string> = {
  /** `/login` `/my` `/subscription` `/calculator` 는 새 앱의 실제 페이지 — 레거시 매핑 제거 */
  /** 모든 타깃은 "실존 라우트로 1홉 직행" 원칙 (개편 감사 P0-4) — 죽은 타깃·2단 홉 금지 */
  "/register": "/signup",
  "/mypage": "/my",
  "/my-page": "/my",
  "/map-home": "/map",
  "/map-price": "/map",
  "/map-analysis": "/map",
  "/map/price": "/map",
  "/map/analysis": "/map",
  "/region-comparison": "/map",
  "/terms": "/legal/terms",
  "/privacy": "/legal/privacy",
  "/create-post": "/town/write",
  "/community/create": "/town/write",
  "/community/write": "/town/write",
  "/create-meeting": "/town/groups",
  "/inspection/create-meeting": "/town/groups",
  "/groups/create": "/town/groups",
  "/create-meeting-market": "/town/market",
  "/create-product": "/town/market",
  "/market": "/town/market",
  "/market/create": "/town/market",
  "/market/product/101": "/town/market",
  "/meeting-market": "/town/market",
  "/content-market": "/town/market",
  "/report": "/analysis",
  "/reports": "/analysis",
  "/subscriptions": "/subscription",
  "/subscription-management": "/my",
  "/subscription-calendar": "/subscription",
  "/subscription-schedule": "/subscription",
  "/admin-dashboard": "/admin",
  "/inspection-hub": "/notes",
  "/inspection/hub": "/notes",
  "/my-inspection": "/notes",
  "/my-inspections": "/notes",
  "/my-inspection-reports": "/notes",
  "/inspection/create-report": "/notes",
  "/inspection/my-reports": "/notes",
  "/inspection/reports": "/notes",
  "/inspection/my-schedule": "/notes",
  "/info/public-data": "/",
  "/comprehensive-calculator": "/calculator",
  "/investment-tools": "/calculator",
  "/calculator/acquisition": "/calculator",
  "/calculator/rent-vs-buy": "/calculator",
  "/calculator/tax": "/calculator",
  "/calculator/investment": "/calculator",
  "/compare-properties": "/search",
  "/property-comparison": "/search",
  "/apartment-comparison": "/search",
  "/properties": "/search",
  "/property-search": "/search",
  "/real-price": "/search",
  "/point-shop": "/subscription",
  "/expert": "/town/experts",
  "/expert-matching": "/town/experts",
  "/expert-verification": "/town/experts",
  "/development-info": "/town/news",
  "/info/redevelopment": "/town/news",
  "/news": "/town",
  "/notice": "/town",
  "/events": "/town",
  "/price-prediction": "/analysis/timing",
  "/ai-analysis/ai-prediction": "/analysis/timing",
  "/supabase-guide": "/",
  "/supabase-connect": "/",
  /** 구 경로 → 새 앱 경로 매핑 */
  "/community": "/town",
  "/ai-analysis": "/analysis",
  "/ai": "/analysis",
  "/auth/login": "/login",
  "/auth/signup": "/signup",
  "/auth/register": "/signup",
  "/auth/forgot-password": "/forgot-password",
  "/auth/reset-password": "/reset-password",
  "/pricing": "/subscription",
  "/explore": "/map",
  "/experts": "/town/experts",
  "/calculators": "/calculator",
  "/chat": "/town/groups",
  /** 중복 페이지 정리 (감사 P1-1·P1-2·P1-4·정리표) — 페이지 삭제 후 canonical 로 흡수 */
  "/upgrade": "/subscription",
  "/my/dashboard": "/my",
  "/library": "/my",
  "/billing/success": "/payment/success?provider=stripe",
};

function copyCookies(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach((c) => {
    to.cookies.set(c.name, c.value);
  });
}

/**
 * 구 `?_wd=<rev>` 캐시 우회 파라미터 제거 — URL 을 https://nuguzip.com/ 형태로
 * 유지해야 네이버 지도 등 도메인/URL 등록형 API 연동이 가능하다.
 * (stale 캐시 대응은 CSP_REV_COOKIE + Clear-Site-Data + deploy-sync 스크립트가 담당)
 * 과거 공유·북마크된 `?_wd=` 링크는 파라미터를 벗겨 308 정규화한다.
 */
function maybeStripLegacyWdParam(request: NextRequest): NextResponse | null {
  if (request.method !== "GET") return null;
  if (!request.nextUrl.searchParams.has("_wd")) return null;
  const url = request.nextUrl.clone();
  url.searchParams.delete("_wd");
  return applySecurityHeaders(NextResponse.redirect(url, 308), request);
}

export async function middleware(request: NextRequest) {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const isApi = request.nextUrl.pathname.startsWith("/api");
  const origin = request.headers.get("origin");
  const hostname = normalizeHost(host);

  // m.·www. → 정식 도메인(nuguzip.com) 정규화 — 네이버 지도 등 URL 등록형 API 대응
  if (hostname === "m.nuguzip.com" || hostname === "www.nuguzip.com") {
    const canonical = new URL(
      request.nextUrl.pathname + request.nextUrl.search,
      DEFAULT_DESKTOP_ORIGIN,
    );
    canonical.searchParams.delete("_wd");
    return applySecurityHeaders(NextResponse.redirect(canonical, 308), request);
  }

  const wdStrip = maybeStripLegacyWdParam(request);
  if (wdStrip) return wdStrip;

  // 앱인토스 미니앱(Webview) CORS
  if (isApi && isAllowedMiniAppOrigin(origin)) {
    if (request.method === "OPTIONS") {
      const preflight = new NextResponse(null, { status: 204 });
      preflight.headers.set("Content-Type", "text/plain; charset=utf-8");
      applyMiniAppPreflight(preflight.headers, origin);
      return applySecurityHeaders(preflight, request);
    }
  }

  // 운영(production) 배포를 배포별 `*.vercel.app` URL(예: nuguzip-<hash>-...vercel.app)로
  // 열면 그 URL은 매 배포마다 바뀌어 네이버 지도 등 "도메인 화이트리스트" 기능이 깨진다.
  // 정식 도메인(nuguzip.com)으로 308 정규화해 항상 등록된 origin에서 동작하게 한다.
  // (preview 배포는 VERCEL_ENV !== "production" 이라 리다이렉트하지 않음 → 미리보기 테스트 보존)
  if (process.env.VERCEL_ENV === "production") {
    if (hostname.endsWith(".vercel.app")) {
      const canonical = new URL(
        request.nextUrl.pathname + request.nextUrl.search,
        DEFAULT_DESKTOP_ORIGIN,
      );
      const redirect = NextResponse.redirect(canonical, 308);
      return applySecurityHeaders(redirect, request);
    }
  }

  const sessionResponse = await updateSession(requestWithPathnameHeader(request));
  const shell = detectShellFromHost(host);
  const path = request.nextUrl.pathname.replace(/\/$/, "") || "/";

  // 단일 도메인 운영: 과거 `/m/*` 모바일 도메인 경로 레거시는 동일 도메인 루트 경로로 정규화합니다.
  if (path === "/m" || path.startsWith("/m/")) {
    const normalizedMobilePath = path === "/m" ? "/" : path.replace(/^\/m/, "");
    const target = new URL(normalizedMobilePath || "/", request.url);
    request.nextUrl.searchParams.forEach((v, k) => target.searchParams.set(k, v));
    const redirect = NextResponse.redirect(target);
    copyCookies(sessionResponse, redirect);
    return applySecurityHeaders(redirect, request);
  }

  const target = EXACT_REDIRECTS[path];
  if (target) {
    const u = new URL(target, request.url);
    request.nextUrl.searchParams.forEach((v, k) => {
      if (k === "next" && !u.searchParams.has("callbackUrl")) {
        u.searchParams.set("callbackUrl", v);
      } else if (k !== "next") {
        u.searchParams.set(k, v);
      }
    });
    // 레거시 경로는 영구 이전 — 308 로 검색엔진 색인 이관
    const redirect = NextResponse.redirect(u, 308);
    copyCookies(sessionResponse, redirect);
    return applySecurityHeaders(redirect, request);
  }

  // 구 커뮤니티 게시글 경로(/post/:id, /community/:id) → /town 피드로 1홉 직행.
  // (/community, /community/write, /community/create 는 위 EXACT_REDIRECTS 에서 먼저 처리됨)
  const postMatch = /^\/(?:post|community)\/([^/]+)$/.exec(path);
  if (postMatch) {
    const redirect = NextResponse.redirect(
      new URL(`/town?post=${encodeURIComponent(postMatch[1])}`, request.url),
      308,
    );
    copyCookies(sessionResponse, redirect);
    return applySecurityHeaders(redirect, request);
  }

  const gated = await applyPrivateSiteGate(request, sessionResponse);
  gated.headers.set("x-woodong-shell", shell);
  if (isApi) applyMiniAppCors(gated.headers, origin);
  return applySecurityHeaders(gated, request);
}

export const config = {
  matcher: [
    /*
     * Supabase 세션 갱신 + 레거시 리다이렉트
     * 정적 자산·이미지는 제외
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
