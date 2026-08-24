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
  loading: () => (
    <div
      className="flex h-[70vh] w-full animate-pulse items-center justify-center rounded-2xl border border-line bg-surface"
      aria-busy="true"
      aria-label="지도 불러오는 중"
    >
      <p className="text-sm text-text-3">지도를 불러오는 중…</p>
    </div>
  ),
});

export function MapClientLazy(props: ComponentProps<typeof MapClient>) {
  return <LazyInner {...props} />;
}
