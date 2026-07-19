import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

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
  if (p === "/favicon.ico" || p === "/robots.txt" || p === "/sitemap.xml")
    return true;
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

function readAuthSessionToken(req: NextRequest): string | null {
  const candidates = [
    "__Secure-authjs.session-token",
    "authjs.session-token",
    "__Secure-next-auth.session-token",
    "next-auth.session-token",
  ];
  for (const name of candidates) {
    const v = req.cookies.get(name)?.value;
    if (v) return v;
  }
  return null;
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  const payload = parts[1];
  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    const json = atob(padded);
    const parsed = JSON.parse(json);
    if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
  } catch {
    return null;
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

  const token = readAuthSessionToken(req);
  const payload = token ? decodeJwtPayload(token) : null;
  const email = typeof payload?.email === "string" ? payload.email.toLowerCase() : null;
  if (!email) {
    const login = new URL("/auth/login", req.url);
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
