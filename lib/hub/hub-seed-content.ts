/** 허브 빈 상태용 운영형 샘플·가이드 (DB에 저장되지 않음) */

export type HubSeedMeeting = {
  id: string;
  title: string;
  region: string;
  category: string;
  scheduleLabel: string;
  fee: number;
  currentMembers: number;
  maxMembers: number;
};

export type HubSeedMarketRequest = {
  id: string;
  title: string;
  description: string;
  requestType: string;
  city: string;
  district: string;
  budgetLabel: string;
};

export type HubGuideCard = {
  title: string;
  body: string;
  href: string;
  cta: string;
};

export const HUB_GUIDE_CARDS: HubGuideCard[] = [
  {
    title: "동네 글부터 시작하기",
    body: "관심 지역·단지에 대한 질문이나 임장 후기를 올리면 이웃과 정보를 나눌 수 있어요.",
    href: "/community/write",
    cta: "동네이야기 쓰기",
  },
  {
    title: "임장 모임 개설",
    body: "같은 지역 임장 스터디·투어를 만들고 참가비·일정을 한 번에 관리하세요.",
    href: "/groups/create",
    cta: "모임 만들기",
  },
  {
    title: "마켓 의뢰 등록",
    body: "자료·도면·현장 촬영 등 필요한 업무를 의뢰하고 견적을 받아보세요.",
    href: "/market/create",
    cta: "의뢰 올리기",
  },
];

export const SAMPLE_MEETINGS: HubSeedMeeting[] = [
  {
    id: "sample-meet-gangnam",
    title: "강남 재건축 단지 주말 임장",
    region: "서울특별시 강남구",
    category: "임장",
    scheduleLabel: "토 14:00 · 오프라인",
    fee: 0,
    currentMembers: 8,
    maxMembers: 12,
  },
  {
    id: "sample-meet-mapo",
    title: "마포 전세·갭투자 스터디",
    region: "서울특별시 마포구",
    category: "스터디",
    scheduleLabel: "수 20:00 · 온라인",
    fee: 5000,
    currentMembers: 14,
    maxMembers: 20,
  },
  {
    id: "sample-meet-bundang",
    title: "분당 신도시 입주 후기 나눔",
    region: "경기도 성남시 분당구",
    category: "모임",
    scheduleLabel: "일 10:30 · 오프라인",
    fee: 0,
    currentMembers: 5,
    maxMembers: 10,
  },
];

export const SAMPLE_MARKET_REQUESTS: HubSeedMarketRequest[] = [
  {
    id: "sample-market-registry",
    title: "○○아파트 등기부등본·평면도 정리 의뢰",
    description: "임장 전 단지 자료를 PDF로 정리해 주실 분을 찾습니다.",
    requestType: "자료요청",
    city: "서울특별시",
    district: "송파구",
    budgetLabel: "3만 ~ 5만원",
  },
  {
    id: "sample-market-photo",
    title: "현장 사진·동영상 촬영",
    description: "주말 오전 단지 외관·주변 상권 촬영 (스마트폰 가능)",
    requestType: "촬영",
    city: "경기도",
    district: "수원시 영통구",
    budgetLabel: "5만 ~ 8만원",
  },
];

export const SAMPLE_REPORT_GUIDES: HubGuideCard[] = [
  {
    title: "지역 시세 요약 리포트",
    body: "실거래·전세가 추이를 표와 그래프로 정리한 샘플 형식입니다.",
    href: "/reports/create",
    cta: "리포트 올리기",
  },
  {
    title: "단지 비교 체크리스트",
    body: "학군·교통·관리비 항목을 표준 템플릿으로 공유해 보세요.",
    href: "/reports/create",
    cta: "템플릿 작성",
  },
];
