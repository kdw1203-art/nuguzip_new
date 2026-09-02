import { buildPageMetadata } from "@/lib/seo/page-metadata";

/* 글쓰기 화면은 `"use client"` + useSearchParams 라 page.tsx 에서 metadata 를
   내보낼 수 없다. `?category=`, `?city=` 같은 프리필 파라미터가 붙은 URL 이
   각각 별개 페이지로 색인되지 않도록 canonical 을 이 layout 에서 선언한다. (N7)

   최적화 10 — 그때 canonical 만 넣고 **title 을 안 넣어서**, 이 화면의 탭 제목이
   루트 레이아웃의 홈 제목("내집나우 — 임장 기록이 판단 근거가 됩니다")이었다.
   canonical 은 맞는데 사람이 보는 이름이 틀려 있던 셈이다. h1 과 같은 "글쓰기"
   로 맞춘다.

   색인은 이번에도 건드리지 않는다 — 그리고 이건 N7 을 그냥 따른 게 아니라
   확인한 결과다: 이 화면은 useSoftSignup 을 써서 **로그인 없이도 폼이 열린다**.
   검색으로 들어와도 로그인 벽에 막히지 않으므로 죽은 링크가 아니다.
   (이번 배치에서 noIndex 를 건 화면들은 전부 그 반대인 경우다.) */
export const metadata = buildPageMetadata({
  title: "글쓰기",
  description: "동네 이야기에 글을 남깁니다. 우리 동네 소식과 임장 후기를 이웃과 나눠 보세요.",
  path: "/town/write",
});

export default function TownWriteLayout({ children }: { children: React.ReactNode }) {
  return children;
}
