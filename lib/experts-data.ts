export type ExpertCard = {
  id: string;
  name: string;
  role: string;
  region: string;
  org: string;
  specialty: string;
  feeFrom: number;
  rating: number;
  bio: string;
};

export const EXPERTS: ExpertCard[] = [
  {
    id: "1",
    name: "김정비",
    role: "정비사업 컨설턴트",
    region: "서울·경기",
    org: "WOODONG 파트너",
    specialty: "관리처분·조합 운영",
    feeFrom: 150000,
    rating: 4.9,
    bio: "재개발·재건축 사업 구조와 일정 관리 자문.",
  },
  {
    id: "2",
    name: "이감정",
    role: "감정평가사",
    region: "부산·울산",
    org: "○○감정법인",
    specialty: "토지·건물 감정",
    feeFrom: 80000,
    rating: 4.8,
    bio: "정비사업 구역 내 감정평가 실무.",
  },
  {
    id: "3",
    name: "박법무",
    role: "변호사",
    region: "전국(화상)",
    org: "○○법률사무소",
    specialty: "조합·시행사 계약",
    feeFrom: 300000,
    rating: 5.0,
    bio: "정비사업 총회·분쟁 대응.",
  },
];
