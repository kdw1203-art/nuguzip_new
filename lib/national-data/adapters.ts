/**
 * 전국 공공데이터 활용계획 어댑터 — planId → 조회 함수.
 *
 * 사실 우선(이 파일의 규칙):
 * 여기서 나온 결과는 /api/public-data/national/[id] 로 그대로 응답되고,
 * lib/inspection/public-data-context.ts 를 거쳐 임장 리포트 본문과 체크리스트,
 * lib/ai/public-data-context.ts 를 거쳐 AI 분석 근거로 들어간다.
 * 즉 items 한 줄이 "현장에서 뭘 확인하라"는 문장으로 바뀐다.
 *
 * 예전에는 키가 없거나 파서가 미완성이면 그럴듯한 값을 지어내 돌려줬다 —
 * 미세먼지 pm10 38, 지하철 도착 2분, 제주 1100로 42km/h, KOSPI 2650,
 * "래미안 샘플" 건축물대장까지. 실제 구 이름·역 이름·도로명이 붙어 있어서
 * 화면에서는 실측과 구분되지 않았고, 일부는 mode:"partial"·mode:"live" 로
 * 라벨링되거나 source:"data.go.kr" 도장까지 찍혀 나갔다.
 *
 * 규칙: 모르면 지어내지 않는다. 소스 미연동이면 mode:"planned" + items:[] 로
 * "모른다"를 그대로 알린다. 실제로 받아온 값만 items 에 넣는다.
 */
import { fetchKmaShortForecast } from "@/lib/national-data/kma-api";
import { searchApplyhome } from "@/lib/applyhome/applyhome-search";
import { fetchExCongestionFrequency } from "@/lib/ex/adapters/congestion-frequency";
import {
  fetchMolitAptRent,
  fetchMolitAptTrade,
  fetchMolitDeals,
  summarizeDeals,
  type MolitDeal,
  type MolitRtmsType,
} from "@/lib/national-data/molit-api";
import {
  fetchBuildingBasisInfo,
  fetchArchPermits,
  fetchHousingPermits,
} from "@/lib/national-data/buildhub-api";
import {
  fetchAptComplexList,
  fetchAptComplexDetail,
} from "@/lib/national-data/apartment-api";
import { resolveSigunguCd } from "@/lib/national-data/region-codes";
import type { NationalPlanFetchResult, NationalPlanQuery } from "@/lib/national-data/types";
import { getNationalPlanById } from "@/lib/public-data/national-utilization-catalog";
import { listPopularityRankingMeta, loadAllPopularityRankings } from "@/lib/public-data/popularity-rankings";
import { isDataGoKrEncodingConfigured } from "@/lib/public-data/data-go-kr-keys";
import { readGeoEtlCache } from "@/lib/public-data/geo-etl";
import {
  fetchFacilitiesAggregate,
  fetchRtmsRent,
  fetchRtmsSale,
} from "@/lib/seoul/adapters";
import { fetchSeoulOpenApi, isSeoulApiConfigured } from "@/lib/seoul/openapi-client";

function base(planId: string, partial: Omit<NationalPlanFetchResult, "planId" | "fetchedAt">): NationalPlanFetchResult {
  const plan = getNationalPlanById(planId);
  return {
    planId,
    fetchedAt: new Date().toISOString(),
    appSurfaces: plan?.appSurfaces,
    portalUrl: plan?.portalUrl,
    ...partial,
  };
}

function districtOf(q: NationalPlanQuery): string {
  return q.district?.trim() || "강남구";
}

/**
 * 소스 미연동 응답. 값을 지어내는 대신 빈 목록으로 "모른다"를 알린다.
 * mode:"planned" — 샘플 데이터가 있는 게 아니라 아직 연동이 없다는 뜻이다.
 */
function unavailable(
  planId: string,
  title: string,
  summary: string,
  notice?: string,
): NationalPlanFetchResult {
  return base(planId, { title, mode: "planned", summary, items: [], notice });
}

// ── Phase 1 ────────────────────────────────────────────────────────

async function molitAptSale(q: NationalPlanQuery): Promise<NationalPlanFetchResult> {
  const district = districtOf(q);
  const molit = await fetchMolitAptTrade({ district: q.district, yyyymm: q.yyyymm });
  if (molit.mode === "live" && molit.rows.length > 0) {
    const items = molit.rows.slice(0, q.limit ?? 10).map((r) => ({
      aptName: r.aptNm,
      district: r.umdNm,
      dealAmount: r.dealAmount,
      area: r.excluUseAr,
      floor: r.floor,
      dealYear: r.dealYear,
      dealMonth: r.dealMonth,
      dealDay: r.dealDay,
    }));
    return base("molit-apt-sale", {
      title: "아파트 매매 실거래가",
      mode: "live",
      summary: `${district} 국토부 API ${items.length}건`,
      items,
    });
  }
  if (isSeoulApiConfigured()) {
    const sale = await fetchRtmsSale({ city: q.city ?? "서울", district });
    return base("molit-apt-sale", {
      title: "아파트 매매 실거래가",
      mode: "live",
      summary: `${district} 서울 Open API ${sale.rows.length}건`,
      items: sale.rows.slice(0, q.limit ?? 10),
      meta: { avgPricePerM2: sale.avgPricePerM2, months: sale.months },
      notice: isDataGoKrEncodingConfigured()
        ? undefined
        : "MOLIT_SERVICE_KEY(인코딩 키) 설정 시 전국 국토부 API로 확장됩니다.",
    });
  }
  // 사실 우선: 여기서 `avgPricePerM2: 12_500_000, count: 48` 을 "샘플 시세"로
  // 내보냈다. 실제 구 이름이 붙은 ㎡당 단가라 화면에서는 실측과 구분되지 않는다.
  // 키가 없으면 시세를 모르는 것이다 — 빈 목록으로 알린다.
  return unavailable(
    "molit-apt-sale",
    "아파트 매매 실거래가",
    `${district} 실거래 데이터 미연동`,
    "SEOUL_DATA_API_KEY 또는 MOLIT_SERVICE_KEY를 설정하세요.",
  );
}

async function molitAptRent(q: NationalPlanQuery): Promise<NationalPlanFetchResult> {
  const district = districtOf(q);
  const molit = await fetchMolitAptRent({ district: q.district, yyyymm: q.yyyymm });
  if (molit.mode === "live" && molit.rows.length > 0) {
    const items = molit.rows.slice(0, q.limit ?? 10).map((r) => ({
      aptName: r.aptNm,
      district: r.umdNm,
      deposit: r.deposit,
      monthly: r.monthlyRent,
      area: r.excluUseAr,
      floor: r.floor,
      dealYear: r.dealYear,
      dealMonth: r.dealMonth,
      dealDay: r.dealDay,
    }));
    return base("molit-apt-rent", {
      title: "아파트 전월세 실거래가",
      mode: "live",
      summary: `${district} 국토부 API 전월세 ${items.length}건`,
      items,
    });
  }
  if (isSeoulApiConfigured()) {
    const rent = await fetchRtmsRent({ city: q.city ?? "서울", district });
    return base("molit-apt-rent", {
      title: "아파트 전월세 실거래가",
      mode: "live",
      summary: `${district} 서울 Open API 전월세 ${rent.rows.length}건`,
      items: rent.rows.slice(0, q.limit ?? 10),
      meta: { avgDepositManwon: rent.avgDepositManwon, tradeCount30d: rent.tradeCount30d },
      notice: isDataGoKrEncodingConfigured()
        ? undefined
        : "MOLIT_SERVICE_KEY(인코딩 키) 설정 시 전국 국토부 API로 확장됩니다.",
    });
  }
  // 매매(molitAptSale)와 같은 기준 — 보증금 5억/월 150만원 같은 값을 지어내지 않는다.
  return unavailable(
    "molit-apt-rent",
    "아파트 전월세 실거래가",
    `${district} 전월세 실거래 데이터 미연동`,
    "SEOUL_DATA_API_KEY 또는 MOLIT_SERVICE_KEY를 설정하세요.",
  );
}

async function molitAptSaleDetail(q: NationalPlanQuery): Promise<NationalPlanFetchResult> {
  const district = districtOf(q);
  const { deals, mode } = await fetchMolitDeals("apt-sale-detail", {
    district: q.district,
    yyyymm: q.yyyymm,
    numOfRows: 50,
  });
  if (mode === "live" && deals.length > 0) {
    const sum = summarizeDeals(deals);
    const items = deals.slice(0, q.limit ?? 10).map((d) => ({
      aptName: d.name,
      district: d.umd,
      dealManwon: d.dealManwon,
      area: d.areaM2,
      floor: d.floor,
      buildYear: d.buildYear,
      dealDate: d.dealDate,
      jibun: d.raw.jibun,
      roadName: d.raw.roadNm,
    }));
    return base("molit-apt-sale-detail", {
      title: "아파트 매매 실거래 상세",
      mode: "live",
      summary: `${district} 상세 ${sum.count}건 · 평균 ${sum.avgDealManwon?.toLocaleString("ko-KR")}만원`,
      items,
      meta: { avgPerM2Won: sum.avgPerM2Won, count: sum.count },
    });
  }
  // 사실 우선: 매매(molitAptSale) 폴백을 그대로 재사용하면서 planId 까지 덮어써
  // 내보냈다. 원본이 비면 상세도 비는 게 맞다 — 없는 거래에 "층·전용면적" 같은
  // 필드 이름만 얹으면 상세 자료가 있는 것처럼 보인다.
  return unavailable(
    "molit-apt-sale-detail",
    "아파트 매매 실거래 상세",
    `${district} 실거래 상세 데이터 미연동`,
    "SEOUL_DATA_API_KEY 또는 MOLIT_SERVICE_KEY를 설정하세요.",
  );
}

// ── 부동산 유형별 실거래가 (오피스텔·연립·단독·토지·분양권·상업업무용) ──────
function dealItems(deals: MolitDeal[], limit: number): Array<Record<string, unknown>> {
  return deals.slice(0, limit).map((d) => ({
    name: d.name,
    district: d.umd,
    dealManwon: d.dealManwon,
    depositManwon: d.depositManwon,
    monthlyManwon: d.monthlyManwon,
    area: d.areaM2,
    floor: d.floor,
    buildYear: d.buildYear,
    dealDate: d.dealDate,
  }));
}

function makeMolitTypeFetcher(
  planId: string,
  type: MolitRtmsType,
  title: string,
) {
  return async function (q: NationalPlanQuery): Promise<NationalPlanFetchResult> {
    const district = districtOf(q);
    const { deals, mode } = await fetchMolitDeals(type, {
      district: q.district,
      yyyymm: q.yyyymm,
      numOfRows: 50,
    });
    if (mode === "live" && deals.length > 0) {
      const sum = summarizeDeals(deals);
      const priceLabel = sum.avgDealManwon
        ? `평균 ${sum.avgDealManwon.toLocaleString("ko-KR")}만원`
        : sum.avgDepositManwon
          ? `평균 보증금 ${sum.avgDepositManwon.toLocaleString("ko-KR")}만원`
          : `${sum.count}건`;
      return base(planId, {
        title,
        mode: "live",
        summary: `${district} ${sum.count}건 · ${priceLabel}`,
        items: dealItems(deals, q.limit ?? 10),
        meta: { avgPerM2Won: sum.avgPerM2Won, count: sum.count },
      });
    }
    // 사실 우선: 유형별로 "샘플오피스텔 2억9500만원 27.88㎡" 같은 거래 한 줄을
    // 지어내 붙였다. 실제 구 이름이 함께 나가서 그 동네 시세로 읽힌다.
    return unavailable(
      planId,
      title,
      `${district} 실거래 데이터 미연동`,
      "MOLIT_SERVICE_KEY 설정 시 LIVE 전환",
    );
  };
}

const molitOffiSale = makeMolitTypeFetcher("molit-offi-sale", "offi-sale", "오피스텔 매매 실거래가");
const molitOffiRent = makeMolitTypeFetcher("molit-offi-rent", "offi-rent", "오피스텔 전월세 실거래가");
const molitRhSale = makeMolitTypeFetcher("molit-rh-sale", "rh-sale", "연립다세대 매매 실거래가");
const molitShSale = makeMolitTypeFetcher("molit-sh-sale", "sh-sale", "단독/다가구 매매 실거래가");
const molitShRent = makeMolitTypeFetcher("molit-sh-rent", "sh-rent", "단독/다가구 전월세 실거래가");
const molitLandSale = makeMolitTypeFetcher("molit-land-sale", "land-sale", "토지 매매 실거래가");
const molitSilvSale = makeMolitTypeFetcher("molit-silv-sale", "silv-sale", "아파트 분양권전매 실거래가");
const molitNrgSale = makeMolitTypeFetcher("molit-nrg-sale", "nrg-sale", "상업업무용 매매 실거래가");

async function molitBuildingRegistry(q: NationalPlanQuery): Promise<NationalPlanFetchResult> {
  // 사실 우선: 키 유무와 무관하게 항상 같은 한 건("래미안 샘플 · 공동주택 ·
  // 연면적 125,000㎡ · 2018-06-01 사용승인 · 지하3~지상35")을 돌려줬고,
  // 키가 있으면 그걸 mode:"live" 로 라벨링했다. 임장 리포트(planIdsForIntent)에
  // 들어가는 계획이라 사용승인일·층수가 그대로 판단 근거가 된다.
  // 실제 조회는 건축HUB(buildhub-building-registry)가 한다.
  return unavailable(
    "molit-building-registry",
    "건축물대장",
    `${districtOf(q)} 건축물대장 미연동`,
    "MOLIT_SERVICE_KEY 설정 후 건축HUB(buildhub-building-registry)로 조회하세요.",
  );
}

async function molitGeocoder(q: NationalPlanQuery): Promise<NationalPlanFetchResult> {
  const query = q.q?.trim() || districtOf(q);
  if (q.lat && q.lng) {
    const lat = Number.parseFloat(String(q.lat));
    const lng = Number.parseFloat(String(q.lng));
    // 역지오코딩 미연동: 입력 좌표를 되돌려줄 뿐 주소를 아는 게 아니다.
    // confidence 0.88 같은 숫자는 근거가 없어 붙이지 않는다.
    return unavailable(
      "molit-geocoder",
      "지오코더·주소 변환",
      `좌표 (${lat.toFixed(5)}, ${lng.toFixed(5)}) 역지오코딩 미연동`,
      "MOLIT_SERVICE_KEY 설정 시 역지오코딩 LIVE",
    );
  }
  // 사실 우선: 어떤 검색어가 들어와도 강남 좌표(37.4979, 127.0276)를
  // confidence 0.92 로 돌려줬다. 좌표는 지도에 바로 찍히는 값이라 위험도가 높다.
  return unavailable(
    "molit-geocoder",
    "지오코더·주소 변환",
    `"${query}" 좌표 변환 미연동`,
    "MOLIT_SERVICE_KEY 설정 시 지오코딩 LIVE",
  );
}

async function molitCadastral(q: NationalPlanQuery): Promise<NationalPlanFetchResult> {
  // 사실 우선: 고정 필지(1168010100 · 대 · 842.5㎡)를 구와 무관하게 돌려줬다.
  return unavailable("molit-cadastral", "연속지적도", `${districtOf(q)} 지적 레이어 미연동`);
}

async function addressJuso(q: NationalPlanQuery): Promise<NationalPlanFetchResult> {
  const keyword = q.q?.trim() || districtOf(q);
  // 사실 우선: 어느 구를 넣든 "테헤란로 123 / 역삼동 123-45" 를 만들어 냈다.
  // 존재하지 않는 주소가 자동완성으로 나가면 그대로 입력값이 된다.
  return unavailable(
    "address-juso",
    "실시간 주소 검색",
    `주소 자동완성 "${keyword}" 미연동`,
    "도로명주소 API(JUSO) 키 설정 시 LIVE",
  );
}

async function seoulSubwayArrival(q: NationalPlanQuery): Promise<NationalPlanFetchResult> {
  const district = districtOf(q);
  // 사실 우선: 서울 열린데이터의 "역 목록"(SearchSTNBySubwayLineInfo)을 받아온 뒤
  // 거기에 arrivalMin: Math.floor(Math.random() * 5) + 1 과 direction: "내선" 을
  // 붙여 "서울 지하철 실시간 도착"으로 내보냈다. 역 이름·노선은 진짜라서
  // 옆에 붙은 난수 도착시간까지 사실처럼 읽힌다. 키가 없을 때는 아예
  // "강남 2호선 2분 · 역삼 2호선 4분"을 고정값으로 돌려줬다.
  // 받아온 건 역 목록이지 도착정보가 아니다 — 받아온 것만 그대로 돌려준다.
  if (isSeoulApiConfigured()) {
    try {
      const res = await fetchSeoulOpenApi("SearchSTNBySubwayLineInfo", 1, 200);
      const stations = res.rows
        .filter((r: Record<string, unknown>) => String(r.STATION_NM ?? "").length > 0)
        .slice(0, q.limit ?? 8)
        .map((r: Record<string, unknown>) => ({
          station: r.STATION_NM,
          line: r.LINE_NUM,
        }));
      if (stations.length > 0) {
        return base("seoul-subway-arrival", {
          title: "서울 지하철 역 정보",
          mode: "partial",
          summary: `${district} 인근 역 ${stations.length}곳 (실시간 도착 미연동)`,
          items: stations,
          notice: "서울 열린데이터 역 목록만 연동됨 — 도착시간은 제공하지 않습니다.",
        });
      }
    } catch {
      // 조회 실패 → 아래 미연동 응답
    }
  }
  return unavailable(
    "seoul-subway-arrival",
    "서울 지하철 역 정보",
    `${district} 지하철 정보 미연동`,
    "SEOUL_DATA_API_KEY 설정 시 역 목록 조회",
  );
}

async function seoulBusLocation(q: NationalPlanQuery): Promise<NationalPlanFetchResult> {
  const district = districtOf(q);
  if (isSeoulApiConfigured()) {
    const f = await fetchFacilitiesAggregate({ district });
    // 실제로 받은 값은 정류장 수뿐이다. sampleRoute:"146", etaMin:5 는 지어낸 값이라 뺀다.
    return base("seoul-bus-location", {
      title: "서울 버스 정류장",
      mode: "partial",
      summary: `${district} 버스정류장 ${f.counts.busStops}곳 (실시간 위치·ETA 미연동)`,
      items: [{ district, busStops: f.counts.busStops }],
      notice: "정류장 집계만 연동됨 — 노선별 도착시간은 제공하지 않습니다.",
    });
  }
  return unavailable(
    "seoul-bus-location",
    "서울 버스 정류장",
    `${district} 버스 정보 미연동`,
    "SEOUL_DATA_API_KEY 설정 시 정류장 집계 조회",
  );
}

async function exCongestion(q: NationalPlanQuery): Promise<NationalPlanFetchResult> {
  const data = await fetchExCongestionFrequency({
    zoneQuery: q.district ?? q.q,
    limit: q.limit ?? 10,
    yyyymm: q.yyyymm,
  });
  return base("ex-congestion-frequency", {
    title: "고속도로 혼잡빈도",
    mode: data.mode === "live" ? "live" : "sample",
    summary: `혼잡 구간 ${data.hotspots.length}곳 · ${data.yyyymm}`,
    items: data.hotspots ?? data.rows?.slice(0, q.limit ?? 10) ?? [],
    meta: { portalUrl: data.portalUrl, totalRows: data.totalRows },
  });
}

async function applyhomeCompetition(q: NationalPlanQuery): Promise<NationalPlanFetchResult> {
  const data = await searchApplyhome({
    tab: "competition",
    region: q.city,
    q: q.q,
    perPage: q.limit ?? 5,
  });
  return base("applyhome-competition", {
    title: "청약홈 경쟁률·특별공급",
    mode: data.mode === "live" ? "live" : "sample",
    summary: `경쟁률 ${data.totalCount.toLocaleString("ko-KR")}건`,
    items: data.items,
  });
}

// ── Phase 2 ────────────────────────────────────────────────────────

async function airQuality(q: NationalPlanQuery): Promise<NationalPlanFetchResult> {
  const district = districtOf(q);
  // 사실 우선: pm10 38 · pm25 18 · o3 0.032 · "보통" 을 측정소 이름(구)까지 달아
  // 고정 반환했다. 임장 리포트(planIdsForIntent)에 들어가는 계획이고,
  // "대기질 — 창문·환기 확인" 힌트가 이 요약을 정규식으로 훑어 붙는다.
  return unavailable(
    "air-quality",
    "에어코리아 대기오염",
    `${district} 대기질 데이터 미연동`,
    "에어코리아(DATA_GO_KR) 키 설정 시 LIVE",
  );
}

async function weatherShort(q: NationalPlanQuery): Promise<NationalPlanFetchResult> {
  const district = districtOf(q);
  const forecast = await fetchKmaShortForecast();
  if (forecast.mode === "live" && forecast.items.length > 0) {
    return base("weather-short", {
      title: "기상청 단기예보",
      mode: "live",
      summary: `${district} 기상청 LIVE ${forecast.items.length}일`,
      items: forecast.items,
    });
  }
  // 사실 우선: "오늘 맑음 14~24도 강수 10%" 를 만들어 냈다. 임장 날짜를 잡는 데
  // 쓰이는 값이라(weatherHint) 틀린 예보는 헛걸음으로 이어진다.
  return unavailable(
    "weather-short",
    "기상청 단기예보",
    `${district} 단기예보 미연동`,
    "MOLIT_SERVICE_KEY(공공데이터 인코딩 키) 설정 시 기상청 LIVE",
  );
}

/**
 * 파일데이터(표준데이터) 계획 — 아직 전량 적재 전.
 *
 * 사실 우선: 예전에는 lib/national-data/samples.ts 의 하드코딩 배열을 돌려줬다.
 * "강남역 상권 · 점포 842 · 매출지수 118", "코엑스 지하주차장 · 3,200면 ·
 * 시간당 4,000원" 처럼 실존 지명에 지어낸 수치를 붙인 형태였고,
 * lib/inspection/public-data-context.ts 가 items.length 만 보고
 * "상권·유동 — 소음·야간 조도 확인", "주차 — 방문·거주 주차 난이도 확인" 같은
 * 체크리스트를 붙였다. 즉 없는 데이터가 현장에서 확인할 항목을 만들어 냈다.
 * 적재 전에는 빈 목록으로 알린다(samples.ts 는 삭제).
 */
function fileDataPending(planId: string, title: string, q: NationalPlanQuery): NationalPlanFetchResult {
  return unavailable(
    planId,
    title,
    `${q.district ?? "전국"} 표준데이터 미적재`,
    "전국 파일데이터 적재(DATA_GO_KR 키 + 배치 ETL) 후 제공됩니다.",
  );
}

async function commercialDistrict(q: NationalPlanQuery) {
  return fileDataPending("commercial-district", "전국 상가(상권)정보", q);
}
async function geoEtlPlan(
  planId: string,
  title: string,
  kind: "parking" | "park" | "childcare",
  q: NationalPlanQuery,
): Promise<NationalPlanFetchResult | null> {
  const cached = await readGeoEtlCache(kind, q.district);
  if (!cached?.length) return null;
  return base(planId, {
    title,
    mode: "live",
    summary: `${q.district ?? "전국"} ETL 캐시 ${cached.length}건`,
    items: cached.slice(0, q.limit ?? 8),
  });
}

async function parkingStandard(q: NationalPlanQuery) {
  const fromCache = await geoEtlPlan("parking-standard", "전국 주차장 표준데이터", "parking", q);
  if (fromCache) return fromCache;
  return fileDataPending("parking-standard", "전국 주차장 표준데이터", q);
}
async function cityParkStandard(q: NationalPlanQuery) {
  const fromCache = await geoEtlPlan("city-park-standard", "전국 도시공원", "park", q);
  if (fromCache) return fromCache;
  return fileDataPending("city-park-standard", "전국 도시공원", q);
}
async function childcareZone(q: NationalPlanQuery) {
  const fromCache = await geoEtlPlan("childcare-zone", "전국 어린이보호구역", "childcare", q);
  if (fromCache) return fromCache;
  return fileDataPending("childcare-zone", "전국 어린이보호구역", q);
}
async function publicFacilityOpen(q: NationalPlanQuery) {
  return fileDataPending("public-facility-open", "전국 공공시설 개방", q);
}
async function multiUseBusiness(q: NationalPlanQuery) {
  return fileDataPending("multi-use-business", "다중이용업소(소방)", q);
}
async function cultureFestival(q: NationalPlanQuery) {
  return fileDataPending("culture-festival", "전국 문화축제", q);
}

async function tourismInfo(q: NationalPlanQuery): Promise<NationalPlanFetchResult> {
  // 사실 우선: 어느 구를 조회해도 코엑스 아쿠아리움·남산서울타워 두 곳을 돌려줬다.
  // 장소 자체는 실재하지만 "질의한 지역의 관광 POI"라는 응답으로는 사실이 아니다.
  return unavailable("tourism-info", "관광정보(한국관광공사)", `${districtOf(q)} 관광정보 미연동`);
}

// ── Phase 3 ────────────────────────────────────────────────────────

async function trafficCctv(_q: NationalPlanQuery): Promise<NationalPlanFetchResult> {
  // 사실 우선: "경부고속도로 · CCTV-001 · 원활" 은 존재하지 않는 CCTV 의 소통상태다.
  return unavailable("traffic-cctv", "교통 CCTV·화상", "교통 CCTV 미연동");
}

async function jejuTraffic(q: NationalPlanQuery): Promise<NationalPlanFetchResult> {
  // 사실 우선: 키가 있으면 "1100로 42km/h 보통", "1132호 55km/h 원활" 에
  // source:"data.go.kr" 도장을 찍고 mode:"partial" 로 내보냈다.
  // 파서가 없으니 받아온 값이 아니다 — 출처를 붙이면 검증된 값처럼 읽힌다.
  return unavailable(
    "jeju-traffic",
    "제주 실시간 교통",
    `${districtOf(q)} · 제주 실시간 교통 미연동`,
    "제주 교통 OpenAPI 파서 연동 후 제공됩니다.",
  );
}

async function pensionBusiness(q: NationalPlanQuery) {
  return fileDataPending("pension-business", "국민연금 가입 사업장", q);
}
async function constructionPension(q: NationalPlanQuery) {
  return fileDataPending("construction-pension", "건설근로자 퇴직공제", q);
}

async function stockPrice(_q: NationalPlanQuery): Promise<NationalPlanFetchResult> {
  // 사실 우선: KOSPI 종가 2650 · 등락 +0.42% 는 지어낸 시세다.
  return unavailable("stock-price", "금융위 주식시세", "주식시세 미연동");
}

async function bidInfo(_q: NationalPlanQuery): Promise<NationalPlanFetchResult> {
  // 사실 우선: "도로 보수 공사 · 2026-06-15 마감 · 12억" 은 존재하지 않는 공고다.
  return unavailable("bid-info", "나라장터 입찰·낙찰", "입찰공고 미연동");
}

async function specialDay(_q: NationalPlanQuery): Promise<NationalPlanFetchResult> {
  // 날짜가 법으로 고정된 공휴일만 담은 내장 목록이다(지어낸 값 아님).
  // 다만 예전 요약("2026년 공휴일")은 전체 목록인 것처럼 읽혀서, 범위를 명시한다.
  return base("special-day", {
    title: "천문연구원 특일 정보",
    mode: "sample",
    summary: "고정일 공휴일 2건 (내장 목록 · 전체 공휴일 API 미연동)",
    items: [
      { date: "2026-05-05", name: "어린이날" },
      { date: "2026-06-06", name: "현충일" },
    ],
    notice: "대체공휴일·음력 공휴일은 포함되지 않습니다.",
  });
}

async function portalOpenStatus(q: NationalPlanQuery): Promise<NationalPlanFetchResult> {
  const rankings = loadAllPopularityRankings().slice(0, q.limit ?? 15);
  return base("portal-open-status", {
    title: "공공데이터 목록개방현황",
    mode: "sample",
    summary: `TOP CSV ${listPopularityRankingMeta().length}종 기반`,
    items: rankings,
  });
}

async function lifelongLearning(q: NationalPlanQuery) {
  return fileDataPending("lifelong-learning", "전국 평생학습 강좌", q);
}
async function imuRoadSensor(q: NationalPlanQuery) {
  // 사실 우선: 키가 있으면 하드코딩 센서 목록에 source:"data.go.kr" 를 붙여
  // mode:"partial" 로 내보냈다(파서는 없다).
  return fileDataPending("imu-road-sensor", "인천 도로 IMU 센서", q);
}

// ── 건축HUB ────────────────────────────────────────────────────────

async function buildhubBuildingRegistry(q: NationalPlanQuery): Promise<NationalPlanFetchResult> {
  const district = districtOf(q);
  const sigunguCd = resolveSigunguCd(district);
  if (isDataGoKrEncodingConfigured()) {
    const { buildings, mode } = await fetchBuildingBasisInfo({
      sigunguCd,
      bjdongCd: (q as Record<string, string>).bjdongCd ?? "00000",
      numOfRows: q.limit ?? 20,
    });
    if (mode === "live" && buildings.length > 0) {
      return base("buildhub-building-registry", {
        title: "건축물대장 기본개요",
        mode: "live",
        summary: `${district} 건축물대장 ${buildings.length}건`,
        items: buildings.map((b) => ({
          name: b.bldNm,
          address: b.newPlatPlc ?? b.platPlc,
          purpose: b.mainPurpsCdNm,
          totalArea: b.totArea,
          floors: b.grndFlrCnt,
          useApprovalDate: b.useAprDay,
          households: b.hhldCnt,
        })),
      });
    }
  }
  return base("buildhub-building-registry", {
    title: "건축물대장 기본개요",
    mode: "sample",
    summary: "MOLIT_SERVICE_KEY 설정 필요",
    items: [],
    notice: "MOLIT_SERVICE_KEY 환경변수를 설정하면 실시간 건축물대장 조회가 가능합니다.",
  });
}

async function buildhubArchPermits(q: NationalPlanQuery): Promise<NationalPlanFetchResult> {
  const district = districtOf(q);
  const sigunguCd = resolveSigunguCd(district);
  if (isDataGoKrEncodingConfigured()) {
    const { permits, mode } = await fetchArchPermits({
      sigunguCd,
      numOfRows: q.limit ?? 20,
    });
    if (mode === "live" && permits.length > 0) {
      return base("buildhub-arch-permits", {
        title: "건축인허가 현황",
        mode: "live",
        summary: `${district} 건축인허가 ${permits.length}건`,
        items: permits.map((p) => ({
          name: p.bldNm,
          address: p.platPlc,
          purpose: p.mainPurpsCdNm,
          permitDate: p.pmsDay,
          constructionStart: p.stcnsDay,
          approvalDate: p.useAprDay,
          type: p.archGbCdNm,
        })),
      });
    }
  }
  return base("buildhub-arch-permits", {
    title: "건축인허가 현황",
    mode: "sample",
    summary: "MOLIT_SERVICE_KEY 설정 필요",
    items: [],
    notice: "MOLIT_SERVICE_KEY 환경변수를 설정하면 실시간 인허가 조회가 가능합니다.",
  });
}

async function buildhubHousingPermits(q: NationalPlanQuery): Promise<NationalPlanFetchResult> {
  const district = districtOf(q);
  const sigunguCd = resolveSigunguCd(district);
  if (isDataGoKrEncodingConfigured()) {
    const { permits, mode } = await fetchHousingPermits({
      sigunguCd,
      numOfRows: q.limit ?? 20,
    });
    if (mode === "live" && permits.length > 0) {
      return base("buildhub-housing-permits", {
        title: "주택인허가 현황",
        mode: "live",
        summary: `${district} 주택인허가 ${permits.length}건`,
        items: permits.map((p) => ({
          name: p.bldNm,
          address: p.platPlc,
          purpose: p.mainPurpsCdNm,
          permitDate: p.pmsDay,
          approvalDate: p.useAprDay,
        })),
      });
    }
  }
  return base("buildhub-housing-permits", {
    title: "주택인허가 현황",
    mode: "sample",
    summary: "MOLIT_SERVICE_KEY 설정 필요",
    items: [],
  });
}

// ── 공동주택 ────────────────────────────────────────────────────────

async function aptComplexList(q: NationalPlanQuery): Promise<NationalPlanFetchResult> {
  const district = districtOf(q);
  const sigunguCd = resolveSigunguCd(district);
  if (isDataGoKrEncodingConfigured()) {
    const { complexes, mode } = await fetchAptComplexList({
      sigunguCd,
      numOfRows: q.limit ?? 30,
    });
    if (mode === "live" && complexes.length > 0) {
      const filtered = q.q?.trim()
        ? complexes.filter((c) => c.kaptName.includes(q.q!.trim()))
        : complexes;
      return base("apt-complex-list", {
        title: "공동주택 단지 목록",
        mode: "live",
        summary: `${district} 단지 ${filtered.length}건`,
        items: filtered.map((c) => ({
          kaptCode: c.kaptCode,
          name: c.kaptName,
          dong: c.as3,
          address: c.as4,
          households: c.hhldCnt,
          dongCount: c.kaptDongCnt,
          approvalDate: c.kaptUsedate,
        })),
      });
    }
  }
  return base("apt-complex-list", {
    title: "공동주택 단지 목록",
    mode: "sample",
    summary: "MOLIT_SERVICE_KEY 설정 필요",
    items: [],
    notice: "MOLIT_SERVICE_KEY 환경변수를 설정하면 전국 공동주택 단지 목록 조회가 가능합니다.",
  });
}

async function aptComplexDetail(q: NationalPlanQuery): Promise<NationalPlanFetchResult> {
  const kaptCode = (q as Record<string, string>).kaptCode ?? q.q ?? "";
  if (isDataGoKrEncodingConfigured() && kaptCode) {
    const { detail, mode } = await fetchAptComplexDetail(kaptCode);
    if (mode === "live" && detail) {
      return base("apt-complex-detail", {
        title: "공동주택 단지 기본정보",
        mode: "live",
        summary: `${detail.kaptName} 상세정보`,
        items: [detail],
        meta: {
          kaptCode: detail.kaptCode,
          name: detail.kaptName,
          address: detail.doroJuso ?? detail.kaptAddr,
          households: detail.hhldCnt,
          dongCount: detail.kaptDongCnt,
          approvalDate: detail.kaptUsedate,
          builder: detail.kaptdaNm,
          heating: detail.heatSplyMthdCd,
          parking: detail.parkingLotCnt,
          lat: detail.lat,
          lng: detail.lng,
        },
      });
    }
  }
  return base("apt-complex-detail", {
    title: "공동주택 단지 기본정보",
    mode: "sample",
    summary: "kaptCode 파라미터 또는 MOLIT_SERVICE_KEY 필요",
    items: [],
  });
}

// ── Registry ───────────────────────────────────────────────────────

export const NATIONAL_PLAN_FETCHERS: Record<string, (q: NationalPlanQuery) => Promise<NationalPlanFetchResult>> = {
  "molit-apt-sale": molitAptSale,
  "molit-apt-rent": molitAptRent,
  "molit-apt-sale-detail": molitAptSaleDetail,
  "molit-offi-sale": molitOffiSale,
  "molit-offi-rent": molitOffiRent,
  "molit-rh-sale": molitRhSale,
  "molit-sh-sale": molitShSale,
  "molit-sh-rent": molitShRent,
  "molit-land-sale": molitLandSale,
  "molit-silv-sale": molitSilvSale,
  "molit-nrg-sale": molitNrgSale,
  "molit-building-registry": molitBuildingRegistry,
  "molit-geocoder": molitGeocoder,
  "molit-cadastral": molitCadastral,
  "address-juso": addressJuso,
  "seoul-subway-arrival": seoulSubwayArrival,
  "seoul-bus-location": seoulBusLocation,
  "ex-congestion-frequency": exCongestion,
  "applyhome-competition": applyhomeCompetition,
  "air-quality": airQuality,
  "weather-short": weatherShort,
  "commercial-district": commercialDistrict,
  "parking-standard": parkingStandard,
  "city-park-standard": cityParkStandard,
  "childcare-zone": childcareZone,
  "public-facility-open": publicFacilityOpen,
  "multi-use-business": multiUseBusiness,
  "culture-festival": cultureFestival,
  "tourism-info": tourismInfo,
  "traffic-cctv": trafficCctv,
  "jeju-traffic": jejuTraffic,
  "pension-business": pensionBusiness,
  "construction-pension": constructionPension,
  "stock-price": stockPrice,
  "bid-info": bidInfo,
  "special-day": specialDay,
  "portal-open-status": portalOpenStatus,
  "lifelong-learning": lifelongLearning,
  "imu-road-sensor": imuRoadSensor,
  "buildhub-building-registry": buildhubBuildingRegistry,
  "buildhub-arch-permits": buildhubArchPermits,
  "buildhub-housing-permits": buildhubHousingPermits,
  "apt-complex-list": aptComplexList,
  "apt-complex-detail": aptComplexDetail,
};

export const NATIONAL_PLAN_IDS = Object.keys(NATIONAL_PLAN_FETCHERS);
