/**
 * 수도권 시군구 좌표 카탈로그 (지도/API 공용 — 서버 import 가능)
 *
 * 사실 우선: 이 파일에 있던 `avgPricePerM2` / `momPct` / `tradeCount30d` 하드코딩
 * 값 62건을 전부 삭제했다. 근거 없는 숫자였을 뿐 아니라, 이미 DB 에 들어와 있는
 * 한국부동산원(REB) 실집계와 대조하니 실제로 크게 틀렸다 —
 *   강남구 25.0M vs 실제 30.4M / 도봉구 6.5M vs 8.4M / 과천시 18.0M vs 25.6M,
 *   남양주시 7.1M vs 3.7M (약 2배), 남양주 momPct +0.3 vs 실제 -2.92 (부호까지 반대).
 * 하드코딩된 62개 지역 중 61개는 `market_region_price` 에 동일한 region_id 로
 * 실데이터(per_m2_sale / sale_change / trade_count)가 이미 적재돼 있다. 유일한
 * 예외는 `hwaseong-dongtan` — 동탄은 신도시라 REB 가 시군구로 집계하지 않는다.
 *
 * 따라서 이 파일이 단언하는 사실은 좌표와 이름뿐이다: id / name / lat / lng / city.
 * 시세·변동률·거래량은 `lib/map/region-market.ts`(loadRegionMarketMarkers) 또는
 * `lib/market/store.ts`(getAllRegionSnapshots / getRegionSnapshot)로 실데이터를
 * 조인해서 얻는다. 없으면 "모름"으로 두고, 절대 기본값으로 채우지 않는다.
 */
export interface SeoulDistrictInfo {
  id: string;
  name: string;
  lat: number;
  lng: number;
  /** ㎡당 매매가(원). 정적 값 없음 — 실데이터 조인 시에만 채워진다. */
  avgPricePerM2?: number;
  /** 전월 대비 변동률(%). 정적 값 없음 — 실데이터 조인 시에만 채워진다. */
  momPct?: number;
  /** 최근 거래 건수. 정적 값 없음 — 실데이터 조인 시에만 채워진다. */
  tradeCount30d?: number;
  /** 시/도 표기 (미지정 시 서울로 간주) */
  city?: string;
}

/** @deprecated RegionMarker 호환 alias */
export type RegionInfo = SeoulDistrictInfo;

export const SEOUL_DISTRICTS: SeoulDistrictInfo[] = [
  { id: "gangnam", name: "강남구", lat: 37.5172, lng: 127.0473 },
  { id: "gangdong", name: "강동구", lat: 37.5301, lng: 127.1238 },
  { id: "gangbuk", name: "강북구", lat: 37.6396, lng: 127.0257 },
  { id: "gangseo", name: "강서구", lat: 37.5509, lng: 126.8495 },
  { id: "gwanak", name: "관악구", lat: 37.4784, lng: 126.9516 },
  { id: "gwangjin", name: "광진구", lat: 37.5385, lng: 127.0823 },
  { id: "guro", name: "구로구", lat: 37.4955, lng: 126.8874 },
  { id: "geumcheon", name: "금천구", lat: 37.4519, lng: 126.902 },
  { id: "nowon", name: "노원구", lat: 37.6542, lng: 127.0568 },
  { id: "dobong", name: "도봉구", lat: 37.6688, lng: 127.0471 },
  { id: "dongdaemun", name: "동대문구", lat: 37.5744, lng: 127.0396 },
  { id: "dongjak", name: "동작구", lat: 37.5124, lng: 126.9393 },
  { id: "mapo", name: "마포구", lat: 37.5638, lng: 126.9085 },
  { id: "seodaemun", name: "서대문구", lat: 37.5791, lng: 126.9368 },
  { id: "seocho", name: "서초구", lat: 37.4836, lng: 127.0327 },
  { id: "seongdong", name: "성동구", lat: 37.5634, lng: 127.0369 },
  { id: "seongbuk", name: "성북구", lat: 37.5894, lng: 127.0167 },
  { id: "songpa", name: "송파구", lat: 37.5145, lng: 127.1059 },
  { id: "yangcheon", name: "양천구", lat: 37.517, lng: 126.8664 },
  { id: "yeongdeungpo", name: "영등포구", lat: 37.5264, lng: 126.8962 },
  { id: "yongsan", name: "용산구", lat: 37.5324, lng: 126.9903 },
  { id: "eunpyeong", name: "은평구", lat: 37.6026, lng: 126.9291 },
  { id: "jongno", name: "종로구", lat: 37.5735, lng: 126.979 },
  { id: "jung", name: "중구", lat: 37.5641, lng: 126.9979 },
  { id: "jungnang", name: "중랑구", lat: 37.6066, lng: 127.0927 },
];

/** 서울 외 주요 권역 (지역 탐색용) — 수도권(경기·인천) 위주 */
export const METRO_EXPLORE_DISTRICTS: SeoulDistrictInfo[] = [
  // ── 경기 ──
  { id: "seongnam-bundang", name: "성남시 분당구", lat: 37.3825, lng: 127.1235, city: "경기" },
  { id: "seongnam-sujeong", name: "성남시 수정구", lat: 37.45, lng: 127.145, city: "경기" },
  { id: "seongnam-jungwon", name: "성남시 중원구", lat: 37.43, lng: 127.137, city: "경기" },
  { id: "suwon-yeongtong", name: "수원시 영통구", lat: 37.2595, lng: 127.0467, city: "경기" },
  { id: "suwon-jangan", name: "수원시 장안구", lat: 37.301, lng: 127.0107, city: "경기" },
  { id: "suwon-paldal", name: "수원시 팔달구", lat: 37.279, lng: 127.0145, city: "경기" },
  { id: "suwon-gwonseon", name: "수원시 권선구", lat: 37.258, lng: 126.972, city: "경기" },
  { id: "yongin-suji", name: "용인시 수지구", lat: 37.322, lng: 127.0978, city: "경기" },
  { id: "yongin-giheung", name: "용인시 기흥구", lat: 37.28, lng: 127.115, city: "경기" },
  { id: "yongin-cheoin", name: "용인시 처인구", lat: 37.234, lng: 127.201, city: "경기" },
  { id: "goyang-ilsandong", name: "고양시 일산동구", lat: 37.658, lng: 126.777, city: "경기" },
  { id: "goyang-ilsanseo", name: "고양시 일산서구", lat: 37.676, lng: 126.75, city: "경기" },
  { id: "goyang-deogyang", name: "고양시 덕양구", lat: 37.637, lng: 126.832, city: "경기" },
  { id: "anyang-dongan", name: "안양시 동안구", lat: 37.392, lng: 126.954, city: "경기" },
  { id: "anyang-manan", name: "안양시 만안구", lat: 37.387, lng: 126.932, city: "경기" },
  { id: "bucheon", name: "부천시", lat: 37.5035, lng: 126.766, city: "경기" },
  { id: "gwangmyeong", name: "광명시", lat: 37.479, lng: 126.8645, city: "경기" },
  { id: "hanam", name: "하남시", lat: 37.539, lng: 127.214, city: "경기" },
  { id: "namyangju", name: "남양주시", lat: 37.636, lng: 127.216, city: "경기" },
  { id: "gimpo", name: "김포시", lat: 37.615, lng: 126.716, city: "경기" },
  { id: "uijeongbu", name: "의정부시", lat: 37.738, lng: 127.034, city: "경기" },
  { id: "ansan-danwon", name: "안산시 단원구", lat: 37.321, lng: 126.831, city: "경기" },
  { id: "ansan-sangnok", name: "안산시 상록구", lat: 37.296, lng: 126.848, city: "경기" },
  // 동탄은 신도시(행정 시군구 아님) — REB 집계 대상이 아니라 시세 조인이 되지 않는다.
  { id: "hwaseong-dongtan", name: "화성시 동탄", lat: 37.2, lng: 127.075, city: "경기" },
  { id: "gwacheon", name: "과천시", lat: 37.429, lng: 126.9877, city: "경기" },
  { id: "uiwang", name: "의왕시", lat: 37.3446, lng: 126.9683, city: "경기" },
  { id: "gunpo", name: "군포시", lat: 37.3617, lng: 126.9352, city: "경기" },
  { id: "guri", name: "구리시", lat: 37.5944, lng: 127.1296, city: "경기" },
  { id: "siheung", name: "시흥시", lat: 37.38, lng: 126.803, city: "경기" },
  { id: "pyeongtaek", name: "평택시", lat: 36.992, lng: 127.1127, city: "경기" },
  // ── 인천 ──
  { id: "incheon-yeonsu", name: "연수구", lat: 37.4106, lng: 126.6788, city: "인천" },
  { id: "incheon-namdong", name: "남동구", lat: 37.447, lng: 126.731, city: "인천" },
  { id: "incheon-bupyeong", name: "부평구", lat: 37.507, lng: 126.722, city: "인천" },
  { id: "incheon-seo", name: "서구", lat: 37.545, lng: 126.676, city: "인천" },
  { id: "incheon-michuhol", name: "미추홀구", lat: 37.4636, lng: 126.6505, city: "인천" },
  { id: "incheon-gyeyang", name: "계양구", lat: 37.537, lng: 126.738, city: "인천" },
  { id: "incheon-jung", name: "인천 중구", lat: 37.474, lng: 126.621, city: "인천" },
];
