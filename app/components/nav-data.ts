/** 9m GNB — 4 대분류 공유 데이터 (데스크탑 GNB · 모바일 전체 메뉴 공용)
 *  네비 개편안(overhaul-audit): /safety·/town/market 은 실연동 전까지 제외,
 *  analysis cycle·switch·price·portfolio 는 허브 카드로만 노출. */
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
      { label: "내 노트", href: "/my" },
    ],
  },
  {
    label: "지도·시세",
    href: "/map",
    children: [
      { label: "지도 탐색", href: "/map" },
      { label: "실거래 검색", href: "/search" },
      { label: "입주 물량", href: "/supply" },
      { label: "공매 물건", href: "/auctions" },
      { label: "청약 센터", href: "/apply" },
      { label: "대출·비용 계산기", href: "/calculator" },
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
      { label: "피드", href: "/town" },
      { label: "발견 피드", href: "/discover" },
      { label: "자료·뉴스", href: "/town/news" },
      { label: "임장 모임", href: "/town/groups" },
      { label: "전문가", href: "/town/experts" },
      { label: "주간 다이제스트", href: "/digest" },
    ],
  },
];
