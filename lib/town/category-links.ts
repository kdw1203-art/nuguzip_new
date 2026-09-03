/**
 * 동네이야기 카테고리 바로가기 — 단일 소스.
 *
 * 예전에는 이 배열이 `app/town/page.tsx` 안에만 있었다. 그래서 랜딩(`/town`)에서는
 * 카테고리가 보이는데, 정작 카테고리 안으로 들어가면(`/town/groups` 등) 목록이
 * 사라져서 다른 카테고리로 넘어가려면 뒤로가기를 해야 했다.
 * 배열을 여기로 올려 하위 페이지 9곳이 같은 목록을 그대로 쓰게 한다.
 *
 * 주의: `/apply`·`/supply`·`/auctions` 는 `app/town/` 밖에 있으므로
 * 이 모듈은 서버·클라이언트 어디서든 import 가능해야 한다("use client" 금지).
 */

export type TownCategoryLink = {
  href: string;
  label: string;
  /** 선형 아이콘 이름(app/components/Icon.tsx) — [959] 이모지 식별자를 이름으로 바꿨다.
   *  이모지는 EMOJI_MAP 을 거쳐 그려지긴 했지만 매핑이 없는 글자는 기기 폰트로 떨어졌다. */
  icon: string;
  desc: string;
  /** 아이콘 칩 색 — 9칸이 전부 같은 잉크색이라 목록이 눈에 안 들어왔다.
   *  성격이 비슷한 것끼리 색을 묶는다(사람=파랑 / 공급·분양=초록 /
   *  글·자료=주황). raw hex 금지 — 토큰 클래스만. */
  tone: string;
  /** 데이터가 사람 손에서 나오는 칸(전문가·모임·자료) — 비어 있을 수 있어 화면이 "모집 중"을 말한다 */
  humanSupplied?: boolean;
};

/* [959] 순서: **지금 실제로 내용이 있는 칸이 앞**. 2026-09-03 실측 — 뉴스 400+ ·
   청약(청약홈 공공데이터) · 공매 1,130건 · 입주 물량 675행 · 정비사업 지도 = 실데이터,
   전문가 0 · 임장 모임 0 · 리포트 0 = 사람이 채워야 하는 칸. 예전(2026-08-22)엔
   "방문 실측 빈도순"으로 전문가가 1번이었는데, 1번이라서 많이 눌린 것과 내용이 있어
   눌린 것을 구분할 수 없었고 누르면 빈 화면이었다. Q&A·전문가는 그래도 두 번째 줄
   첫머리에 둔다 — 질문·상담은 비어 있어도 시작점이 되기 때문이다. */
export const TOWN_CATEGORY_LINKS: TownCategoryLink[] = [
  /* 모바일 실측(2026-08-02): "뉴스·다이제스트"는 카드 폭(104px)에서 "뉴스·다이제…"
     로 잘렸다. 라벨은 짧게, 다이제스트는 부제로. */
  { href: "/town/news", label: "뉴스", icon: "newspaper", desc: "요약·주간 다이제스트", tone: "bg-warning-soft text-warning" },
  { href: "/apply", label: "청약 센터", icon: "ticket", desc: "분양·경쟁률", tone: "bg-success-soft text-success" },
  { href: "/auctions", label: "공매 물건", icon: "hammer", desc: "온비드 공매", tone: "bg-success-soft text-success" },
  { href: "/supply", label: "입주 물량", icon: "construction", desc: "공급 일정", tone: "bg-success-soft text-success" },
  { href: "/redevelopment", label: "정비사업 지도", icon: "map", desc: "재개발·재건축", tone: "bg-success-soft text-success" },
  { href: "/qna", label: "단지 Q&A", icon: "messages-square", desc: "묻고 답하기", tone: "bg-primary-soft text-primary" },
  { href: "/town/experts", label: "전문가", icon: "graduation", desc: "상담·견적", tone: "bg-primary-soft text-primary", humanSupplied: true },
  { href: "/town/groups", label: "임장 모임", icon: "compass", desc: "함께 임장", tone: "bg-primary-soft text-primary", humanSupplied: true },
  { href: "/town/library", label: "자료", icon: "folder", desc: "리포트·노트", tone: "bg-warning-soft text-warning", humanSupplied: true },
];
