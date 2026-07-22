/** 9m GNB — 4 대분류 공유 데이터 (데스크탑 GNB · 모바일 전체 메뉴 공용)
 *  대통합 IA(2026-07): 지도는 탐색·실거래·실매물·등록 통합(/map 단일),
 *  대출·비용 계산기는 임장노트로, 입주물량·공매·청약은 동네이야기로 편입. */
export type NavItem = {
  label: string;
  href: string;
  children?: { label: string; href: string }[];
};

export const NAV: NavItem[] = [
  {
    label: "임장노트",
    href: "/notes",
    children: [
      { label: "노트 쓰기", href: "/notes/new" },
      { label: "공개 노트", href: "/notes" },
      { label: "회차 비교", href: "/notes/compare" },
    ],
  },
  {
    label: "지도",
    href: "/map",
    children: [
      { label: "통합 지도 (탐색·실거래·매물)", href: "/map" },
      { label: "매물 등록", href: "/listings/new" },
    ],
  },
  {
    label: "AI 분석",
    href: "/analysis",
    children: [
      { label: "분석 허브", href: "/analysis" },
      { label: "후보 단지 비교", href: "/analysis/compare" },
      { label: "시장·대출 시나리오", href: "/analysis/scenario" },
      { label: "시세·타이밍", href: "/analysis/timing" },
    ],
  },
  {
    label: "동네이야기",
    href: "/town",
    children: [
      // 콘텐츠·소식 + 사람·모임 (분양·물건·거래는 전체 메뉴/각 페이지에서 접근)
      { label: "피드", href: "/town" },
      { label: "뉴스", href: "/town/news" },
      { label: "임장 모임", href: "/town/groups" },
      { label: "전문가", href: "/town/experts" },
    ],
  },
];
