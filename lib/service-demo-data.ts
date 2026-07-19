/**
 * Vite export(`platform-src/lib/service-demo-data.ts`) 데모 데이터.
 * 순수 상수·formatter 만 포함하여 서버/클라 어느 쪽에서도 import 가능하게 유지합니다.
 *
 * 추후 실제 API 로 바꿀 때는 이 파일의 export 시그니처만 유지하면 됩니다.
 */

export type DemoUserTier = "free" | "pro" | "expert";

export interface DemoUser {
  id: string;
  name: string;
  avatar: string;
  tier: DemoUserTier;
  tierLabel: string;
  region: string;
  joinedAt: string;
  inspections: number;
  reports: number;
  posts: number;
  followers: number;
  bio: string;
}

export interface DemoRegion {
  id: string;
  city: string;
  district: string;
  avgPrice: number;
  priceChange: number;
  priceChangeMonth: number;
  tradingVolume: number;
  newListings: number;
  inspections: number;
  popularComplex: string;
  popularComplexPrice: number;
  topKeywords: string[];
  recentTrade: { complex: string; area: number; price: number; date: string };
  schoolRank: string;
  safetyGrade: string;
  transportScore: number;
  insightCount: number;
  communityPosts: number;
  lat: number;
  lng: number;
}

export interface DemoExpert {
  id: string;
  name: string;
  title: string;
  category: string;
  categoryIcon: string;
  verified: boolean;
  rating: number;
  reviews: number;
  consultations: number;
  experience: string;
  regions: string[];
  specialties: string[];
  introduction: string;
  responseTime: string;
  responseRate: number;
  consultationFee: number;
  reportFee: number;
  isPremium: boolean;
  gradient: string;
  badge: string;
  recentReviews: { user: string; rating: number; comment: string; date: string }[];
  portfolioItems: { type: string; region: string; result: string; period: string }[];
}

export interface DemoReport {
  id: string;
  title: string;
  subtitle: string;
  author: DemoExpert;
  category: string;
  region: string;
  price: number;
  originalPrice: number;
  rating: number;
  reviews: number;
  downloads: number;
  views: number;
  pages: number;
  publishedAt: string;
  updatedAt: string;
  tags: string[];
  isPremium: boolean;
  gradient: string;
  tableOfContents: string[];
  previewContent: string;
  sampleImage: string;
}

export interface DemoMeeting {
  id: string;
  name: string;
  description: string;
  host: DemoExpert | { name: string; title: string; verified: boolean };
  category: string;
  type: "온라인" | "오프라인";
  region: string;
  maxMembers: number;
  currentMembers: number;
  schedule: string;
  nextMeeting: string;
  fee: number;
  tags: string[];
  isPremium: boolean;
  rating: number;
  totalMeetings: number;
  isOpen: boolean;
  checklist: string[];
  recentActivity: string;
  images: string[];
}

export interface DemoPost {
  id: string;
  title: string;
  content: string;
  author: DemoUser;
  category: string;
  region: string;
  likes: number;
  comments: number;
  bookmarks: number;
  views: number;
  publishedAt: string;
  tags: string[];
  isHot: boolean;
  hasChecklist: boolean;
  hasPDF: boolean;
}

export const DEMO_USERS: DemoUser[] = [
  {
    id: "user-1",
    name: "김민준",
    avatar: "민",
    tier: "expert",
    tierLabel: "엑스퍼트",
    region: "서울 강남구",
    joinedAt: "2025-03-15",
    inspections: 47,
    reports: 12,
    posts: 89,
    followers: 234,
    bio: "강남권 재건축 전문 임장러 | 투자 10년차 | 직업 공인중개사",
  },
  {
    id: "user-2",
    name: "이수진",
    avatar: "수",
    tier: "pro",
    tierLabel: "프로",
    region: "서울 마포구",
    joinedAt: "2025-08-22",
    inspections: 18,
    reports: 5,
    posts: 34,
    followers: 67,
    bio: "내집마련 준비 중인 30대 직장인 | 신축 선호",
  },
  {
    id: "user-3",
    name: "박철수",
    avatar: "철",
    tier: "free",
    tierLabel: "무료",
    region: "경기 성남시",
    joinedAt: "2026-01-10",
    inspections: 3,
    reports: 0,
    posts: 7,
    followers: 12,
    bio: "부동산 투자 입문 | 판교 신도시 관심",
  },
];

export const DEMO_REGIONS: DemoRegion[] = [
  {
    id: "gangnam-gu",
    city: "서울",
    district: "강남구",
    avgPrice: 2850000000,
    priceChange: 2.3,
    priceChangeMonth: 0.8,
    tradingVolume: 142,
    newListings: 38,
    inspections: 89,
    popularComplex: "은마아파트",
    popularComplexPrice: 2100000000,
    topKeywords: ["재건축", "학군", "교통"],
    recentTrade: { complex: "대치 래미안", area: 84, price: 3200000000, date: "2026-03-10" },
    schoolRank: "최상위",
    safetyGrade: "A",
    transportScore: 98,
    insightCount: 234,
    communityPosts: 156,
    lat: 37.4979,
    lng: 127.0276,
  },
  {
    id: "mapo-gu",
    city: "서울",
    district: "마포구",
    avgPrice: 1250000000,
    priceChange: 4.1,
    priceChangeMonth: 1.2,
    tradingVolume: 98,
    newListings: 52,
    inspections: 61,
    popularComplex: "마포래미안푸르지오",
    popularComplexPrice: 1580000000,
    topKeywords: ["직주근접", "신축", "홍대인근"],
    recentTrade: { complex: "공덕 파크자이", area: 59, price: 1150000000, date: "2026-03-14" },
    schoolRank: "상위",
    safetyGrade: "A",
    transportScore: 92,
    insightCount: 178,
    communityPosts: 89,
    lat: 37.5665,
    lng: 126.9014,
  },
  {
    id: "seongnam-bundang",
    city: "경기",
    district: "성남시 분당구",
    avgPrice: 1450000000,
    priceChange: 5.8,
    priceChangeMonth: 2.1,
    tradingVolume: 67,
    newListings: 29,
    inspections: 44,
    popularComplex: "파크뷰",
    popularComplexPrice: 1700000000,
    topKeywords: ["판교IT", "학군", "자연환경"],
    recentTrade: { complex: "수내동 삼성", area: 112, price: 1950000000, date: "2026-03-08" },
    schoolRank: "상위",
    safetyGrade: "A+",
    transportScore: 85,
    insightCount: 145,
    communityPosts: 73,
    lat: 37.3825,
    lng: 127.1235,
  },
  {
    id: "songpa-gu",
    city: "서울",
    district: "송파구",
    avgPrice: 2100000000,
    priceChange: 1.7,
    priceChangeMonth: 0.5,
    tradingVolume: 118,
    newListings: 41,
    inspections: 72,
    popularComplex: "잠실엘스",
    popularComplexPrice: 2450000000,
    topKeywords: ["잠실", "올림픽공원", "강남생활권"],
    recentTrade: { complex: "리센츠", area: 84, price: 2280000000, date: "2026-03-12" },
    schoolRank: "최상위",
    safetyGrade: "A",
    transportScore: 95,
    insightCount: 198,
    communityPosts: 112,
    lat: 37.5145,
    lng: 127.1059,
  },
];

export const DEMO_EXPERTS: DemoExpert[] = [
  {
    id: "expert-1",
    name: "김재원",
    title: "공인중개사 · 투자 컨설턴트",
    category: "매매/투자 상담",
    categoryIcon: "🏢",
    verified: true,
    rating: 4.9,
    reviews: 312,
    consultations: 1580,
    experience: "16년",
    regions: ["서울 강남", "서울 서초", "서울 송파"],
    specialties: ["재건축 투자", "신축 매입", "임장 동행"],
    introduction:
      "강남권 16년 경력의 공인중개사입니다. 재건축 투자 전문으로, 현장 임장부터 계약까지 A-Z를 도와드립니다.",
    responseTime: "평균 1.2시간",
    responseRate: 99,
    consultationFee: 80000,
    reportFee: 150000,
    isPremium: true,
    gradient: "from-blue-500 to-indigo-600",
    badge: "이달의 전문가",
    recentReviews: [
      { user: "김O현", rating: 5, comment: "임장 동행 서비스 최고!", date: "2026-03-15" },
    ],
    portfolioItems: [
      { type: "재건축 투자", region: "강남구 대치동", result: "수익률 +38%", period: "2.5년" },
    ],
  },
  {
    id: "expert-2",
    name: "박지현",
    title: "부동산 전문 변호사",
    category: "법무/계약 검토",
    categoryIcon: "⚖️",
    verified: true,
    rating: 5.0,
    reviews: 201,
    consultations: 920,
    experience: "13년",
    regions: ["전국"],
    specialties: ["계약서 검토", "등기 분석", "분쟁 해결"],
    introduction: "13년간 부동산 전문 변호사. 계약 전 전문가 검토로 손해를 막으세요.",
    responseTime: "평균 0.8시간",
    responseRate: 100,
    consultationFee: 150000,
    reportFee: 300000,
    isPremium: true,
    gradient: "from-emerald-500 to-teal-600",
    badge: "응답률 1위",
    recentReviews: [
      { user: "최O우", rating: 5, comment: "꼼꼼한 계약서 검토 감사합니다.", date: "2026-03-14" },
    ],
    portfolioItems: [
      { type: "계약 분쟁 해결", region: "서울 전역", result: "100% 해결률", period: "13년 누적" },
    ],
  },
  {
    id: "expert-3",
    name: "이미래",
    title: "AI 부동산 애널리스트",
    category: "시장 분석/리포트",
    categoryIcon: "📊",
    verified: true,
    rating: 4.8,
    reviews: 156,
    consultations: 432,
    experience: "7년",
    regions: ["서울", "경기"],
    specialties: ["시세 예측", "지역 분석", "투자 리포트"],
    introduction: "데이터·AI 기반 시장 분석 전문가. 6개월 시세 예측 82% 정확도.",
    responseTime: "평균 3시간",
    responseRate: 96,
    consultationFee: 50000,
    reportFee: 80000,
    isPremium: false,
    gradient: "from-purple-500 to-pink-600",
    badge: "리포트 판매 1위",
    recentReviews: [
      { user: "박O서", rating: 5, comment: "마포 분석 리포트 데이터 명확!", date: "2026-03-10" },
    ],
    portfolioItems: [
      { type: "시장 예측 리포트", region: "서울/경기", result: "82% 정확도", period: "최근 12개월" },
    ],
  },
];

export const DEMO_REPORTS: DemoReport[] = [
  {
    id: "report-1",
    title: "2026년 강남구 재건축 임장 완전 정복 가이드",
    subtitle: "은마·대치·압구정 3대 재건축 단지 현장 분석 + 투자 타이밍 전략",
    author: DEMO_EXPERTS[0],
    category: "임장 가이드",
    region: "서울 강남구",
    price: 45000,
    originalPrice: 65000,
    rating: 4.9,
    reviews: 289,
    downloads: 1847,
    views: 12540,
    pages: 58,
    publishedAt: "2026-02-20",
    updatedAt: "2026-03-10",
    tags: ["재건축", "강남", "임장가이드", "투자전략"],
    isPremium: true,
    gradient: "from-blue-500 to-indigo-600",
    tableOfContents: [
      "1. 강남 재건축 시장 현황 개요",
      "2. 은마아파트 임장 체크포인트 47선",
      "3. 대치동 래미안·삼성 단지 비교",
    ],
    previewContent: "강남구 재건축 시장은 2026년 들어 규제 완화 기대감과 공급 부족으로…",
    sampleImage: "from-blue-400 to-indigo-500",
  },
  {
    id: "report-2",
    title: "마포구 공덕·아현 뉴타운 임장 리포트 2026",
    subtitle: "직주근접 + 신축 프리미엄 분석",
    author: DEMO_EXPERTS[2],
    category: "시장 분석",
    region: "서울 마포구",
    price: 28000,
    originalPrice: 40000,
    rating: 4.8,
    reviews: 143,
    downloads: 892,
    views: 7230,
    pages: 38,
    publishedAt: "2026-03-01",
    updatedAt: "2026-03-15",
    tags: ["마포", "공덕", "뉴타운", "신축"],
    isPremium: false,
    gradient: "from-purple-500 to-pink-600",
    tableOfContents: [
      "1. 마포구 2026 시장 개요",
      "2. 공덕 뉴타운 임장 리포트",
    ],
    previewContent: "마포구 공덕역 인근은 5개 지하철 노선이 교차하는 교통의 요지…",
    sampleImage: "from-purple-400 to-pink-500",
  },
  {
    id: "report-3",
    title: "경기 분당구 판교 IT 클러스터 수혜 단지 완전 분석",
    subtitle: "네이버 본사 인근 아파트 실거래 데이터 분석",
    author: DEMO_EXPERTS[2],
    category: "투자 분석",
    region: "경기 성남시 분당구",
    price: 35000,
    originalPrice: 50000,
    rating: 4.7,
    reviews: 98,
    downloads: 634,
    views: 4890,
    pages: 44,
    publishedAt: "2026-01-25",
    updatedAt: "2026-02-28",
    tags: ["분당", "판교", "IT클러스터"],
    isPremium: false,
    gradient: "from-emerald-500 to-teal-600",
    tableOfContents: ["1. 판교 IT 클러스터 고용 현황", "2. 수혜 아파트 TOP 10"],
    previewContent: "판교 테크노밸리 IT 기업 임직원 수 약 7만명이 분당구 주거 수요를 견인…",
    sampleImage: "from-emerald-400 to-teal-500",
  },
];

export const DEMO_MEETINGS: DemoMeeting[] = [
  {
    id: "meeting-1",
    name: "강남 재건축 임장 모임 (정기)",
    description: "강남권 재건축 단지를 매주 함께 임장하는 정기 모임.",
    host: DEMO_EXPERTS[0],
    category: "임장",
    type: "오프라인",
    region: "서울 강남구",
    maxMembers: 15,
    currentMembers: 12,
    schedule: "매주 토요일 14:00",
    nextMeeting: "2026-03-22",
    fee: 30000,
    tags: ["재건축", "전문가동행"],
    isPremium: true,
    rating: 4.9,
    totalMeetings: 24,
    isOpen: true,
    checklist: ["체크리스트 지참", "편한 운동화"],
    recentActivity: "3시간 전 공지글 등록",
    images: ["from-blue-400 to-indigo-500"],
  },
  {
    id: "meeting-2",
    name: "마포·용산 신축 임장 스터디",
    description: "마포·용산 신축 아파트 함께 임장 + 스터디.",
    host: { name: "임장고수", title: "임장 10년 경력자", verified: false },
    category: "임장",
    type: "오프라인",
    region: "서울 마포구",
    maxMembers: 8,
    currentMembers: 6,
    schedule: "격주 일요일 10:00",
    nextMeeting: "2026-03-29",
    fee: 10000,
    tags: ["신축", "초보환영"],
    isPremium: false,
    rating: 4.7,
    totalMeetings: 8,
    isOpen: true,
    checklist: ["신분증 지참"],
    recentActivity: "어제 후기 3건",
    images: ["from-purple-400 to-pink-500"],
  },
  {
    id: "meeting-3",
    name: "부동산 투자 스터디 (온라인)",
    description: "Zoom 기반 온라인 스터디. 실거래 데이터 분석.",
    host: DEMO_EXPERTS[2],
    category: "스터디",
    type: "온라인",
    region: "전국",
    maxMembers: 30,
    currentMembers: 23,
    schedule: "매주 화요일 20:00",
    nextMeeting: "2026-03-24",
    fee: 0,
    tags: ["온라인", "무료"],
    isPremium: false,
    rating: 4.6,
    totalMeetings: 31,
    isOpen: true,
    checklist: ["Zoom 앱 설치"],
    recentActivity: "오늘 시간표 공유",
    images: ["from-emerald-400 to-teal-500"],
  },
];

export const DEMO_POSTS: DemoPost[] = [
  {
    id: "post-1",
    title: "강남 은마아파트 임장 후기 - 재건축 추진 현황 + 사업성 분석",
    content: "지난 주 은마아파트 직접 임장 다녀왔습니다…",
    author: DEMO_USERS[0],
    category: "임장후기",
    region: "서울 강남구",
    likes: 234,
    comments: 47,
    bookmarks: 89,
    views: 3420,
    publishedAt: "2026-03-15T09:30:00",
    tags: ["은마아파트", "재건축"],
    isHot: true,
    hasChecklist: true,
    hasPDF: true,
  },
  {
    id: "post-2",
    title: "마포구 공덕역 역세권 신축 탐방 - 30대 직장인 실수요자 관점",
    content: "직장이 여의도인 30대 맞벌이 부부입니다…",
    author: DEMO_USERS[1],
    category: "임장후기",
    region: "서울 마포구",
    likes: 98,
    comments: 23,
    bookmarks: 34,
    views: 1567,
    publishedAt: "2026-03-14T14:00:00",
    tags: ["마포", "공덕", "신축"],
    isHot: false,
    hasChecklist: true,
    hasPDF: false,
  },
  {
    id: "post-3",
    title: "부동산 입문자 체크리스트 공유합니다",
    content: "저도 처음엔 막막했는데, 체계적으로 임장을 배웠습니다…",
    author: DEMO_USERS[2],
    category: "정보공유",
    region: "경기",
    likes: 187,
    comments: 62,
    bookmarks: 156,
    views: 4231,
    publishedAt: "2026-03-12T19:00:00",
    tags: ["초보자", "체크리스트"],
    isHot: true,
    hasChecklist: false,
    hasPDF: false,
  },
];

export const SITE_STATS = {
  users: 15847,
  inspections: 48291,
  posts: 9234,
  experts: 312,
} as const;

export const INSPECTION_STATS = {
  totalGroups: 234,
  activeGroups: 89,
  plannedInspections: 47,
  completedToday: 12,
  aiNotesGenerated: 1847,
} as const;

export function formatPrice(price: number): string {
  if (price >= 100_000_000) {
    const eok = Math.floor(price / 100_000_000);
    const man = Math.floor((price % 100_000_000) / 10_000);
    return man > 0 ? `${eok}억 ${man.toLocaleString()}만원` : `${eok}억원`;
  }
  return `${(price / 10_000).toFixed(0)}만원`;
}

export function formatPriceShort(price: number): string {
  if (price >= 100_000_000) return `${(price / 100_000_000).toFixed(1)}억`;
  if (price >= 10_000) return `${(price / 10_000).toFixed(0)}만`;
  return String(price);
}
