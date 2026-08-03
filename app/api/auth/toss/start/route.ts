import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  getTossLoginAuthorizeUrl,
  getTossLoginClientId,
  getTossLoginRedirectUri,
  isTossLoginStartable,
} from "@/lib/auth/toss-login";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/auth/toss/start?callbackUrl=/subscription
 *
 * "토스로 시작" 버튼의 목적지. 토스 인가 페이지로 302 보낸다.
 * 인가가 끝나면 토스가 콘솔에 등록된 redirect_uri(우리 /auth/toss/callback)로
 * authorizationCode 를 실어 되돌려 주고, 거기서 NextAuth "toss" 프로바이더가
 * 코드를 토큰으로 교환해 세션을 만든다.
 *
 * callbackUrl 은 state 로 왕복시킨다 — 로그인 벽을 만난 화면으로 돌아가기 위한
 * 값이라 우리 도메인 상대경로만 허용한다(오픈 리다이렉트 방지).
 */
export function GET(req: NextRequest) {
  if (!isTossLoginStartable()) {
    return NextResponse.json(
      { error: "토스 로그인이 아직 설정되지 않았습니다." },
      { status: 503 },
    );
  }
  const authorize = getTossLoginAuthorizeUrl()!;
  const clientId = getTossLoginClientId()!;
  const redirectUri = getTossLoginRedirectUri();

  const raw = req.nextUrl.searchParams.get("callbackUrl") ?? "/";
  const callbackUrl = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";

  let url: URL;
  try {
    url = new URL(authorize);
  } catch {
    return NextResponse.json(
      { error: "토스 로그인 인가 주소 설정이 잘못되었습니다." },
      { status: 503 },
    );
  }
  // 콘솔 안내 주소에 이미 들어 있는 쿼리는 존중한다 — 없을 때만 채운다.
  if (!url.searchParams.has("client_id")) url.searchParams.set("client_id", clientId);
  if (redirectUri && !url.searchParams.has("redirect_uri")) {
    url.searchParams.set("redirect_uri", redirectUri);
  }
  if (!url.searchParams.has("response_type")) {
    url.searchParams.set("response_type", "code");
  }
  url.searchParams.set("state", callbackUrl);

  return NextResponse.redirect(url);
}
