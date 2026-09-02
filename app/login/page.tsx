import { LoginClient } from "./LoginClient";
import { getConfiguredSocialProviders } from "@/lib/auth/configured-social";

/**
 * 소셜 버튼 목록은 요청 시점에 env 로 판정한다.
 * 정적 prerender 에 굳히면 Vercel 에 AUTH_GOOGLE_* 를 넣은 뒤에도
 * 재배포 캐시/빌드 타이밍에 따라 버튼이 안 보이는 경우가 생긴다.
 */
export const dynamic = "force-dynamic";

/* 항목 46b — 로그인 화면은 개별 제목 + noindex (계정 흐름은 색인 대상이 아니다). */
export const metadata = {
  title: "로그인 | 내집나우",
  robots: { index: false, follow: true },
};

export default function LoginPage() {
  return <LoginClient social={getConfiguredSocialProviders()} />;
}
