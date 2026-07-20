import type { Metadata } from "next";
import type { ReactNode } from "react";

/** 판매자 온보딩은 심사 접수 미연결 상태(감사 P1-5) — 검색 색인 제외. */
export const metadata: Metadata = {
  title: "판매 시작하기 | 누구집",
  robots: { index: false, follow: false },
};

export default function SellerLayout({ children }: { children: ReactNode }) {
  return children;
}
