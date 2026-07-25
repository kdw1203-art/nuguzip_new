/**
 * 동네이야기 카테고리 바로가기 — 단일 소스.
 *
 * 예전에는 이 배열이 `app/town/page.tsx` 안에만 있었다. 그래서 랜딩(`/town`)에서는
 * 7개 카테고리가 보이는데, 정작 카테고리 안으로 들어가면(`/town/groups` 등) 목록이
 * 사라져서 다른 카테고리로 넘어가려면 뒤로가기를 해야 했다.
 * 배열을 여기로 올려 7개 하위 페이지가 같은 목록을 그대로 쓰게 한다.
 *
 * 주의: `/apply`·`/supply`·`/auctions` 는 `app/town/` 밖에 있으므로
 * 이 모듈은 서버·클라이언트 어디서든 import 가능해야 한다("use client" 금지).
 */

export type TownCategoryLink = {
  href: string;
  label: string;
  icon: string;
  desc: string;
};

export const TOWN_CATEGORY_LINKS: TownCategoryLink[] = [
  { href: "/town/groups", label: "임장 모임", icon: "🧭", desc: "함께 임장" },
  { href: "/town/library", label: "자료", icon: "📁", desc: "리포트·임장노트" },
  { href: "/town/news", label: "뉴스·다이제스트", icon: "📰", desc: "부동산 뉴스·주간 요약" },
  { href: "/town/experts", label: "전문가", icon: "🎓", desc: "검증된 상담" },
  { href: "/apply", label: "청약 센터", icon: "🎟️", desc: "분양·경쟁률" },
  { href: "/supply", label: "입주 물량", icon: "🏗️", desc: "공급 캘린더" },
  { href: "/auctions", label: "공매 물건", icon: "🔨", desc: "온비드 공매" },
];
