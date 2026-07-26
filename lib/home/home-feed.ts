/**
 * 온보딩(`welcome`) 등에서 쓰이는 샘플·탐색 링크. 홈 피드용 타입은 제거했습니다.
 */
export const WELCOME_SAMPLE_LINKS = [
  { title: "샘플: 강남 재건축 인사이트", href: "/info/redevelopment" },
  /* `/inspection/create` 는 없는 경로였다 — 임장노트 작성은 /notes/new 다. */
  { title: "샘플: 임장노트 작성 가이드", href: "/notes/new" },
  { title: "샘플: 시세 지도 둘러보기", href: "/explore" },
] as const;
