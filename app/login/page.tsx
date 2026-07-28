import { LoginClient, type SocialProvider } from "./LoginClient";
import { isGoogleOAuthConfigured } from "@/lib/auth/google-oauth-config";
import { isKakaoOAuthConfigured } from "@/lib/kakao/oauth-config";

/**
 * 로그인 화면의 서버 껍데기 — **켜져 있는 소셜 로그인 수단만** 아래로 넘긴다.
 *
 * 판정 기준은 auth.ts 가 provider 를 등록할 때 쓰는 조건과 **같은 조건**이다
 * (ID + SECRET 둘 다 존재). 조건이 갈라지면 화면에는 버튼이 있는데 NextAuth 에는
 * provider 가 없는 상태가 다시 생긴다 — 지금 고치는 그 버그다.
 *
 * 네이버만 별도 헬퍼가 없어서 여기서 직접 본다. 새 provider 를 추가할 때는
 * auth.ts 쪽 조건과 여기를 **같이** 고칠 것.
 */
function isNaverOAuthConfigured(): boolean {
  return Boolean(
    process.env.AUTH_NAVER_ID?.trim() && process.env.AUTH_NAVER_SECRET?.trim(),
  );
}

/* 일부러 `force-dynamic` 을 쓰지 않는다. 이 화면은 정적으로 prerender 되고,
   그때 읽는 env 는 **배포 시점의 env** 다 — Vercel 에서 환경변수를 바꾸면
   어차피 재배포해야 반영되므로 정적으로 굳어도 값이 어긋나지 않는다.
   반대로 force-dynamic 을 걸면 로그인 화면 조회마다 함수 호출이 생긴다.
   (지금 Hobby 플랜 함수 호출 한도를 이미 다 쓴 상태라 그 비용이 실제 비용이다.) */

export default function LoginPage() {
  const social: SocialProvider[] = [];
  if (isKakaoOAuthConfigured()) social.push("kakao");
  if (isNaverOAuthConfigured()) social.push("naver");
  if (isGoogleOAuthConfigured()) social.push("google");

  return <LoginClient social={social} />;
}
