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
  /* [3차] 동네이야기 참여 루프 — 글·댓글이 0인 커뮤니티에 첫 동기를 만든다.
     refId(글 id) 멱등이라 같은 글에 댓글을 여러 개 달아도 1회만 적립된다. */
  post_written: { key: "post_written", label: "동네 글 작성", points: 50, dailyCap: 2 },
  comment_written: { key: "comment_written", label: "동네 댓글 작성", points: 20, dailyCap: 3 },
  /* [#65] 글쓴이가 내 댓글을 채택 — 질문→좋은 답 루프의 보상. refId=글:댓글 멱등. */
  comment_adopted: { key: "comment_adopted", label: "댓글 채택됨", points: 30, dailyCap: 5 },
  attendance: { key: "attendance", label: "출석", points: 10, dailyCap: 1 },
  /* 연속 출석 보너스 — 출석 기본 10P 에 얹는 추가분(3일 +10P → 합 20P, 7일 +40P → 합 50P).
     lib/points/store-db.checkIn 의 스트릭 티어(10/20/50)와 합이 일치해야 한다. */
  attendance_streak_3: {
    key: "attendance_streak_3",
    label: "3일 연속 출석 보너스",
    points: 10,
    dailyCap: 1,
  },
  attendance_streak_7: {
    key: "attendance_streak_7",
    label: "7일 연속 출석 보너스",
    points: 40,
    dailyCap: 1,
  },
  /* 지역 임장 레벨 상승(새싹→…→마스터, lib/gamification/region-levels.ts) —
     노트 저장 시 그 지역 노트 수가 레벨 경계(1·3·5·10·20)에 도달하면 지급.
     refId=지역:레벨 멱등이라 삭제·재작성으로 같은 경계를 다시 밟아도 1회만. */
  region_level_up: {
    key: "region_level_up",
    label: "지역 임장 레벨 상승",
    points: 50,
    dailyCap: 3,
  },
  referral: { key: "referral", label: "친구 추천 가입", points: 300 },
  onboarding_complete: {
    key: "onboarding_complete",
    label: "온보딩 완주 보너스",
    points: 200,
    once: true,
  },
};

export type SpendItem = {
  key: string;
  label: string;
  cost: number;
  desc: string;
  /** 소비 후 부여되는 효과 종류 */
  effect: "listing_boost" | "plan_pro" | "plan_expert" | "post_boost" | "nickname_aurora";
  /** 부스트 등 기간성 효과의 일수 */
  durationDays?: number;
};

/* "AI 임장 분석 1회"(ai_analysis, 200P)는 제거 — 크레딧을 기록만 하고 실제로
   분석 횟수를 늘려 주는 소비 지점이 어디에도 없던 유령 상품이었다. 포인트만 받고
   아무것도 주지 않는 셈이라 판매를 중단한다. 기존 구매 이력(원장 reason
   spend:ai_analysis)은 화면에서 "포인트 사용" 폴백 라벨로 계속 표시된다.
   "단지 리포트 PDF"(complex_report, 300P)도 같은 이유로 제거 — 크레딧만 기록될 뿐
   PDF 를 내려주는 소비 지점이 없었다. 기존 이력도 같은 폴백 라벨로 표시된다. */
export const SPEND_ITEMS: SpendItem[] = [
  { key: "listing_boost_7d", label: "매물 상단 노출 7일", cost: 500, desc: "내 매물을 목록·지도 상단에 노출", effect: "listing_boost", durationDays: 7 },
  { key: "post_boost_3d", label: "동네이야기 추천글 3일", cost: 300, desc: "내가 쓴 동네이야기 글을 3일간 피드 상단에 '추천글'로 노출", effect: "post_boost", durationDays: 3 },
  { key: "nickname_aurora_7d", label: "닉네임 오로라 효과 7일", cost: 200, desc: "글 상세에서 내 닉네임이 오로라 그라데이션으로 빛나요", effect: "nickname_aurora", durationDays: 7 },
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

/**
 * 포인트 무상성 고지 — 단일 출처(상점·지갑·요금 FAQ·약관이 같은 사실을 말한다).
 *
 * [2026-08-22] 토스페이먼츠 심사팀이 사이트를 '포인트 충전 업종'으로 분류했다.
 * 실제로는 유상 충전(돈→포인트) 경로가 코드 어디에도 없다 — 포인트는 전부
 * EARN_RULES 의 활동 적립뿐이다. 오해의 여지를 없애기 위해 모든 포인트 표면에
 * 이 사실을 상시 고지한다. 유상 충전 상품을 도입하는 날에는 이 문구와 약관
 * 제8조의2, 그리고 PG 유의업종 요건(보증보험 등)을 함께 갱신해야 한다.
 */
export const POINTS_GRATUITOUS_NOTICE =
  "누구집 포인트는 출석·기록 공개·친구 초대 같은 활동으로만 적립되는 무상 리워드입니다. 현금으로 구매(충전)할 수 없고, 현금으로 환불·전환되지 않으며, 회원 간 양도가 불가합니다. 적립일로부터 6개월이 지나면 소멸됩니다.";
