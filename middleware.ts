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

function applySecurityHeaders(response: NextResponse, request?: NextRequest) {
  const isDev = process.env.NODE_ENV === "development";
  const isApiPath = request?.nextUrl.pathname.startsWith("/api") ?? false;
  const isDocument =
    request?.headers.get("sec-fetch-dest") === "document" ||
    (request?.headers.get("accept")?.includes("text/html") ?? false);

  // CSP는 HTML 문서 응답에만 포함 (API·정적자산에는 불필요하고 노이즈)
  if (!isApiPath) {
    response.headers.set("Content-Security-Policy", buildContentSecurityPolicy(isDev));
  }
  // 모든 미들웨어 통과 응답에 타입 스니핑 방지 헤더 추가
  response.headers.set("X-Content-Type-Options", "nosniff");

  const deployId = currentDeployId();
  if (deployId) {
    response.cookies.set(DEPLOY_COOKIE, deployId, {
      path: "/",
      sameSite: "lax",
      secure: !isDev,
      maxAge: 60 * 60 * 24,
    });
  }
  response.cookies.set(CSP_REV_COOKIE, CSP_REVISION, {
    path: "/",
    sameSite: "lax",
    secure: !isDev,
    maxAge: 60 * 60 * 24 * 365,
  });

  if (isDocument) {
    // Vercel CDN이 추가하는 must-revalidate 포함 조합을 no-store로 덮어씀
    response.headers.set("Cache-Control", "no-store");
    response.headers.delete("Pragma");
    response.headers.delete("Expires");
    const cspCookie = request?.cookies.get(CSP_REV_COOKIE)?.value;
    if (cspCookie !== CSP_REVISION) {
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
  "/register": "/auth/signup",
  "/mypage": "/my",
  "/my-page": "/my",
  "/map-home": "/explore",
  "/map-price": "/map/price",
  "/map-analysis": "/map/analysis",
  "/terms": "/legal/terms",
  "/privacy": "/legal/privacy",
  "/create-post": "/community/write",
  "/community/create": "/community/write",
  "/create-meeting": "/groups/create",
  "/create-meeting-market": "/market/create",
  "/create-product": "/market/create",
  "/report": "/reports",
  "/subscriptions": "/subscription",
  "/subscription-management": "/my",
  "/subscription-calendar": "/subscription",
  "/subscription-schedule": "/subscription",
  "/meeting-market": "/market",
  "/admin-dashboard": "/admin",
  "/inspection-hub": "/inspection/hub",
  "/my-inspection": "/inspection/hub",
  "/my-inspections": "/inspection/hub",
  "/inspection/create-meeting": "/groups/create",
  "/inspection/create-report": "/inspection/hub?tab=reports",
  "/inspection/my-reports": "/inspection/hub?tab=reports",
  "/inspection/reports": "/inspection/hub?tab=reports",
  "/inspection/my-schedule": "/inspection/hub?tab=schedules",
  "/market/product/101": "/market",
  "/info/public-data": "/",
  "/comprehensive-calculator": "/calculators",
  "/investment-tools": "/calculators",
  "/compare-properties": "/property-search",
  "/property-comparison": "/property-search",
  "/apartment-comparison": "/property-search",
  "/properties": "/property-search",
  "/calculator/acquisition": "/calculator/tax",
  "/calculator/rent-vs-buy": "/calculator/investment",
  "/content-market": "/market",
  "/point-shop": "/pricing",
  "/expert": "/experts",
  "/expert-matching": "/experts",
  "/expert-verification": "/experts",
  "/development-info": "/info/redevelopment",
  "/news": "/community",
  "/notice": "/community",
  "/events": "/community",
  "/my-inspection-reports": "/inspection/hub",
  "/map/analysis": "/region-comparison",
  "/real-price": "/property-search",
  "/price-prediction": "/ai-analysis/ai-prediction",
  "/post/123": "/community",
  "/post/456": "/community",
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
};

function copyCookies(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach((c) => {
    to.cookies.set(c.name, c.value);
  });
}

function isDocumentRequest(request: NextRequest): boolean {
  return (
    request.headers.get("sec-fetch-dest") === "document" ||
    (request.headers.get("accept")?.includes("text/html") ?? false)
  );
}

/** stale HTML·SW 캐시 우회 — 문서 GET 을 ?_wd=<rev> 로 한 번 307 리다이렉트 */
function maybeForceCspRefresh(request: NextRequest): NextResponse | null {
  const host = normalizeHost(
    request.headers.get("x-forwarded-host") ?? request.headers.get("host"),
  );
  if (host === "localhost" || host.startsWith("127.")) return null;
  if (request.method !== "GET") return null;
  if (request.nextUrl.pathname.startsWith("/api")) return null;
  if (!isDocumentRequest(request)) return null;
  if (request.nextUrl.searchParams.get("_wd") === CSP_REVISION) return null;

  const url = request.nextUrl.clone();
  url.searchParams.set("_wd", CSP_REVISION);
  return applySecurityHeaders(NextResponse.redirect(url, 307), request);
}

export async function middleware(request: NextRequest) {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const isApi = request.nextUrl.pathname.startsWith("/api");
  const origin = request.headers.get("origin");
  const hostname = normalizeHost(host);

  if (hostname === "m.nuguzip.com") {
    const canonical = new URL(
      request.nextUrl.pathname + request.nextUrl.search,
      DEFAULT_DESKTOP_ORIGIN,
    );
    return applySecurityHeaders(NextResponse.redirect(canonical, 308), request);
  }

  const cspRefresh = maybeForceCspRefresh(request);
  if (cspRefresh) return cspRefresh;

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
    const redirect = NextResponse.redirect(u);
    copyCookies(sessionResponse, redirect);
    return applySecurityHeaders(redirect, request);
  }

  const postMatch = /^\/post\/([^/]+)$/.exec(path);
  if (postMatch) {
    const redirect = NextResponse.redirect(
      new URL(`/community/${postMatch[1]}`, request.url),
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
