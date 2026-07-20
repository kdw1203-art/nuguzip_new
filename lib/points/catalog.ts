/**
 * 포인트 이코노미 카탈로그 — 적립·소비 정의 (기획안 §4).
 * 1포인트 ≈ 1원 체감 가치. 모든 화면·서버가 이 상수를 공유한다.
 */

export type EarnRule = {
  key: string;
  label: string;
  points: number;
  /** 하루 최대 적립 횟수 (남용 방지). undefined = 제한 없음(승인 기반) */
  dailyCap?: number;
  once?: boolean;
};

export const EARN_RULES: Record<string, EarnRule> = {
  listing_approved: { key: "listing_approved", label: "매물 등록 승인", points: 300 },
  listing_first: { key: "listing_first", label: "첫 매물 등록 보너스", points: 500, once: true },
  listing_owner_verified: { key: "listing_owner_verified", label: "소유확인 완료", points: 200 },
  listing_photos: { key: "listing_photos", label: "사진 3장 이상", points: 50 },
  listing_sold: { key: "listing_sold", label: "거래완료 신고", points: 500 },
  note_public: { key: "note_public", label: "임장노트 공개", points: 100, dailyCap: 5 },
  review_written: { key: "review_written", label: "단지 후기 작성", points: 30, dailyCap: 5 },
  attendance: { key: "attendance", label: "출석", points: 10, dailyCap: 1 },
  referral: { key: "referral", label: "친구 추천 가입", points: 300 },
};

export type SpendItem = {
  key: string;
  label: string;
  cost: number;
  desc: string;
  /** 소비 후 부여되는 효과 종류 */
  effect: "ai_analysis" | "complex_report" | "listing_boost" | "plan_pro" | "plan_expert";
  /** 부스트 등 기간성 효과의 일수 */
  durationDays?: number;
};

export const SPEND_ITEMS: SpendItem[] = [
  { key: "ai_analysis", label: "AI 임장 분석 1회", cost: 200, desc: "내 노트를 AI가 분석해 강·약점 요약", effect: "ai_analysis" },
  { key: "complex_report", label: "단지 리포트 PDF", cost: 300, desc: "단지 실거래·시세 리포트 다운로드", effect: "complex_report" },
  { key: "listing_boost_7d", label: "매물 상단 노출 7일", cost: 500, desc: "내 매물을 목록·지도 상단에 노출", effect: "listing_boost", durationDays: 7 },
  { key: "plan_pro_1m", label: "PRO 구독 1개월 교환", cost: 2900, desc: "PRO 기능 1개월 이용권", effect: "plan_pro", durationDays: 30 },
  { key: "plan_expert_1m", label: "EXPERT 구독 1개월 교환", cost: 18900, desc: "EXPERT 기능 1개월 이용권", effect: "plan_expert", durationDays: 30 },
];

export function getSpendItem(key: string): SpendItem | undefined {
  return SPEND_ITEMS.find((s) => s.key === key);
}

/** 적립 상한 (기획안 §4 방어) */
export const DAILY_EARN_CAP = 500;
export const MONTHLY_EARN_CAP = 5000;
/** 포인트 유효기간(개월) */
export const POINT_EXPIRY_MONTHS = 6;
