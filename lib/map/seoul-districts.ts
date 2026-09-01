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

/* ── [945 · 실사용50 #4] 5대 광역시 시군구 — 전국 확장 1차 ──
   좌표는 구 중심 근사(기존 카탈로그와 같은 규약). 이름이 서울·타 시도와 겹치는
   구(중·서·동·남·북·강서)는 "부산 중구"처럼 시도를 이름에 접두해 정규화 키
   충돌을 막는다(인천 중구 선례). REB 월간·주간 집계가 다음 수집부터 이
   지역들에 자동 적재된다(matchRegionFromClsFullNm 경유). */
export const METRO_CITY_DISTRICTS: SeoulDistrictInfo[] = [
  // ── 부산 (16) ──
  { id: "busan-jung", name: "부산 중구", lat: 35.1063, lng: 129.0323, city: "부산" },
  { id: "busan-seo", name: "부산 서구", lat: 35.0979, lng: 129.0243, city: "부산" },
  { id: "busan-dong", name: "부산 동구", lat: 35.1292, lng: 129.0453, city: "부산" },
  { id: "busan-yeongdo", name: "영도구", lat: 35.0911, lng: 129.0679, city: "부산" },
  { id: "busan-jin", name: "부산진구", lat: 35.1631, lng: 129.0533, city: "부산" },
  { id: "busan-dongnae", name: "동래구", lat: 35.2048, lng: 129.0839, city: "부산" },
  { id: "busan-nam", name: "부산 남구", lat: 35.1366, lng: 129.0843, city: "부산" },
  { id: "busan-buk", name: "부산 북구", lat: 35.1972, lng: 128.9903, city: "부산" },
  { id: "busan-haeundae", name: "해운대구", lat: 35.1631, lng: 129.1636, city: "부산" },
  { id: "busan-saha", name: "사하구", lat: 35.1046, lng: 128.9749, city: "부산" },
  { id: "busan-geumjeong", name: "금정구", lat: 35.2429, lng: 129.0922, city: "부산" },
  { id: "busan-gangseo", name: "부산 강서구", lat: 35.2122, lng: 128.9806, city: "부산" },
  { id: "busan-yeonje", name: "연제구", lat: 35.1762, lng: 129.0798, city: "부산" },
  { id: "busan-suyeong", name: "수영구", lat: 35.1456, lng: 129.1131, city: "부산" },
  { id: "busan-sasang", name: "사상구", lat: 35.1526, lng: 128.9911, city: "부산" },
  { id: "busan-gijang", name: "기장군", lat: 35.2445, lng: 129.2224, city: "부산" },
  // ── 대구 (8) ──
  { id: "daegu-jung", name: "대구 중구", lat: 35.8694, lng: 128.6062, city: "대구" },
  { id: "daegu-dong", name: "대구 동구", lat: 35.8867, lng: 128.6357, city: "대구" },
  { id: "daegu-seo", name: "대구 서구", lat: 35.8718, lng: 128.5591, city: "대구" },
  { id: "daegu-nam", name: "대구 남구", lat: 35.8460, lng: 128.5977, city: "대구" },
  { id: "daegu-buk", name: "대구 북구", lat: 35.8858, lng: 128.5829, city: "대구" },
  { id: "daegu-suseong", name: "수성구", lat: 35.8582, lng: 128.6309, city: "대구" },
  { id: "daegu-dalseo", name: "달서구", lat: 35.8299, lng: 128.5326, city: "대구" },
  { id: "daegu-dalseong", name: "달성군", lat: 35.7745, lng: 128.4313, city: "대구" },
  // ── 대전 (5) ──
  { id: "daejeon-dong", name: "대전 동구", lat: 36.3120, lng: 127.4548, city: "대전" },
  { id: "daejeon-jung", name: "대전 중구", lat: 36.3255, lng: 127.4213, city: "대전" },
  { id: "daejeon-seo", name: "대전 서구", lat: 36.3555, lng: 127.3838, city: "대전" },
  { id: "daejeon-yuseong", name: "유성구", lat: 36.3624, lng: 127.3565, city: "대전" },
  { id: "daejeon-daedeok", name: "대덕구", lat: 36.3466, lng: 127.4155, city: "대전" },
  // ── 광주 (5) ──
  { id: "gwangju-dong", name: "광주 동구", lat: 35.1460, lng: 126.9230, city: "광주" },
  { id: "gwangju-seo", name: "광주 서구", lat: 35.1520, lng: 126.8895, city: "광주" },
  { id: "gwangju-nam", name: "광주 남구", lat: 35.1328, lng: 126.9026, city: "광주" },
  { id: "gwangju-buk", name: "광주 북구", lat: 35.1741, lng: 126.9120, city: "광주" },
  { id: "gwangju-gwangsan", name: "광산구", lat: 35.1394, lng: 126.7936, city: "광주" },
  // ── 울산 (5) ──
  { id: "ulsan-jung", name: "울산 중구", lat: 35.5694, lng: 129.3328, city: "울산" },
  { id: "ulsan-nam", name: "울산 남구", lat: 35.5437, lng: 129.3301, city: "울산" },
  { id: "ulsan-dong", name: "울산 동구", lat: 35.5052, lng: 129.4166, city: "울산" },
  { id: "ulsan-buk", name: "울산 북구", lat: 35.5827, lng: 129.3613, city: "울산" },
  { id: "ulsan-ulju", name: "울주군", lat: 35.5622, lng: 129.1243, city: "울산" },
];
