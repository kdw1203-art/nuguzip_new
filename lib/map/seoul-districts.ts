/** 서울 주요 구 좌표·목업 시세 (지도/API 공용 — 서버 import 가능) */
export interface SeoulDistrictInfo {
  id: string;
  name: string;
  lat: number;
  lng: number;
  avgPricePerM2?: number;
  momPct?: number;
  tradeCount30d?: number;
  /** 시/도 표기 (미지정 시 서울로 간주) */
  city?: string;
}

/** @deprecated RegionMarker 호환 alias */
export type RegionInfo = SeoulDistrictInfo;

export const SEOUL_DISTRICTS: SeoulDistrictInfo[] = [
  { id: "gangnam", name: "강남구", lat: 37.5172, lng: 127.0473, avgPricePerM2: 25_000_000, momPct: 0.8, tradeCount30d: 143 },
  { id: "gangdong", name: "강동구", lat: 37.5301, lng: 127.1238, avgPricePerM2: 14_000_000, momPct: 0.2, tradeCount30d: 88 },
  { id: "gangbuk", name: "강북구", lat: 37.6396, lng: 127.0257, avgPricePerM2: 7_500_000, momPct: -0.3, tradeCount30d: 42 },
  { id: "gangseo", name: "강서구", lat: 37.5509, lng: 126.8495, avgPricePerM2: 9_500_000, momPct: 0.1, tradeCount30d: 95 },
  { id: "gwanak", name: "관악구", lat: 37.4784, lng: 126.9516, avgPricePerM2: 8_500_000, momPct: -0.1, tradeCount30d: 67 },
  { id: "gwangjin", name: "광진구", lat: 37.5385, lng: 127.0823, avgPricePerM2: 13_500_000, momPct: 0.4, tradeCount30d: 71 },
  { id: "guro", name: "구로구", lat: 37.4955, lng: 126.8874, avgPricePerM2: 10_500_000, momPct: 0.0, tradeCount30d: 82 },
  { id: "geumcheon", name: "금천구", lat: 37.4519, lng: 126.902, avgPricePerM2: 8_000_000, momPct: -0.2, tradeCount30d: 48 },
  { id: "nowon", name: "노원구", lat: 37.6542, lng: 127.0568, avgPricePerM2: 8_000_000, momPct: -0.5, tradeCount30d: 89 },
  { id: "dobong", name: "도봉구", lat: 37.6688, lng: 127.0471, avgPricePerM2: 6_500_000, momPct: -0.7, tradeCount30d: 61 },
  { id: "dongdaemun", name: "동대문구", lat: 37.5744, lng: 127.0396, avgPricePerM2: 11_500_000, momPct: 0.3, tradeCount30d: 64 },
  { id: "dongjak", name: "동작구", lat: 37.5124, lng: 126.9393, avgPricePerM2: 12_000_000, momPct: 0.2, tradeCount30d: 58 },
  { id: "mapo", name: "마포구", lat: 37.5638, lng: 126.9085, avgPricePerM2: 15_000_000, momPct: -0.2, tradeCount30d: 76 },
  { id: "seodaemun", name: "서대문구", lat: 37.5791, lng: 126.9368, avgPricePerM2: 10_000_000, momPct: 0.1, tradeCount30d: 53 },
  { id: "seocho", name: "서초구", lat: 37.4836, lng: 127.0327, avgPricePerM2: 24_000_000, momPct: 0.4, tradeCount30d: 98 },
  { id: "seongdong", name: "성동구", lat: 37.5634, lng: 127.0369, avgPricePerM2: 16_000_000, momPct: 0.6, tradeCount30d: 73 },
  { id: "seongbuk", name: "성북구", lat: 37.5894, lng: 127.0167, avgPricePerM2: 11_000_000, momPct: 0.0, tradeCount30d: 56 },
  { id: "songpa", name: "송파구", lat: 37.5145, lng: 127.1059, avgPricePerM2: 18_000_000, momPct: 0.3, tradeCount30d: 124 },
  { id: "yangcheon", name: "양천구", lat: 37.517, lng: 126.8664, avgPricePerM2: 12_500_000, momPct: 0.1, tradeCount30d: 69 },
  { id: "yeongdeungpo", name: "영등포구", lat: 37.5264, lng: 126.8962, avgPricePerM2: 14_500_000, momPct: 0.5, tradeCount30d: 91 },
  { id: "yongsan", name: "용산구", lat: 37.5324, lng: 126.9903, avgPricePerM2: 20_000_000, momPct: 1.1, tradeCount30d: 52 },
  { id: "eunpyeong", name: "은평구", lat: 37.6026, lng: 126.9291, avgPricePerM2: 9_000_000, momPct: 0.1, tradeCount30d: 55 },
  { id: "jongno", name: "종로구", lat: 37.5735, lng: 126.979, avgPricePerM2: 17_000_000, momPct: 0.2, tradeCount30d: 38 },
  { id: "jung", name: "중구", lat: 37.5641, lng: 126.9979, avgPricePerM2: 16_500_000, momPct: 0.3, tradeCount30d: 45 },
  { id: "jungnang", name: "중랑구", lat: 37.6066, lng: 127.0927, avgPricePerM2: 8_800_000, momPct: -0.1, tradeCount30d: 59 },
];

/** 서울 외 주요 권역 (지역 탐색용) — 수도권(경기·인천) 위주 */
export const METRO_EXPLORE_DISTRICTS: SeoulDistrictInfo[] = [
  // ── 경기 ──
  { id: "seongnam-bundang", name: "성남시 분당구", lat: 37.3825, lng: 127.1235, avgPricePerM2: 14_500_000, momPct: 0.6, tradeCount30d: 67, city: "경기" },
  { id: "seongnam-sujeong", name: "성남시 수정구", lat: 37.4500, lng: 127.1450, avgPricePerM2: 10_000_000, momPct: 0.3, tradeCount30d: 41, city: "경기" },
  { id: "seongnam-jungwon", name: "성남시 중원구", lat: 37.4300, lng: 127.1370, avgPricePerM2: 9_200_000, momPct: 0.1, tradeCount30d: 38, city: "경기" },
  { id: "suwon-yeongtong", name: "수원시 영통구", lat: 37.2595, lng: 127.0467, avgPricePerM2: 9_800_000, momPct: 0.7, tradeCount30d: 72, city: "경기" },
  { id: "suwon-jangan", name: "수원시 장안구", lat: 37.3010, lng: 127.0107, avgPricePerM2: 7_400_000, momPct: 0.0, tradeCount30d: 49, city: "경기" },
  { id: "suwon-paldal", name: "수원시 팔달구", lat: 37.2790, lng: 127.0145, avgPricePerM2: 8_000_000, momPct: 0.2, tradeCount30d: 44, city: "경기" },
  { id: "suwon-gwonseon", name: "수원시 권선구", lat: 37.2580, lng: 126.9720, avgPricePerM2: 7_600_000, momPct: -0.1, tradeCount30d: 51, city: "경기" },
  { id: "yongin-suji", name: "용인시 수지구", lat: 37.3220, lng: 127.0978, avgPricePerM2: 10_200_000, momPct: 0.5, tradeCount30d: 63, city: "경기" },
  { id: "yongin-giheung", name: "용인시 기흥구", lat: 37.2800, lng: 127.1150, avgPricePerM2: 8_600_000, momPct: 0.3, tradeCount30d: 58, city: "경기" },
  { id: "yongin-cheoin", name: "용인시 처인구", lat: 37.2340, lng: 127.2010, avgPricePerM2: 5_600_000, momPct: -0.2, tradeCount30d: 34, city: "경기" },
  { id: "goyang-ilsandong", name: "고양시 일산동구", lat: 37.6580, lng: 126.7770, avgPricePerM2: 8_200_000, momPct: -0.3, tradeCount30d: 47, city: "경기" },
  { id: "goyang-ilsanseo", name: "고양시 일산서구", lat: 37.6760, lng: 126.7500, avgPricePerM2: 7_900_000, momPct: -0.4, tradeCount30d: 43, city: "경기" },
  { id: "goyang-deogyang", name: "고양시 덕양구", lat: 37.6370, lng: 126.8320, avgPricePerM2: 7_500_000, momPct: 0.1, tradeCount30d: 52, city: "경기" },
  { id: "anyang-dongan", name: "안양시 동안구", lat: 37.3920, lng: 126.9540, avgPricePerM2: 11_000_000, momPct: 0.6, tradeCount30d: 56, city: "경기" },
  { id: "anyang-manan", name: "안양시 만안구", lat: 37.3870, lng: 126.9320, avgPricePerM2: 8_400_000, momPct: 0.2, tradeCount30d: 39, city: "경기" },
  { id: "bucheon", name: "부천시", lat: 37.5035, lng: 126.7660, avgPricePerM2: 8_500_000, momPct: 0.0, tradeCount30d: 88, city: "경기" },
  { id: "gwangmyeong", name: "광명시", lat: 37.4790, lng: 126.8645, avgPricePerM2: 11_500_000, momPct: 0.8, tradeCount30d: 61, city: "경기" },
  { id: "hanam", name: "하남시", lat: 37.5390, lng: 127.2140, avgPricePerM2: 12_000_000, momPct: 1.0, tradeCount30d: 57, city: "경기" },
  { id: "namyangju", name: "남양주시", lat: 37.6360, lng: 127.2160, avgPricePerM2: 7_100_000, momPct: 0.3, tradeCount30d: 64, city: "경기" },
  { id: "gimpo", name: "김포시", lat: 37.6150, lng: 126.7160, avgPricePerM2: 7_000_000, momPct: 0.2, tradeCount30d: 59, city: "경기" },
  { id: "uijeongbu", name: "의정부시", lat: 37.7380, lng: 127.0340, avgPricePerM2: 6_600_000, momPct: -0.1, tradeCount30d: 48, city: "경기" },
  { id: "ansan-danwon", name: "안산시 단원구", lat: 37.3210, lng: 126.8310, avgPricePerM2: 6_500_000, momPct: -0.2, tradeCount30d: 42, city: "경기" },
  { id: "ansan-sangnok", name: "안산시 상록구", lat: 37.2960, lng: 126.8480, avgPricePerM2: 6_800_000, momPct: 0.0, tradeCount30d: 45, city: "경기" },
  { id: "hwaseong-dongtan", name: "화성시 동탄", lat: 37.2000, lng: 127.0750, avgPricePerM2: 9_000_000, momPct: 0.9, tradeCount30d: 76, city: "경기" },
  { id: "gwacheon", name: "과천시", lat: 37.4290, lng: 126.9877, avgPricePerM2: 18_000_000, momPct: 0.7, tradeCount30d: 24, city: "경기" },
  { id: "uiwang", name: "의왕시", lat: 37.3446, lng: 126.9683, avgPricePerM2: 9_000_000, momPct: 0.4, tradeCount30d: 31, city: "경기" },
  { id: "gunpo", name: "군포시", lat: 37.3617, lng: 126.9352, avgPricePerM2: 8_500_000, momPct: 0.1, tradeCount30d: 36, city: "경기" },
  { id: "guri", name: "구리시", lat: 37.5944, lng: 127.1296, avgPricePerM2: 8_700_000, momPct: 0.2, tradeCount30d: 33, city: "경기" },
  { id: "siheung", name: "시흥시", lat: 37.3800, lng: 126.8030, avgPricePerM2: 6_700_000, momPct: 0.3, tradeCount30d: 54, city: "경기" },
  { id: "pyeongtaek", name: "평택시", lat: 36.9920, lng: 127.1127, avgPricePerM2: 5_500_000, momPct: 0.5, tradeCount30d: 69, city: "경기" },
  // ── 인천 ──
  { id: "incheon-yeonsu", name: "연수구", lat: 37.4106, lng: 126.6788, avgPricePerM2: 9_800_000, momPct: 0.2, tradeCount30d: 54, city: "인천" },
  { id: "incheon-namdong", name: "남동구", lat: 37.4470, lng: 126.7310, avgPricePerM2: 7_000_000, momPct: 0.1, tradeCount30d: 62, city: "인천" },
  { id: "incheon-bupyeong", name: "부평구", lat: 37.5070, lng: 126.7220, avgPricePerM2: 7_500_000, momPct: 0.0, tradeCount30d: 58, city: "인천" },
  { id: "incheon-seo", name: "서구", lat: 37.5450, lng: 126.6760, avgPricePerM2: 7_800_000, momPct: 0.6, tradeCount30d: 71, city: "인천" },
  { id: "incheon-michuhol", name: "미추홀구", lat: 37.4636, lng: 126.6505, avgPricePerM2: 6_500_000, momPct: 0.1, tradeCount30d: 47, city: "인천" },
  { id: "incheon-gyeyang", name: "계양구", lat: 37.5370, lng: 126.7380, avgPricePerM2: 6_400_000, momPct: -0.1, tradeCount30d: 38, city: "인천" },
  { id: "incheon-jung", name: "인천 중구", lat: 37.4740, lng: 126.6210, avgPricePerM2: 6_200_000, momPct: 0.4, tradeCount30d: 41, city: "인천" },
];
