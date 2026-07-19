/**
 * 지도 decision workspace — 3축 데이터 카탈로그
 */

export type WorkspaceAxisId = "public_metrics" | "nearby_behavior" | "conversion";

export type DataSourceCategory =
  | "transaction_sale"
  | "transaction_rent"
  | "redevelopment"
  | "population"
  | "traffic"
  | "school"
  | "safety"
  | "sex_offense_stats"
  | "broker"
  | "lawyer"
  | "judicial_scrivener"
  | "tax_accountant"
  | "poi";

export type DataSourceRegistryEntry = {
  id: string;
  category: DataSourceCategory;
  label: string;
  authority: string;
  channel: "data_go_kr" | "seoul_openapi" | "kakao_map" | "official_directory" | "vworld";
  envKey?: string;
  usage: string;
  notes?: string;
  verificationUrl?: string;
  axis: WorkspaceAxisId;
};

export const WORKSPACE_AXES: Record<
  WorkspaceAxisId,
  { label: string; description: string }
> = {
  public_metrics: {
    label: "공공 지표",
    description: "실거래·인구·교통·안전·학군·정비사업",
  },
  nearby_behavior: {
    label: "주변·전문가",
    description: "카카오 POI · 공식 디렉터리 검증 전문가",
  },
  conversion: {
    label: "전환",
    description: "파트너 매물 · 상담 요청",
  },
};

export const DATA_SOURCE_REGISTRY: DataSourceRegistryEntry[] = [
  {
    id: "molit-apt-sale",
    category: "transaction_sale",
    label: "아파트 매매 실거래",
    authority: "국토교통부",
    channel: "data_go_kr",
    envKey: "MOLIT_SERVICE_KEY",
    usage: "단지 상세·시계열·평형 비교",
    notes: "법정동 코드·계약년월",
    axis: "public_metrics",
  },
  {
    id: "molit-apt-rent",
    category: "transaction_rent",
    label: "아파트 전월세 실거래",
    authority: "국토교통부",
    channel: "data_go_kr",
    envKey: "MOLIT_SERVICE_KEY",
    usage: "전세가율·월세 전환",
    axis: "public_metrics",
  },
  {
    id: "seoul-redevelopment",
    category: "redevelopment",
    label: "정비사업",
    authority: "서울시 / SH",
    channel: "seoul_openapi",
    envKey: "SEOUL_DATA_API_KEY",
    usage: "정비 단계 배지·지도 레이어",
    notes: "서울 우선",
    axis: "public_metrics",
  },
  {
    id: "moi-population",
    category: "population",
    label: "주민등록 인구",
    authority: "행정안전부",
    channel: "data_go_kr",
    usage: "동네 스냅샷·생활권 변화",
    axis: "public_metrics",
  },
  {
    id: "mot-traffic",
    category: "traffic",
    label: "교통·혼잡",
    authority: "국토부 / 서울교통공사",
    channel: "data_go_kr",
    envKey: "EX_DATA_API_KEY",
    usage: "출퇴근 혼잡·교통 점수",
    axis: "public_metrics",
  },
  {
    id: "school-info",
    category: "school",
    label: "학교·학군",
    authority: "교육청 / 학교알리미",
    channel: "data_go_kr",
    envKey: "SCHOOLINFO_API_KEY",
    usage: "학교 수·거리·학군 메모",
    axis: "public_metrics",
  },
  {
    id: "safety-map",
    category: "safety",
    label: "치안·교통사고·CCTV",
    authority: "생활안전지도",
    channel: "data_go_kr",
    usage: "생활 안전 레이어",
    notes: "집계·시각화 권장",
    axis: "public_metrics",
  },
  {
    id: "sex-offense-stats",
    category: "sex_offense_stats",
    label: "성범죄 지역 통계",
    authority: "경찰청 / 생활안전지도",
    channel: "data_go_kr",
    usage: "구·동 단위 안전 지표",
    notes: "개인 신상 직접 표시 금지",
    axis: "public_metrics",
  },
  {
    id: "kar-broker",
    category: "broker",
    label: "공인중개사",
    authority: "한국공인중개사협회 / V-World",
    channel: "official_directory",
    verificationUrl: "https://www.kar.or.kr",
    usage: "자격·등록 상태 검증",
    axis: "nearby_behavior",
  },
  {
    id: "korean-bar",
    category: "lawyer",
    label: "변호사",
    authority: "대한변협",
    channel: "official_directory",
    verificationUrl: "https://www.koreanbar.or.kr",
    usage: "전문분야·상담 연결",
    axis: "nearby_behavior",
  },
  {
    id: "kscj-scrivener",
    category: "judicial_scrivener",
    label: "법무사",
    authority: "대한법무사협회",
    channel: "official_directory",
    verificationUrl: "https://www.kscj.or.kr",
    usage: "등기·계약 검토",
    axis: "nearby_behavior",
  },
  {
    id: "kacpta-tax",
    category: "tax_accountant",
    label: "세무사",
    authority: "한국세무사회",
    channel: "official_directory",
    verificationUrl: "https://www.kacpta.or.kr",
    usage: "취득세·양도세·절세 상담",
    axis: "nearby_behavior",
  },
  {
    id: "kakao-poi",
    category: "poi",
    label: "주변 POI",
    authority: "Kakao Local API",
    channel: "kakao_map",
    envKey: "KAKAO_REST_API_KEY",
    usage: "keywordSearch · categorySearch · coord2Address",
    axis: "nearby_behavior",
  },
  {
    id: "partner-listings",
    category: "broker",
    label: "파트너 매물",
    authority: "nuguzip partner",
    channel: "official_directory",
    usage: "매물·상담 전환",
    axis: "conversion",
  },
];

export function sourcesForAxis(axis: WorkspaceAxisId): DataSourceRegistryEntry[] {
  return DATA_SOURCE_REGISTRY.filter((s) => s.axis === axis);
}
