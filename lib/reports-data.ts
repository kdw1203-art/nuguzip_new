export type ReportItem = {
  id: string;
  title: string;
  type: "free" | "paid";
  price: number | null;
  author: string;
  org: string;
  summary: string;
  body: string;
};

export const REPORTS: ReportItem[] = [
  {
    id: "r1",
    title: "2026년 1분기 강남권 정비사업 동향 요약",
    type: "free",
    price: null,
    author: "우동연구소",
    org: "WOODONG 리서치",
    summary: "사업 단계별 추이와 거래 심리를 한눈에.",
    body: "본 리포트는 공공데이터와 커뮤니티 신호를 결합한 요약입니다. 실제 투자 판단은 반드시 별도 검증이 필요합니다.",
  },
  {
    id: "r2",
    title: "인천 연수구 주거환경정비 PF 체크리스트",
    type: "paid",
    price: 49000,
    author: "최PF",
    org: "독립 컨설턴트",
    summary: "사업성·현금흐름·리스크 항목별 점검표.",
    body: "유료 구독(EXPERT) 또는 단건 결제 시 전체 PDF를 내려받을 수 있도록 연동 예정입니다.",
  },
];
