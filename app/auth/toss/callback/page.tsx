import { Suspense } from "react";
import { TossCallbackClient } from "./TossCallbackClient";

/* 항목: 계정 흐름은 색인 대상이 아니다. */
export const metadata = {
  title: "토스 로그인 처리 중 | 누구집",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * 토스 인가 후 돌아오는 자리 (콘솔의 redirect_uri 가 이 경로를 가리켜야 한다).
 * 쿼리의 authorizationCode 를 NextAuth "toss" 프로바이더로 넘겨 세션을 만든다.
 * useSearchParams 를 쓰는 클라이언트 컴포넌트라 Suspense 로 감싼다.
 */
export default function TossCallbackPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-[100dvh] items-center justify-center bg-bg px-6">
          <p className="text-sm font-bold text-text-2">토스 로그인 처리 중…</p>
        </main>
      }
    >
      <TossCallbackClient />
    </Suspense>
  );
}
