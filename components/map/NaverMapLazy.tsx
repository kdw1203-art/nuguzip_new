"use client";

import dynamic from "next/dynamic";

/* NaverMap 지연 로드 래퍼 — 번들 최적화.
 *
 * NaverMap.tsx(1,252줄: SDK 로더·마커 디핑·declutter·측정 오버레이…)가 5개
 * 라우트(홈·정비사업·모임·매물 등록/상세)에 **정적으로** 임포트돼 각 라우트의
 * First Load JS 에 통째로 실려 있었다. 이 화면들에서 지도는 상호작용 요소지
 * 첫 페인트 콘텐츠가 아니다 — dynamic(ssr:false) 로 라우트 청크에서 떼어낸다.
 *
 * /map(map-client)은 예외 — 지도가 곧 화면이라 기존 정적 임포트를 유지한다.
 * 타입은 원본 모듈에서 type-import 하면 된다(런타임 코드에 포함되지 않는다).
 */
export const NaverMap = dynamic(
  () => import("./NaverMap").then((m) => m.NaverMap),
  {
    ssr: false,
    loading: () => (
      <div
        aria-hidden
        className="h-full min-h-[160px] w-full animate-pulse rounded-2xl bg-bg"
      />
    ),
  },
);
