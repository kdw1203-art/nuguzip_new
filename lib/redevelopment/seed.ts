import type { RedevelopmentProject, ProjectTypeKey, StageKey } from "./types";

/**
 * 서울 주요 정비사업장 큐레이션 시드 (공개 자료 정리본).
 *
 * 출처: 정비사업 정보몽땅(cleanup.seoul.go.kr)·서울 열린데이터광장·지자체 고시·
 *       언론 공개정보를 취합해 정리. 좌표는 구역 대표점 근사값이며,
 *       진행단계·상태는 공개 자료 기준 참고값으로 최신 고시와 다를 수 있다.
 *
 * 공공 API 자동적재(app/api/cron/redevelopment-ingest)가 채워지면 DB가 우선하며,
 * 이 시드는 DB가 비어있거나 조회 불가일 때의 폴백으로만 노출된다.
 */

const SRC = "공개 자료 정리본(정비사업 정보몽땅·지자체 고시·언론)";
const SRC_URL = "https://cleanup.seoul.go.kr";

type Seed = Omit<RedevelopmentProject, "isSample" | "source" | "sourceUrl" | "updatedAt"> & {
  typeKey: ProjectTypeKey;
  stageKey: StageKey;
};

const RAW: Seed[] = [
  // ── 재건축(아파트) ──
  { id: "seed-eunma", name: "은마아파트", typeKey: "recon_apt", stageKey: "union", sido: "서울", sigungu: "강남구", address: "강남구 대치동", lat: 37.4995, lng: 127.0602, households: 5778, summary: "대치동 대표 재건축 단지" },
  { id: "seed-jamsil5", name: "잠실주공5단지", typeKey: "recon_apt", stageKey: "plan_approved", sido: "서울", sigungu: "송파구", address: "송파구 잠실동", lat: 37.5106, lng: 127.0857, households: 3930, summary: "잠실 대표 재건축" },
  { id: "seed-apgujeong3", name: "압구정3구역", typeKey: "recon_apt", stageKey: "union", sido: "서울", sigungu: "강남구", address: "강남구 압구정동", lat: 37.5273, lng: 127.0286, households: null, summary: "압구정 현대아파트 일대" },
  { id: "seed-banpo1", name: "반포주공1단지(1·2·4주구)", typeKey: "recon_apt", stageKey: "moving", sido: "서울", sigungu: "서초구", address: "서초구 반포동", lat: 37.5045, lng: 126.996, households: 5388, summary: "반포 대표 재건축" },
  { id: "seed-yeouido-sibeom", name: "여의도 시범아파트", typeKey: "recon_apt", stageKey: "plan_approved", sido: "서울", sigungu: "영등포구", address: "영등포구 여의도동", lat: 37.5205, lng: 126.9256, households: null, summary: "여의도 신속통합기획 재건축" },
  { id: "seed-mokdong6", name: "목동신시가지(6단지)", typeKey: "recon_apt", stageKey: "designated", sido: "서울", sigungu: "양천구", address: "양천구 목동", lat: 37.534, lng: 126.875, households: null, summary: "목동 재건축 벨트" },

  // ── 재개발(뉴타운) ──
  { id: "seed-hannam3", name: "한남3구역", typeKey: "redev", stageKey: "moving", sido: "서울", sigungu: "용산구", address: "용산구 한남동", lat: 37.536, lng: 126.9995, households: 5816, summary: "한남뉴타운 최대 구역" },
  { id: "seed-hannam2", name: "한남2구역", typeKey: "redev", stageKey: "plan_approved", sido: "서울", sigungu: "용산구", address: "용산구 보광동", lat: 37.5322, lng: 126.9945, households: 1537, summary: "한남뉴타운" },
  { id: "seed-seongsu1", name: "성수전략정비1지구", typeKey: "redev", stageKey: "plan_approved", sido: "서울", sigungu: "성동구", address: "성동구 성수동1가", lat: 37.5445, lng: 127.0455, households: null, summary: "성수 한강변 전략정비" },
  { id: "seed-noryangjin1", name: "노량진1구역", typeKey: "redev", stageKey: "mgmt_approved", sido: "서울", sigungu: "동작구", address: "동작구 노량진동", lat: 37.5135, lng: 126.9425, households: 2992, summary: "노량진뉴타운 핵심" },
  { id: "seed-heukseok9", name: "흑석9구역", typeKey: "redev", stageKey: "mgmt_approved", sido: "서울", sigungu: "동작구", address: "동작구 흑석동", lat: 37.5085, lng: 126.9615, households: 1536, summary: "흑석뉴타운" },
  { id: "seed-imun1", name: "이문1구역", typeKey: "redev", stageKey: "moving", sido: "서울", sigungu: "동대문구", address: "동대문구 이문동", lat: 37.5965, lng: 127.0625, households: 2904, summary: "이문·휘경뉴타운" },
  { id: "seed-jangwi4", name: "장위4구역", typeKey: "redev", stageKey: "plan_approved", sido: "서울", sigungu: "성북구", address: "성북구 장위동", lat: 37.6155, lng: 127.0525, households: 2840, summary: "장위뉴타운" },
  { id: "seed-sanggye6", name: "상계6구역", typeKey: "redev", stageKey: "plan_approved", sido: "서울", sigungu: "노원구", address: "노원구 상계동", lat: 37.6675, lng: 127.0555, households: null, summary: "상계뉴타운" },

  // ── 신통기획(신속통합기획) ──
  { id: "seed-sindang10", name: "신당10구역", typeKey: "shintong", stageKey: "designated", sido: "서울", sigungu: "중구", address: "중구 신당동", lat: 37.5605, lng: 127.0175, households: null, summary: "신속통합기획 후보" },
  { id: "seed-mangwon", name: "망원1구역", typeKey: "shintong", stageKey: "committee", sido: "서울", sigungu: "마포구", address: "마포구 망원동", lat: 37.5555, lng: 126.9035, households: null, summary: "신속통합기획" },

  // ── 지역주택조합 ──
  { id: "seed-jihyeop-bangbae", name: "방배 지역주택조합", typeKey: "regional_union", stageKey: "committee", sido: "서울", sigungu: "서초구", address: "서초구 방배동", lat: 37.4855, lng: 126.9945, households: null, summary: "지역주택조합 추진" },

  // ── 공공재개발 ──
  { id: "seed-heukseok2", name: "흑석2구역(공공재개발)", typeKey: "public_redev", stageKey: "plan_approved", sido: "서울", sigungu: "동작구", address: "동작구 흑석동", lat: 37.5115, lng: 126.9635, households: 1324, summary: "공공재개발 선도" },
  { id: "seed-sinseol1", name: "신설1구역(공공재개발)", typeKey: "public_redev", stageKey: "designated", sido: "서울", sigungu: "동대문구", address: "동대문구 신설동", lat: 37.5765, lng: 127.0245, households: null, summary: "공공재개발" },

  // ── 도심공공복합 ──
  { id: "seed-jeungsan4", name: "증산4구역(도심공공복합)", typeKey: "dosim_public", stageKey: "designated", sido: "서울", sigungu: "은평구", address: "은평구 증산동", lat: 37.5875, lng: 126.9075, households: 4112, summary: "도심공공주택복합 지구" },

  // ── 역세권활성화 / 장기전세 ──
  { id: "seed-station-jamsil", name: "잠실역세권활성화", typeKey: "station_area", stageKey: "committee", sido: "서울", sigungu: "송파구", address: "송파구 신천동", lat: 37.5133, lng: 127.1005, households: null, summary: "역세권 활성화 사업" },

  // ── 모아타운 / 가로주택 / 소규모 ──
  { id: "seed-moa-beon", name: "번동 모아타운", typeKey: "moa", stageKey: "designated", sido: "서울", sigungu: "강북구", address: "강북구 번동", lat: 37.6335, lng: 127.0325, households: null, summary: "모아타운 관리계획" },
  { id: "seed-moa-myeonmok", name: "면목동 모아타운", typeKey: "moa", stageKey: "union", sido: "서울", sigungu: "중랑구", address: "중랑구 면목동", lat: 37.5885, lng: 127.0875, households: null, summary: "모아타운" },
  { id: "seed-garo-cheonho", name: "천호동 가로주택정비", typeKey: "garo", stageKey: "plan_approved", sido: "서울", sigungu: "강동구", address: "강동구 천호동", lat: 37.5385, lng: 127.1235, households: null, summary: "가로주택정비사업" },

  // ── 경기 ──
  { id: "seed-gm-11r", name: "광명11R구역", typeKey: "redev", stageKey: "plan_approved", sido: "경기", sigungu: "광명시", address: "광명시 광명동", lat: 37.4785, lng: 126.8645, households: 4291, summary: "광명뉴타운" },
  { id: "seed-gm-4r", name: "광명4R구역", typeKey: "redev", stageKey: "moving", sido: "경기", sigungu: "광명시", address: "광명시 광명동", lat: 37.4735, lng: 126.8585, households: 1957, summary: "광명뉴타운" },
  { id: "seed-sn-sujin1", name: "성남 수진1구역", typeKey: "redev", stageKey: "designated", sido: "경기", sigungu: "성남시 수정구", address: "성남시 수정구 수진동", lat: 37.4405, lng: 127.1475, households: null, summary: "성남 원도심 재개발" },
  { id: "seed-sn-sinheung1", name: "성남 신흥1구역", typeKey: "redev", stageKey: "designated", sido: "경기", sigungu: "성남시 수정구", address: "성남시 수정구 신흥동", lat: 37.4455, lng: 127.1455, households: null, summary: "성남 원도심 재개발" },
  { id: "seed-sw-paldal8", name: "수원 팔달8구역", typeKey: "redev", stageKey: "mgmt_approved", sido: "경기", sigungu: "수원시 팔달구", address: "수원시 팔달구 우만동", lat: 37.2775, lng: 127.0205, households: 3603, summary: "수원 재개발" },
  { id: "seed-sw-gwonseon6", name: "수원 권선6구역", typeKey: "redev", stageKey: "moving", sido: "경기", sigungu: "수원시 권선구", address: "수원시 권선구 권선동", lat: 37.2635, lng: 126.9725, households: 2178, summary: "수원 재개발" },
  { id: "seed-ay-naengcheon", name: "안양 냉천지구", typeKey: "redev", stageKey: "plan_approved", sido: "경기", sigungu: "안양시 만안구", address: "안양시 만안구 안양동", lat: 37.3985, lng: 126.9255, households: null, summary: "안양 재개발" },
  { id: "seed-bc-sosa3", name: "부천 소사본3동구역", typeKey: "redev", stageKey: "designated", sido: "경기", sigungu: "부천시 소사구", address: "부천시 소사구 소사본동", lat: 37.4835, lng: 126.7925, households: null, summary: "부천 재개발" },
  { id: "seed-gy-neunggok2", name: "고양 능곡2구역", typeKey: "redev", stageKey: "plan_approved", sido: "경기", sigungu: "고양시 덕양구", address: "고양시 덕양구 토당동", lat: 37.6355, lng: 126.8355, households: null, summary: "능곡뉴타운" },
  { id: "seed-gc-jugong", name: "과천주공(별양) 재건축", typeKey: "recon_apt", stageKey: "moving", sido: "경기", sigungu: "과천시", address: "과천시 별양동", lat: 37.4285, lng: 126.9975, households: null, summary: "과천 재건축 벨트" },
  { id: "seed-as-wongok", name: "안산 원곡 재건축", typeKey: "recon_apt", stageKey: "union", sido: "경기", sigungu: "안산시 단원구", address: "안산시 단원구 원곡동", lat: 37.3255, lng: 126.8155, households: null, summary: "안산 재건축" },

  // ── 인천 ──
  { id: "seed-ic-hakik3", name: "인천 학익3구역", typeKey: "redev", stageKey: "plan_approved", sido: "인천", sigungu: "미추홀구", address: "인천 미추홀구 학익동", lat: 37.4425, lng: 126.6575, households: null, summary: "인천 재개발" },
  { id: "seed-ic-sipjeong4", name: "인천 십정4구역", typeKey: "redev", stageKey: "designated", sido: "인천", sigungu: "부평구", address: "인천 부평구 십정동", lat: 37.4755, lng: 126.7005, households: null, summary: "인천 재개발" },
  { id: "seed-ic-songnim", name: "인천 송림초주변구역", typeKey: "redev", stageKey: "moving", sido: "인천", sigungu: "동구", address: "인천 동구 송림동", lat: 37.4785, lng: 126.6435, households: null, summary: "인천 재개발" },
  { id: "seed-ic-jakjeon", name: "인천 작전현대 재건축", typeKey: "recon_apt", stageKey: "union", sido: "인천", sigungu: "계양구", address: "인천 계양구 작전동", lat: 37.5355, lng: 126.7355, households: null, summary: "인천 재건축" },
  { id: "seed-ic-gajeong1", name: "인천 가정1구역(도심공공복합)", typeKey: "dosim_public", stageKey: "designated", sido: "인천", sigungu: "서구", address: "인천 서구 가정동", lat: 37.5245, lng: 126.6725, households: null, summary: "루원시티 인근" },
];

export const SEED_PROJECTS: RedevelopmentProject[] = RAW.map((r) => ({
  ...r,
  source: SRC,
  sourceUrl: SRC_URL,
  isSample: false, // 공개 자료 기반 실데이터(예시 아님) — 정확도는 출처 카드·면책으로 고지
  updatedAt: null,
}));

/** 시드 데이터 출처 카드용 메타. */
export const SEED_SOURCES: { kind: string; source: string; cycle: string }[] = [
  { kind: "구역·진행 정보", source: "정비사업 정보몽땅 · 각 지자체 고시", cycle: "공개 자료 취합" },
  { kind: "실거래가", source: "국토교통부 실거래가 공개시스템", cycle: "매일" },
  { kind: "건물 정보", source: "국토교통부 건축물대장", cycle: "월 1회" },
];
