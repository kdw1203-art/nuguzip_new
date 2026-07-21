import type { Metadata } from "next";
import type { ReactNode } from "react";

/* ============================================================
   임베드 레이아웃 (항목 H39) — 블로그·카페 배포용 최소 셸.
   이 파일은 중첩 레이아웃이므로 <html>/<body> 를 넣지 않는다.
   루트 app/layout.tsx 의 <html><body> 가 그대로 적용되고,
   여기서는 사이트 크롬(Header/TabBar/Footer) 없이 카드만
   감싸는 가벼운 래퍼 div 만 제공한다.
   noindex: 임베드 페이지는 검색 색인 대상이 아니다.
   ============================================================ */

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function EmbedLayout({ children }: { children: ReactNode }) {
  return (
    <div className="w-full bg-transparent p-2 sm:p-3">{children}</div>
  );
}
