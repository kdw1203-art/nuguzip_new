import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { SITEMAP_PATHS } from "@/lib/seo/sitemap-slugs";

const SITEMAP_PATH_SET = new Set(SITEMAP_PATHS);

/** Edge 미들웨어에서만 사용 (Node 전용 API 호출 금지) */
export function isPrivateSiteEnabled(): boolean {
  const v = process.env.PRIVATE_SITE?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

/**
 * 비공개 모드에서도 인증·정적·헬스 등은 통과시킵니다.
 * 레거시 단축 URL(/login 등)은 middleware 앞단 리다이렉트 후 /auth/* 로만 들어옵니다.
 */
export function isPublicPathForPrivateGate(pathname: string): boolean {
  const p =
    pathname.endsWith("/") && pathname.length > 1
      ? pathname.slice(0, -1)
      : pathname;

  if (p === "/api/health") return true;
  if (p === "/favicon.ico" || p === "/robots.txt") return true;
  /* N4 — 사이트맵 인덱스 + 유형별 자식(/sitemap-complexes.xml 등), 그리고 RSS 피드.
     인덱스만 열어 두면 크롤러가 인덱스는 읽고 자식은 로그인 벽을 만나 사이트맵이
     통째로 무의미해진다. 실을 내용은 인덱스와 같은 공개 데이터뿐이다. */
  if (SITEMAP_PATH_SET.has(p) || p === "/feed.xml") return true;
  if (
    p === "/manifest.webmanifest" ||
    p === "/icon" ||
    p === "/apple-icon" ||
    p === "/offline"
  )
    return true;

  if (p.startsWith("/api/auth")) return true;
  if (p.startsWith("/auth")) return true;
  if (p.startsWith("/_next")) return true;

  /* 실제 로그인·가입 화면은 /login · /signup ( /auth/login 은 redirect-map 으로만 존재).
     여기 없으면 PRIVATE_SITE 켜진 환경에서 /auth/login ↔ /login 루프가 난다. */
  if (
    p === "/login" ||
    p === "/signup" ||
    p === "/forgot-password" ||
    p === "/reset-password" ||
    p === "/welcome"
  )
    return true;

  if (p.includes("/opengraph-image")) return true;

  return false;
}

function parseInviteEmails(): Set<string> {
  const raw = process.env.PRIVATE_SITE_INVITE_EMAILS?.trim();
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

function copyCookies(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach((c) => {
    to.cookies.set(c.name, c.value);
  });
}

/** authjs(v5)와 레거시 next-auth 쿠키 이름 — 배포 시점에 따라 둘 다 나올 수 있다. */
const SESSION_COOKIE_NAMES = [
  "__Secure-authjs.session-token",
  "authjs.session-token",
  "__Secure-next-auth.session-token",
  "next-auth.session-token",
] as const;

/**
 * 세션 쿠키에서 **검증된** 이메일을 읽는다.
 *
 * 예전에는 쿠키의 JWT 를 base64 디코드해 payload.email 을 그대로 믿었다. 서명도
 * 복호화도 확인하지 않으므로, `{"email":"invited@example.com"}` 를 base64 로 인코딩해
 * 쿠키에 넣기만 하면 비공개 사이트 게이트와 초대 이메일 허용목록이 통째로 뚫렸다.
 *
 * getToken 은 AUTH_SECRET 으로 세션 토큰을 복호화·검증한다(내부적으로 jose 사용 —
 * WebCrypto 기반이라 Edge 런타임에서 동작한다). salt 는 쿠키 이름에서 파생되므로
 * 후보 이름별로 secureCookie 를 맞춰 시도한다.
 *
 * fail-closed: 시크릿이 없거나 복호화에 실패하면 null(=비로그인)로 취급한다.
 * "열어 볼 수 없다" 는 "통과" 가 아니다.
 */
async function readVerifiedSessionEmail(req: NextRequest): Promise<string | null> {
  const secret =
    process.env.AUTH_SECRET?.trim() || process.env.NEXTAUTH_SECRET?.trim();
  if (!secret) return null;

  for (const cookieName of SESSION_COOKIE_NAMES) {
    if (!req.cookies.get(cookieName)?.value) continue;
    try {
      const token = await getToken({
        req,
        secret,
        cookieName,
        secureCookie: cookieName.startsWith("__Secure-"),
      });
      const email =
        typeof token?.email === "string" ? token.email.trim().toLowerCase() : null;
      if (email) return email;
    } catch {
      // 위조되었거나 시크릿이 바뀐 토큰 — 다음 후보 쿠키를 본다.
    }
  }
  return null;
}

/**
 * PRIVATE_SITE 가 켜져 있으면 로그인 세션 필수.
 * PRIVATE_SITE_INVITE_EMAILS 가 비어 있지 않으면 해당 이메일만 허용.
 */
export async function applyPrivateSiteGate(
  req: NextRequest,
  base: NextResponse,
): Promise<NextResponse> {
  if (!isPrivateSiteEnabled()) return base;

  const path = req.nextUrl.pathname;
  if (isPublicPathForPrivateGate(path)) return base;

  const email = await readVerifiedSessionEmail(req);
  if (!email) {
    const login = new URL("/login", req.url);
    login.searchParams.set(
      "callbackUrl",
      `${path}${req.nextUrl.search ?? ""}`,
    );
    const redirect = NextResponse.redirect(login);
    copyCookies(base, redirect);
    return redirect;
  }

  const allow = parseInviteEmails();
  if (allow.size > 0 && !allow.has(email)) {
    const denied = new NextResponse(
      "이 사이트는 초대된 계정만 이용할 수 있습니다.",
      { status: 403, headers: { "Content-Type": "text/plain; charset=utf-8" } },
    );
    copyCookies(base, denied);
    return denied;
  }

  return base;
}
