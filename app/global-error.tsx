"use client";

import { useEffect } from "react";

/**
 * G10: 루트 레이아웃까지 깨졌을 때의 최후 바운더리.
 * 이 시점엔 전역 CSS·폰트가 적용되지 않을 수 있어 인라인 스타일만 쓴다
 * (여기서 클래스에 의존하면 에러 화면이 또 깨진다).
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    try {
      void fetch("/api/monitoring/client-error", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: error.message || "unknown global error",
          digest: error.digest,
          path: typeof window !== "undefined" ? window.location.pathname : null,
          scope: "global",
        }),
        keepalive: true,
      }).catch(() => {});
    } catch {
      /* noop */
    }
  }, [error]);

  return (
    <html lang="ko">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f7f8fa",
          color: "#191f28",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Pretendard', 'Malgun Gothic', sans-serif",
        }}
      >
        <main
          style={{
            width: "100%",
            maxWidth: 420,
            padding: "32px 24px",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 17, fontWeight: 800, lineHeight: 1.5 }}>
            페이지를 열 수 없어요
          </div>
          {/* global-error 는 루트 레이아웃을 대체하므로 globals.css 도 토큰도 없다.
              색을 직접 적을 수밖에 없는데, 그러면 토큰을 고쳐도 여기만 남는다.
              #8b95a1 → #656f7c 는 --text-3 과 같은 값(흰 배경 5.10:1). */}
          <p
            style={{
              marginTop: 8,
              fontSize: 13,
              lineHeight: 1.7,
              color: "#656f7c",
            }}
          >
            일시적인 오류로 화면이 로드되지 않았습니다.
            <br />
            새로고침해도 같으면 잠시 뒤에 다시 방문해 주세요.
          </p>
          {error.digest && (
            <p
              style={{
                marginTop: 10,
                fontSize: 11,
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                color: "#656f7c",
              }}
            >
              오류 코드 {error.digest}
            </p>
          )}
          <div
            style={{
              marginTop: 18,
              display: "flex",
              gap: 8,
              justifyContent: "center",
            }}
          >
            <button
              type="button"
              onClick={reset}
              style={{
                border: 0,
                borderRadius: 12,
                padding: "10px 20px",
                fontSize: 13,
                fontWeight: 700,
                color: "#fff",
                background: "#1d4fd8",
                cursor: "pointer",
              }}
            >
              다시 시도
            </button>
            {/* global-error 는 루트 레이아웃까지 대체하는 최후의 경계다.
                이 안에서는 라우터가 이미 깨져 있을 수 있어 <Link> 를 쓰면
                안 된다 — 전체 새로고침이 되는 <a> 가 맞다. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/"
              style={{
                borderRadius: 12,
                border: "1px solid #e2e7ee",
                background: "#fff",
                padding: "10px 20px",
                fontSize: 13,
                fontWeight: 700,
                color: "#333d4b",
                textDecoration: "none",
              }}
            >
              홈으로
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
