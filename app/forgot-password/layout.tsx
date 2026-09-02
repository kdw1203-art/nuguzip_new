import { buildPageMetadata } from "@/lib/seo/page-metadata";

/* 최적화 10 — page.tsx 가 `"use client"` 라 metadata 를 못 내보낸다.
   서버 레이아웃 한 겹으로 제목을 붙인다(자세한 배경은
   app/notifications/layout.tsx 주석). children 을 그대로 반환한다.

   noIndex: 비밀번호 초기화 링크를 **메일로 받는** 흐름의 입구다. 검색으로
   들어올 화면이 아니고, 색인되면 "내집나우 비밀번호" 류 검색에 이 페이지가
   떠서 피싱 흉내에 좋은 표적이 된다. */
export const metadata = buildPageMetadata({
  title: "비밀번호 찾기",
  description: "가입한 이메일로 비밀번호 초기화 링크를 보내드립니다.",
  path: "/forgot-password",
  noIndex: true,
});

export default function ForgotPasswordLayout({ children }: { children: React.ReactNode }) {
  return children;
}
