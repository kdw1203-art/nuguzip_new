import { buildPageMetadata } from "@/lib/seo/page-metadata";

/* 최적화 10 — page.tsx 가 `"use client"` 라 metadata 를 못 내보낸다.
   서버 레이아웃 한 겹으로 제목을 붙인다(자세한 배경은
   app/notifications/layout.tsx 주석). children 을 그대로 반환한다.

   noIndex 는 여기가 제일 분명하다: 이 화면은 **메일로 받은 복구 토큰이
   URL 에 붙어 있어야** 동작한다. 토큰 없이 들어오면 아무것도 못 하는 화면이라
   검색 결과에 있어서 좋을 게 없고, 토큰이 붙은 URL 이 어떤 경로로든 크롤러에
   노출되는 상황도 만들지 않는 편이 낫다. */
export const metadata = buildPageMetadata({
  title: "새 비밀번호 설정",
  description: "메일로 받은 링크에서 새 비밀번호를 설정합니다.",
  path: "/reset-password",
  noIndex: true,
});

export default function ResetPasswordLayout({ children }: { children: React.ReactNode }) {
  return children;
}
