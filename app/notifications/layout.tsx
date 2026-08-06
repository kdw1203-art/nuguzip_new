import { buildPageMetadata } from "@/lib/seo/page-metadata";

/* 최적화 10 — /notifications 의 <title> 이 홈과 글자 하나까지 같았다
   ("누구집 — 임장 기록이 판단 근거가 됩니다"). 오늘 실측: 프리렌더된 108개
   페이지 중 14개가 이 제목을 공유했고 그중 홈만 맞는 제목이었다.

   page.tsx 가 `"use client"` 라 거기서는 metadata 를 내보낼 수 없다
   (클라이언트 컴포넌트에서 export 하면 Next 가 무시한다 — 있는데 안 먹는
   쪽이 없는 것보다 나쁘다). 그래서 서버 레이아웃을 한 겹 둔다.
   children 을 그대로 돌려주므로 DOM 도 스타일도 바뀌지 않는다.

   noIndex: 로그인한 사람의 개인 알림함이다. 색인되면 검색에서 눌러 들어온
   사람은 로그인 벽을 만난다 — 죽은 링크를 검색 결과에 만들어 두는 셈이다. */
export const metadata = buildPageMetadata({
  title: "알림",
  description: "가격 알림·댓글·활동 소식을 모아 봅니다.",
  path: "/notifications",
  noIndex: true,
});

export default function NotificationsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
