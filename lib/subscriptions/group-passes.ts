export type GroupPassId = "basic" | "pro";

export type GroupPassDefinition = {
  id: GroupPassId;
  name: string;
  tagline: string;
  /** 월 결제 가격 (원). */
  priceMonthly: number;
  accentClass: string;
  highlight?: boolean;
  /** 대표 유저상. */
  bestFor: string[];
  /** 핵심 제한치(운영 정책 표기용). */
  limits: {
    concurrent: number;
    monthlyCreate: number;
    maxMembers: number;
  };
  /** 기능 리스트. `"limited"` 는 일부 제공. */
  features: Array<{
    label: string;
    included: boolean | "limited";
    note?: string;
  }>;
  /** 번들 포함 정보 — 해당 멤버십 가입 시 자동 포함됨. */
  includedWith?: ("pro" | "expert")[];
};

/**
 * 모임 패스 (Group Pass) 단품 가격.
 *   - BASIC 1,900원 / PRO 3,900원
 *   - PRO 멤버십은 Group Pass BASIC을 자동 포함 (추가 결제 불필요)
 *   - EXPERT 멤버십은 Group Pass PRO 를 자동 포함
 */
export const GROUP_PASSES: GroupPassDefinition[] = [
  {
    id: "basic",
    name: "Group Pass BASIC",
    tagline: "소규모 임장·스터디 모임을 가볍게 운영하고 싶은 운영자용",
    priceMonthly: 1_900,
    accentClass: "border-[#3182f6]/70",
    includedWith: ["pro", "expert"],
    bestFor: [
      "동네·단지 한 곳을 파고드는 소규모 임장 모임 리더",
      "월 1회 내외로 관심지역 스터디를 정기적으로 여는 커뮤니티 운영자",
      "모임이 처음이라 기본 운영 도구만 필요한 입문 운영자",
    ],
    limits: {
      concurrent: 1,
      monthlyCreate: 1,
      maxMembers: 30,
    },
    features: [
      { label: "모임 개설 월 1건", included: true },
      { label: "동시 운영 1개", included: true },
      { label: "정원 최대 30명", included: true },
      { label: "일정·공지사항·참석 체크 기본 기능", included: true },
      { label: "참가자 채팅방 (텍스트 · 이미지)", included: true },
      { label: "무료/소액 참가비 설정 (정산 지원)", included: true, note: "정산 수수료 5%" },
      { label: "참가자 리마인드 알림", included: "limited", note: "개설 / 24h 전 2회" },
      { label: "참석자 태그·설문·맞춤 리마인드", included: false },
      { label: "추천 모임 노출 보너스", included: false },
      { label: "모임 전용 브랜딩·커버 디자인", included: false },
    ],
  },
  {
    id: "pro",
    name: "Group Pass PRO",
    tagline: "여러 지역·정기 모임을 운영하는 파워 운영자 · 커뮤니티 리더용",
    priceMonthly: 3_900,
    accentClass: "border-violet-500",
    highlight: true,
    includedWith: ["expert"],
    bestFor: [
      "지역별/테마별 여러 모임을 동시에 굴리는 공인중개사·강사",
      "정기 스터디·오프라인 투어를 반복 운영하는 파워 리더",
      "참석자 설문·리마인드·태그 분류로 운영 품질을 높이고 싶은 운영자",
    ],
    limits: {
      concurrent: 5,
      monthlyCreate: 20,
      maxMembers: 100,
    },
    features: [
      { label: "모임 개설 월 20건", included: true },
      { label: "동시 운영 5개 이상", included: true },
      { label: "정원 최대 100명+ (수동 승인 확장)", included: true },
      { label: "일정·공지·참석 체크 + 반복 일정", included: true },
      { label: "참가자 채팅방 (텍스트·이미지·파일 첨부)", included: true },
      { label: "참가자 태그·설문·맞춤 리마인드 자동화", included: true },
      { label: "추천 모임 노출 부스트 (홈·탐색 상단)", included: true },
      { label: "모임 전용 커버/브랜딩 업로드", included: true },
      {
        label: "참가비 정산 수수료 할인",
        included: true,
        note: "5% → 3% 할인",
      },
      { label: "후기·평점 분석 리포트 (월간)", included: true },
      { label: "No-show 자동 통계 · 블랙리스트 관리", included: true },
    ],
  },
];

export function getGroupPass(id: GroupPassId): GroupPassDefinition {
  return GROUP_PASSES.find((g) => g.id === id) ?? GROUP_PASSES[0];
}
