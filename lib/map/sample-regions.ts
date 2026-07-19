export type SampleRegion = {
  id: string;
  label: string;
  city: string;
  district: string;
  dong?: string;
  lat: number;
  lng: number;
  /** 0~100 관심도 (마커 색상용) */
  interest: number;
  views: number;
};

/**
 * 지도 목업에 사용할 샘플 지역. 실제 연동 전에 수동으로 관리.
 * 좌표는 서울 시청 기준 대략적인 오프셋입니다.
 */
export const SAMPLE_REGIONS: SampleRegion[] = [
  {
    id: "seoul-gangnam-daechi",
    label: "강남구 대치동",
    city: "서울특별시",
    district: "강남구",
    dong: "대치동",
    lat: 37.5012,
    lng: 127.0548,
    interest: 92,
    views: 18_420,
  },
  {
    id: "seoul-mapo-hapjeong",
    label: "마포구 합정동",
    city: "서울특별시",
    district: "마포구",
    dong: "합정동",
    lat: 37.5498,
    lng: 126.9144,
    interest: 71,
    views: 9_830,
  },
  {
    id: "seoul-seongdong-seongsu",
    label: "성동구 성수동",
    city: "서울특별시",
    district: "성동구",
    dong: "성수동",
    lat: 37.5446,
    lng: 127.0559,
    interest: 85,
    views: 14_210,
  },
  {
    id: "seoul-dobong-changdong",
    label: "도봉구 창동",
    city: "서울특별시",
    district: "도봉구",
    dong: "창동",
    lat: 37.6533,
    lng: 127.0475,
    interest: 42,
    views: 3_120,
  },
  {
    id: "gyeonggi-bundang-sunae",
    label: "분당구 수내동",
    city: "경기도 성남시",
    district: "분당구",
    dong: "수내동",
    lat: 37.3803,
    lng: 127.1154,
    interest: 68,
    views: 7_940,
  },
  {
    id: "incheon-songdo",
    label: "연수구 송도동",
    city: "인천광역시",
    district: "연수구",
    dong: "송도동",
    lat: 37.3821,
    lng: 126.6571,
    interest: 55,
    views: 5_280,
  },
  {
    id: "busan-haeundae",
    label: "해운대구 우동",
    city: "부산광역시",
    district: "해운대구",
    dong: "우동",
    lat: 35.1631,
    lng: 129.163,
    interest: 63,
    views: 6_710,
  },
];

export function interestColor(interest: number): string {
  if (interest >= 80) return "bg-rose-500";
  if (interest >= 60) return "bg-amber-500";
  if (interest >= 40) return "bg-emerald-500";
  return "bg-sky-500";
}

/** HTML 마커 핀 색 (네이버 지도 Marker icon) */
export function interestPinColor(interest: number): string {
  if (interest >= 80) return "#f43f5e";
  if (interest >= 60) return "#f59e0b";
  if (interest >= 40) return "#10b981";
  return "#0ea5e9";
}
