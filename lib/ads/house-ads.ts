/**
 * H3 — 자체 하우스 광고.
 *
 * 광고 슬롯을 외부 네트워크(AdSense) 없이도 채우기 위한 내부 배너 카탈로그.
 * 외부 계정·키가 필요 없다는 게 요점이라, 여기 문구는 전부 코드에서 확인 가능한
 * 사실만 쓴다. 다음은 금지:
 *  - 하지 않는 행사·할인 (예: "이번 주말 임장 모임", "첫 달 무료")
 *  - 없는 경로로 보내는 CTA (404)
 *  - 수치 주장 (사용자 수·만족도 등) — 셀 수 있는 값이라도 여기 박아두면 곧 낡는다
 *
 * href 는 반드시 실제 라우트여야 한다. 아래 4개는 app/ 아래 page.tsx 존재를 확인함:
 *   /notes/new · /map · /subscription · /town/experts
 */

import type { AdPlacement } from "@/lib/ads/adsense-policy";

export type HouseAd = {
  id: string;
  /** 어느 슬롯에 쓸 수 있는지. 비면 전 슬롯 공용. */
  placements?: AdPlacement[];
  eyebrow: string;
  title: string;
  body: string;
  ctaLabel: string;
  href: string;
  /** 로그인 사용자에게는 의미 없는 문구면 false */
  showWhenSignedIn: boolean;
};

/**
 * 문구 근거
 *  - 임장노트: app/notes/new 존재. "3분 기록"은 홈 카피와 동일한 제품 약속.
 *  - 지도 실거래: 지도 금액은 국토부 실거래가 기준 (C8 가격 표기 범례와 같은 기준).
 *  - 구독: FEATURE_RULES(access.ts) ai_chat 무료 월 3회가 근거 — 요금표(PLAN_FEATURE_MATRIX
 *    "동네 분석 요약 = 무료 월 3회" 행)와 같은 단일 출처다.
 *  - 전문가: app/town/experts 존재, 상담 신청 → 답변 흐름 구현됨.
 */
export const HOUSE_ADS: HouseAd[] = [
  {
    id: "house_note_start",
    eyebrow: "누구집",
    title: "본 집, 기억나세요?",
    body: "다녀온 집은 사흘이면 섞입니다. 임장노트에 남겨두면 나중에 비교할 근거가 됩니다.",
    ctaLabel: "임장노트 쓰기",
    href: "/notes/new",
    showWhenSignedIn: true,
  },
  {
    id: "house_map_real_price",
    eyebrow: "지도",
    title: "호가 말고 실거래가로 보기",
    body: "지도에 찍히는 금액은 국토교통부 실거래가입니다. 중개사 호가와 섞이지 않습니다.",
    ctaLabel: "지도에서 확인",
    href: "/map",
    showWhenSignedIn: true,
  },
  {
    id: "house_subscription",
    eyebrow: "플랜",
    title: "AI 동네 분석이 월 3회로 부족하다면",
    body: "무료 플랜은 AI 동네 분석 요약을 월 3회 만들 수 있어요. 플랜별로 무엇이 달라지는지 표로 비교해 보세요.",
    ctaLabel: "플랜 비교하기",
    href: "/subscription",
    showWhenSignedIn: true,
  },
  {
    id: "house_expert",
    placements: ["community_feed", "report_free_body"],
    eyebrow: "전문가",
    title: "혼자 판단하기 어려운 계약이라면",
    body: "등록된 공인중개사·전문가에게 상담을 신청하고, 답변을 내 상담 내역에서 받아볼 수 있어요.",
    ctaLabel: "전문가 찾아보기",
    href: "/town/experts",
    showWhenSignedIn: true,
  },
];

/**
 * 슬롯에 맞는 하우스 광고 하나를 고른다.
 *
 * 무작위(Math.random)를 쓰지 않는다 — 서버·클라이언트 렌더가 어긋나면
 * hydration 이 깨지고, 스크롤할 때마다 광고가 바뀌면 사용자가 방금 본 걸 못 찾는다.
 * 대신 슬롯 위치(seed)로 결정한다: 같은 자리엔 늘 같은 배너.
 */
export function pickHouseAd(
  placement: AdPlacement,
  seed = 0,
  opts: { signedIn?: boolean } = {},
): HouseAd | null {
  const pool = HOUSE_ADS.filter((ad) => {
    if (ad.placements && !ad.placements.includes(placement)) return false;
    if (!ad.showWhenSignedIn && opts.signedIn) return false;
    return true;
  });
  if (pool.length === 0) return null;
  const idx = ((seed % pool.length) + pool.length) % pool.length;
  return pool[idx] ?? null;
}
