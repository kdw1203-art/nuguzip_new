"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ErrorState } from "@/app/components/ui/EmptyState";

/**
 * G10: 라우트 세그먼트 에러 바운더리 — 지금까지 없어서, 렌더 중 예외가 나면
 * Next 기본 화면(영문)만 떴다. 실패를 "데이터 없음"처럼 보이게 하지 않고,
 * 무엇이 안 됐는지 + 다시 시도 경로를 한국어로 보여준다.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // 서버 모니터링 싱크로 전달(실패해도 무시 — 에러 화면이 또 깨지면 안 된다)
    try {
      void fetch("/api/monitoring/client-error", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: error.message || "unknown client error",
          digest: error.digest,
          path: typeof window !== "undefined" ? window.location.pathname : null,
          scope: "route",
        }),
        keepalive: true,
      }).catch(() => {});
    } catch {
      /* noop */
    }
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-[520px] flex-col items-center justify-center gap-4 px-6">
      <ErrorState
        title="화면을 그리는 중 문제가 생겼어요"
        desc="일시적인 오류일 수 있어요. 다시 시도해도 같으면 잠시 뒤에 다시 방문해 주세요."
        cause={error.digest ? `오류 코드 ${error.digest}` : undefined}
        onRetry={reset}
        retryLabel="다시 시도"
        className="w-full"
      />
      <div className="flex gap-2 text-[13px]">
        <Link href="/" className="font-bold text-primary">
          홈으로
        </Link>
        <span className="text-text-3">·</span>
        <Link href="/support" className="font-bold text-primary">
          문의하기
        </Link>
      </div>
    </main>
  );
}
