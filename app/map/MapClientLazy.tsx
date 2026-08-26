"use client";

/* [OPT-06·26] 지도 클라이언트(4,578줄) 지연 로드 경계.
   서버 컴포넌트에서는 next/dynamic 의 ssr:false 를 쓸 수 없어서, 이 얇은
   클라이언트 파일이 경계가 된다. 효과 두 가지:
   ① /map 첫 페인트가 지도 JS 다운로드·파싱을 기다리지 않는다(스켈레톤 즉시).
   ② 4,578줄 트리의 서버 렌더(SSR) 비용이 사라진다 — HTML 도 가벼워진다. */
import nextDynamic from "next/dynamic";
import type { ComponentProps } from "react";
import type { MapClient } from "./map-client";

const LazyInner = nextDynamic(() => import("./map-client").then((m) => m.MapClient), {
  ssr: false,
  /* 자리표시자는 **실제 지도와 같은 상자**여야 한다.
     예전에는 h-[70vh] 였는데 진짜 지도는 `fixed inset-0 h-[100dvh]` 다. 그래서
     /map 을 열면 라우트 스켈레톤(100dvh) → 이 자리표시자(70vh) → 실제 지도
     (fixed 100dvh) 로 **두 번** 크게 튀었다. 게다가 fixed 로 바뀌는 순간
     문서 흐름에서 빠져 아래 것들이 통째로 딸려 올라간다.
     프로덕션 CLS p75 0.825 의 주범이다 — 같은 상자로 맞춰 이동을 0 으로 만든다. */
  loading: () => (
    <div
      className="fixed inset-0 h-[100dvh] w-full animate-pulse bg-gradient-to-br from-line to-line-strong"
      aria-busy="true"
      aria-label="지도 불러오는 중"
    >
      <p className="absolute bottom-24 left-1/2 -translate-x-1/2 rounded-full bg-[rgba(16,28,54,.72)] px-4 py-2 t-sub font-semibold text-white">
        지도를 불러오는 중…
      </p>
    </div>
  ),
});

export function MapClientLazy(props: ComponentProps<typeof MapClient>) {
  return <LazyInner {...props} />;
}
