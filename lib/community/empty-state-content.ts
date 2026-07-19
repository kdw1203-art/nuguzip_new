/** 커뮤니티 빈 상태 — 카테고리별 질문 템플릿·인기 태그·지역 제안 */

export const POPULAR_COMMUNITY_HASHTAGS = [
  "전세",
  "갭투자",
  "학군",
  "재건축",
  "입주후기",
  "관리비",
  "역세권",
  "분양",
] as const;

export const SUGGESTED_REGIONS = [
  { city: "서울특별시", district: "강남구", label: "강남구" },
  { city: "서울특별시", district: "마포구", label: "마포구" },
  { city: "경기도", district: "성남시 분당구", label: "분당" },
  { city: "경기도", district: "수원시 영통구", label: "영통" },
  { city: "인천광역시", district: "연수구", label: "연수" },
  { city: "부산광역시", district: "해운대구", label: "해운대" },
] as const;

type Template = { title: string; body: string; tags: string };

const DEFAULT_TEMPLATES: Template[] = [
  {
    title: "○○동 아파트, 실거주 vs 투자 어떻게 보시나요?",
    body: "관심 단지를 임장했는데 학군·교통은 괜찮고, 대신 관리비와 노후가 고민입니다. 비슷한 경험 있으신 분 조언 부탁드려요.",
    tags: "질문, 임장, 전세",
  },
  {
    title: "이 지역 전세 vs 매매, 지금 타이밍 어떤가요?",
    body: "최근 실거래와 주변 시세를 비교 중입니다. 같은 예산으로 전세·매매 중 어디에 무게를 두는 게 나을지 의견 나눠 주세요.",
    tags: "전세, 매매, 시세",
  },
];

const BY_SUB: Record<string, Template[]> = {
  qna: [
    {
      title: "첫 아파트 구매, 체크리스트 뭐부터 보나요?",
      body: "예산·대출 한도는 정했는데 단지 고를 때 우선순위(학군/교통/향/층)를 어떻게 잡으면 좋을까요?",
      tags: "질문, 첫구매",
    },
    {
      title: "전세 계약 전 꼭 확인할 서류가 있을까요?",
      body: "등기부등본·확정일자·전입신고 순서와 중개사에게 꼭 물어봐야 할 항목이 궁금합니다.",
      tags: "전세, 계약, 질문",
    },
  ],
  region: [
    {
      title: "○○구 생활권, 실제 거주 만족도 어떤가요?",
      body: "직장·학교 접근성, 마트·병원, 야간 소음 등 실거주자만 아는 포인트를 공유해 주세요.",
      tags: "지역, 생활, 후기",
    },
  ],
  complex: [
    {
      title: "○○아파트 입주 1년 후기 — 장단점 솔직히",
      body: "관리·주차·층간소음·단지 내 편의시설을 기준으로 장단점을 정리해 봤습니다. 보완할 점도 의견 주세요.",
      tags: "단지, 입주후기",
    },
  ],
  trade: [
    {
      title: "갭투자 vs 실거주 매매, 같은 동네에서 고민 중",
      body: "전세 끼고 매수 vs 전세 살다가 매매 전환 중 어떤 케이스가 더 현실적인지 경험 공유 부탁드립니다.",
      tags: "갭투자, 매매",
    },
  ],
  info: [
    {
      title: "이번 주 지역 부동산 뉴스, 같이 정리해요",
      body: "재건축·분양·금리 관련해서 궁금한 기사나 공공데이터 링크를 모아 댓글로 보태 주세요.",
      tags: "뉴스, 정보",
    },
  ],
};

export function questionTemplatesForSub(subId: string): Template[] {
  return BY_SUB[subId] ?? DEFAULT_TEMPLATES;
}
