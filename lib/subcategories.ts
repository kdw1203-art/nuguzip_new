/**
 * 내집나우 카테고리·하위 카테고리 정의
 * 참조: Vite export(platform-src) + 네이버카페/당근/크몽 디자인 패턴
 *
 * 각 페이지는 query string `?sub=xxx` 형태로 하위 카테고리 필터링
 */

import { SPECIALTIES } from "@/lib/experts/taxonomy";

export type SubCategory = {
  id: string;
  label: string;
  emoji: string;
  /** 내부 매칭 키워드 (실제 데이터의 category/tags와 느슨하게 매칭) */
  match: string[];
  /** 게시판 소개/페이지 설정 문구 */
  description?: string;
};

// ── 커뮤니티 (네이버 카페 스타일: 게시판별) ───────────────────────
export const COMMUNITY_SUBCATEGORIES: SubCategory[] = [
  {
    id: "all",
    label: "전체",
    emoji: "📋",
    match: [],
    description: "모든 게시글을 최신순으로 봅니다.",
  },
  {
    id: "info",
    label: "정보/소식",
    emoji: "💡",
    match: ["정보", "소식", "팁", "가이드", "TIP", "info"],
    description: "실거래가 조회, 세금 팁 등 부동산 정보를 공유합니다.",
  },
  {
    id: "region",
    label: "지역별",
    emoji: "📍",
    match: ["지역", "region", "동네"],
    description: "지역·동네별 생생한 현장 이야기를 나눕니다.",
  },
  {
    id: "complex",
    label: "단지별",
    emoji: "🏢",
    match: ["단지", "아파트", "complex"],
    description: "아파트·오피스텔 단지별 분양·재건축 이슈를 공유합니다.",
  },
  {
    id: "trade",
    label: "매수매도",
    emoji: "💰",
    match: ["매수", "매도", "매매", "거래", "trade"],
    description: "전세·월세·매매 상담과 거래 경험을 나눕니다.",
  },
  {
    id: "news",
    label: "부동산 뉴스",
    emoji: "📰",
    match: ["뉴스", "news", "이슈"],
    description: "최신 부동산 뉴스·정책 이슈를 토론합니다.",
  },
  {
    id: "qna",
    label: "질문/상담",
    emoji: "❓",
    match: ["질문", "상담", "Q&A", "도와"],
    description: "부동산 초보부터 실무자까지 함께 답하는 Q&A 게시판.",
  },
  {
    id: "free",
    label: "자유게시판",
    emoji: "💬",
    match: ["자유", "잡담", "free"],
    description: "가볍게 쓰는 우리동네 자유 게시판.",
  },
];

// ── 모임/마켓 (당근마켓 스타일: 카테고리 리본) ───────────────────
export const MEETING_SUBCATEGORIES: SubCategory[] = [
  {
    id: "all",
    label: "전체",
    emoji: "🌐",
    match: [],
    description: "지금 열린 모든 모임·마켓 항목을 봅니다.",
  },
  {
    id: "inspection",
    label: "임장 모임",
    emoji: "🧭",
    match: ["임장", "inspection", "현장", "답사"],
    description: "실제 단지를 함께 돌며 정보를 공유하는 임장 모임입니다.",
  },
  {
    id: "study",
    label: "투자 스터디",
    emoji: "📚",
    match: ["스터디", "투자", "study"],
    description: "매주 주제를 정해 심층 학습하는 투자 스터디.",
  },
  {
    id: "seminar",
    label: "세미나/강의",
    emoji: "🎤",
    match: ["세미나", "강의", "세션", "온라인", "설명회"],
    description: "전문가 초청 세미나·온라인 강의를 모읍니다.",
  },
  {
    id: "networking",
    label: "네트워킹",
    emoji: "🤝",
    match: ["네트워킹", "모임", "만남"],
    description: "실무자·투자자 네트워킹 모임.",
  },
  {
    id: "subscription",
    label: "청약 스터디",
    emoji: "🎯",
    match: ["청약", "subscription"],
    description: "청약 일정·당첨 전략을 함께 준비합니다.",
  },
  {
    id: "market",
    label: "중고/분석 도구",
    emoji: "🛒",
    match: ["마켓", "market", "도서", "도구", "템플릿", "상품"],
    description: "부동산 서적·임장 용품·분석 도구를 거래합니다.",
  },
];

/** `/town/groups` 모임 목록 전용: 중고·도구 거래 탭은 `/market`에서만 사용 */
export const GROUP_LIST_SUBCATEGORIES: SubCategory[] = MEETING_SUBCATEGORIES.filter(
  (s) => s.id !== "market",
);

// ── 전문가 (크몽 스타일: 서비스 카테고리 그리드) ─────────────────
/* [953] 분야 정의는 lib/experts/taxonomy.ts(SPECIALTIES) 한 곳으로 옮겼다 —
   목록 필터·신청 폼·견적 카테고리·프로필 편집이 전부 같은 목록을 읽는다.
   여기서는 목록 필터 칩이 쓰는 SubCategory 모양으로 감싼다.
   "법무/계약 검토" 카테고리는 2026-08-12 토스 정책(법률 서비스 입점 불가)으로
   제거된 상태를 유지한다 — taxonomy 에도 없다. */
export const EXPERT_SUBCATEGORIES: SubCategory[] = [
  {
    id: "all",
    label: "전체",
    emoji: "👥",
    match: [],
    description: "등록된 전문가를 인증 우선 · 후기 평점 · 최근 등록 순으로 봅니다.",
  },
  ...SPECIALTIES.map((s) => ({
    id: s.id,
    label: s.label,
    emoji: "",
    match: [s.label, ...s.match],
    description: s.desc,
  })),
];

// ── 리포트 (토스증권 리포트 + 크몽 디지털 스타일) ────────────────
export const REPORT_SUBCATEGORIES: SubCategory[] = [
  {
    id: "all",
    label: "전체",
    emoji: "📚",
    match: [],
    description: "모든 리포트를 최신순으로 봅니다.",
  },
  {
    id: "market",
    label: "시장 분석",
    emoji: "📈",
    match: ["시장", "동향", "주간", "월간"],
    description: "주간·월간 시장 동향 · 거래량 분석.",
  },
  {
    id: "region",
    label: "지역 분석",
    emoji: "🗺️",
    match: ["지역", "입지", "동네"],
    description: "지역·입지 점수, 생활 인프라 심층 분석.",
  },
  {
    id: "inspection",
    label: "임장 가이드",
    emoji: "🧭",
    match: ["임장", "현장", "가이드"],
    description: "실전 임장 노하우, 단지 평가 리포트.",
  },
  {
    id: "invest",
    label: "투자 전략",
    emoji: "🎯",
    match: ["투자", "전략", "갭", "수익"],
    description: "갭투자·수익률·포트폴리오 구성 리포트.",
  },
  {
    id: "subscription",
    label: "청약 분석",
    emoji: "🏠",
    match: ["청약", "분양"],
    description: "분양 경쟁률·가점·당첨선 전망.",
  },
  {
    id: "policy",
    label: "정책/법률",
    emoji: "📜",
    match: ["정책", "법률", "규제"],
    description: "부동산 정책·규제·법률 변화 해설.",
  },
  {
    id: "tax",
    label: "세무 전략",
    emoji: "🧾",
    match: ["세금", "세무", "절세", "종부세", "양도"],
    description: "보유·양도·상속 세금 절세 전략.",
  },
];

// ── 유틸: text가 subcategory match 키워드 중 하나라도 포함하는지 ──
export function matchSubcategory(
  sub: SubCategory,
  haystack: string | string[],
): boolean {
  if (sub.id === "all" || sub.match.length === 0) return true;
  const text = Array.isArray(haystack)
    ? haystack.join(" ").toLowerCase()
    : haystack.toLowerCase();
  return sub.match.some((m) => text.includes(m.toLowerCase()));
}

export function findSub(subs: SubCategory[], id: string | undefined) {
  return subs.find((s) => s.id === (id ?? "all")) ?? subs[0];
}
