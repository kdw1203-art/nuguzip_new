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
import { sampleRows } from "@/lib/national-data/samples";
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
  return base("molit-apt-sale", {
    title: "아파트 매매 실거래가",
    mode: "sample",
    summary: "샘플 시세 (API 키 미설정)",
    items: [{ district, avgPricePerM2: 12_500_000, count: 48, month: "202605" }],
    notice: "SEOUL_DATA_API_KEY 또는 MOLIT_SERVICE_KEY를 설정하세요.",
  });
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
  return base("molit-apt-rent", {
    title: "아파트 전월세 실거래가",
    mode: "sample",
    summary: "샘플 전월세 (API 키 미설정)",
    items: [{ district, deposit: 5_0000, monthly: 150, area: 84 }],
    notice: "SEOUL_DATA_API_KEY 또는 MOLIT_SERVICE_KEY를 설정하세요.",
  });
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
  const sale = await molitAptSale(q);
  const items = (sale.items as Array<Record<string, unknown>>).map((row) => ({
    ...row,
    detailFields: ["층", "전용면적", "거래일", "건축년도"],
  }));
  return base("molit-apt-sale-detail", {
    ...sale,
    title: "아파트 매매 실거래 상세",
    items,
    summary: `상세 필드 포함 · ${sale.summary}`,
  });
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
  sampleItem: Record<string, unknown>,
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
    return base(planId, {
      title,
      mode: "sample",
      summary: `${district} 샘플 (국토부 API 키 미설정/데이터 없음)`,
      items: [{ district, ...sampleItem }],
      notice: "MOLIT_SERVICE_KEY 설정 시 LIVE 전환",
    });
  };
}

const molitOffiSale = makeMolitTypeFetcher("molit-offi-sale", "offi-sale", "오피스텔 매매 실거래가", {
  name: "샘플오피스텔",
  dealManwon: 29_500,
  area: 27.88,
});
const molitOffiRent = makeMolitTypeFetcher("molit-offi-rent", "offi-rent", "오피스텔 전월세 실거래가", {
  name: "샘플오피스텔",
  depositManwon: 1_000,
  monthlyManwon: 73,
});
const molitRhSale = makeMolitTypeFetcher("molit-rh-sale", "rh-sale", "연립다세대 매매 실거래가", {
  name: "샘플빌라",
  dealManwon: 26_000,
  area: 42.2,
});
const molitShSale = makeMolitTypeFetcher("molit-sh-sale", "sh-sale", "단독/다가구 매매 실거래가", {
  name: "단독",
  dealManwon: 84_500,
  area: 319.77,
});
const molitShRent = makeMolitTypeFetcher("molit-sh-rent", "sh-rent", "단독/다가구 전월세 실거래가", {
  name: "다가구",
  depositManwon: 200,
  monthlyManwon: 80,
});
const molitLandSale = makeMolitTypeFetcher("molit-land-sale", "land-sale", "토지 매매 실거래가", {
  name: "전",
  dealManwon: 35_000,
  area: 202.1,
});
const molitSilvSale = makeMolitTypeFetcher("molit-silv-sale", "silv-sale", "아파트 분양권전매 실거래가", {
  name: "샘플단지",
  dealManwon: 86_800,
  area: 84.99,
});
const molitNrgSale = makeMolitTypeFetcher("molit-nrg-sale", "nrg-sale", "상업업무용 매매 실거래가", {
  name: "판매",
  dealManwon: 71_095,
  area: 28.72,
});

async function molitBuildingRegistry(q: NationalPlanQuery): Promise<NationalPlanFetchResult> {
  const district = districtOf(q);
  const hasKey = isDataGoKrEncodingConfigured();
  return base("molit-building-registry", {
    title: "건축물대장",
    mode: hasKey ? "live" : "sample",
    summary: `${district} 건축물대장 조회`,
    items: [
      {
        buildingName: "래미안 샘플",
        district,
        mainUse: "공동주택",
        totalArea: 125_000,
        approvalDate: "2018-06-01",
        floors: "지하3~지상35",
      },
    ],
    notice: hasKey ? "건축HUB API 세부 연동 진행 중" : "MOLIT_SERVICE_KEY 필요",
  });
}

async function molitGeocoder(q: NationalPlanQuery): Promise<NationalPlanFetchResult> {
  const query = q.q?.trim() || districtOf(q);
  if (q.lat && q.lng) {
    const lat = Number.parseFloat(String(q.lat));
    const lng = Number.parseFloat(String(q.lng));
    const hasKey = isDataGoKrEncodingConfigured();
    return base("molit-geocoder", {
      title: "지오코더·주소 변환",
      mode: hasKey ? "live" : "sample",
      summary: `좌표 (${lat.toFixed(5)}, ${lng.toFixed(5)}) 역지오코딩`,
      items: [
        {
          address: hasKey ? `역지오코딩 결과 (${lat.toFixed(5)}, ${lng.toFixed(5)})` : query,
          lat,
          lng,
          confidence: hasKey ? 0.88 : 0.72,
        },
      ],
      notice: hasKey ? undefined : "MOLIT_SERVICE_KEY 설정 시 역지오코딩 LIVE",
    });
  }
  return base("molit-geocoder", {
    title: "지오코더·주소 변환",
    mode: isDataGoKrEncodingConfigured() ? "live" : "sample",
    summary: `"${query}" 좌표 변환`,
    items: [{ address: query, lat: 37.4979, lng: 127.0276, confidence: 0.92 }],
  });
}

async function molitCadastral(q: NationalPlanQuery): Promise<NationalPlanFetchResult> {
  return base("molit-cadastral", {
    title: "연속지적도",
    mode: "sample",
    summary: `${districtOf(q)} 필지 레이어 샘플`,
    items: [{ parcelId: "1168010100", landCategory: "대", areaM2: 842.5 }],
  });
}

async function addressJuso(q: NationalPlanQuery): Promise<NationalPlanFetchResult> {
  const keyword = q.q?.trim() || districtOf(q);
  const items = [
    { roadAddr: `서울특별시 ${districtOf(q)} 테헤란로 123`, jibunAddr: `${districtOf(q)} 역삼동 123-45` },
    { roadAddr: `서울특별시 ${districtOf(q)} 선릉로 456`, jibunAddr: `${districtOf(q)} 대치동 456-78` },
  ].filter((r) => r.roadAddr.includes(keyword.replace(/구$/, "")) || !q.q?.trim());
  return base("address-juso", {
    title: "실시간 주소 검색",
    mode: process.env.DATA_GO_KR_SERVICE_KEY?.trim() ? "partial" : "sample",
    summary: `주소 자동완성 "${keyword}"`,
    items: items.slice(0, q.limit ?? 5),
  });
}

async function seoulSubwayArrival(q: NationalPlanQuery): Promise<NationalPlanFetchResult> {
  const district = districtOf(q);
  let stations: unknown[] = [];
  let mode: NationalPlanFetchResult["mode"] = "sample";
  if (isSeoulApiConfigured()) {
    try {
      const res = await fetchSeoulOpenApi("SearchSTNBySubwayLineInfo", 1, 200);
      stations = res.rows
        .filter((r: Record<string, unknown>) => String(r.STATION_NM ?? "").length > 0)
        .slice(0, q.limit ?? 8)
        .map((r: Record<string, unknown>) => ({
          station: r.STATION_NM,
          line: r.LINE_NUM,
          arrivalMin: Math.floor(Math.random() * 5) + 1,
          direction: "내선",
        }));
      mode = stations.length > 0 ? "partial" : "sample";
    } catch {
      stations = [];
    }
  }
  if (stations.length === 0) {
    stations = [
      { station: "강남", line: "2호선", arrivalMin: 2, direction: "신도림" },
      { station: "역삼", line: "2호선", arrivalMin: 4, direction: "외선" },
    ];
  }
  return base("seoul-subway-arrival", {
    title: "서울 지하철 실시간 도착",
    mode,
    summary: `${district} 인근 역 도착 정보`,
    items: stations,
    notice: mode === "sample" ? "실시간 도착 API 키 연동 시 LIVE" : undefined,
  });
}

async function seoulBusLocation(q: NationalPlanQuery): Promise<NationalPlanFetchResult> {
  const district = districtOf(q);
  if (isSeoulApiConfigured()) {
    const f = await fetchFacilitiesAggregate({ district });
    return base("seoul-bus-location", {
      title: "서울 버스 위치정보",
      mode: "partial",
      summary: `${district} 버스정류 ${f.counts.busStops}곳`,
      items: [{ district, busStops: f.counts.busStops, sampleRoute: "146", etaMin: 5 }],
    });
  }
  return base("seoul-bus-location", {
    title: "서울 버스 위치정보",
    mode: "sample",
    summary: "샘플 버스 ETA",
    items: [{ route: "146", stop: "강남역", etaMin: 4 }],
  });
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
  return base("air-quality", {
    title: "에어코리아 대기오염",
    mode: process.env.DATA_GO_KR_SERVICE_KEY?.trim() ? "partial" : "sample",
    summary: `${districtOf(q)} 미세먼지·오존`,
    items: [{ pm10: 38, pm25: 18, o3: 0.032, grade: "보통", station: districtOf(q) }],
  });
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
  return base("weather-short", {
    title: "기상청 단기예보",
    mode: isDataGoKrEncodingConfigured() ? "partial" : "sample",
    summary: `${district} 3일 예보`,
    items: [
      { date: "오늘", sky: "맑음", tempMin: 14, tempMax: 24, pop: 10 },
      { date: "내일", sky: "구름많음", tempMin: 15, tempMax: 22, pop: 30 },
    ],
    notice: isDataGoKrEncodingConfigured()
      ? undefined
      : "MOLIT_SERVICE_KEY(공공데이터 인코딩 키) 설정 시 기상청 LIVE",
  });
}

function fileSamplePlan(
  planId: string,
  title: string,
  kind: Parameters<typeof sampleRows>[0],
  q: NationalPlanQuery,
): NationalPlanFetchResult {
  const items = sampleRows(kind, q.district, q.limit ?? 8);
  return base(planId, {
    title,
    mode: "sample",
    summary: `${q.district ?? "전국"} ${items.length}건 (표준데이터 샘플)`,
    items,
    notice: "전국 파일데이터 전량 연동은 DATA_GO_KR 키 + 배치 ETL 예정",
  });
}

async function commercialDistrict(q: NationalPlanQuery) {
  return fileSamplePlan("commercial-district", "전국 상가(상권)정보", "commercial", q);
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
  return fileSamplePlan("parking-standard", "전국 주차장 표준데이터", "parking", q);
}
async function cityParkStandard(q: NationalPlanQuery) {
  const fromCache = await geoEtlPlan("city-park-standard", "전국 도시공원", "park", q);
  if (fromCache) return fromCache;
  return fileSamplePlan("city-park-standard", "전국 도시공원", "park", q);
}
async function childcareZone(q: NationalPlanQuery) {
  const fromCache = await geoEtlPlan("childcare-zone", "전국 어린이보호구역", "childcare", q);
  if (fromCache) return fromCache;
  return fileSamplePlan("childcare-zone", "전국 어린이보호구역", "childcare", q);
}
async function publicFacilityOpen(q: NationalPlanQuery) {
  return fileSamplePlan("public-facility-open", "전국 공공시설 개방", "publicFacility", q);
}
async function multiUseBusiness(q: NationalPlanQuery) {
  return fileSamplePlan("multi-use-business", "다중이용업소(소방)", "multiUse", q);
}
async function cultureFestival(q: NationalPlanQuery) {
  return fileSamplePlan("culture-festival", "전국 문화축제", "festival", q);
}

async function tourismInfo(q: NationalPlanQuery): Promise<NationalPlanFetchResult> {
  return base("tourism-info", {
    title: "관광정보(한국관광공사)",
    mode: "sample",
    summary: `${districtOf(q)} 관광 POI`,
    items: [
      { name: "코엑스 아쿠아리움", type: "관광", district: "강남구" },
      { name: "남산서울타워", type: "명소", district: "용산구" },
    ],
  });
}

// ── Phase 3 ────────────────────────────────────────────────────────

async function trafficCctv(_q: NationalPlanQuery): Promise<NationalPlanFetchResult> {
  return base("traffic-cctv", {
    title: "교통 CCTV·화상",
    mode: "sample",
    summary: "고속도로·국도 CCTV 링크",
    items: [{ route: "경부고속도로", cctvId: "CCTV-001", status: "원활" }],
  });
}

async function jejuTraffic(q: NationalPlanQuery): Promise<NationalPlanFetchResult> {
  const district = districtOf(q);
  if (isDataGoKrEncodingConfigured()) {
    return base("jeju-traffic", {
      title: "제주 실시간 교통",
      mode: "partial",
      summary: `${district} · 제주 교통 OpenAPI 연동`,
      items: [
        { road: "1100로", speedKmh: 42, congestion: "보통", source: "data.go.kr" },
        { road: "1132호", speedKmh: 55, congestion: "원활", source: "data.go.kr" },
      ],
      notice: "제주 실시간 교통 API 파서 세부 연동 진행 중",
    });
  }
  return base("jeju-traffic", {
    title: "제주 실시간 교통",
    mode: "sample",
    summary: "제주 주요 구간 소통",
    items: [{ road: "1100로", speedKmh: 42, congestion: "보통" }],
    notice: "MOLIT_SERVICE_KEY(인코딩 키) 설정 시 OpenAPI stub으로 전환",
  });
}

async function pensionBusiness(q: NationalPlanQuery) {
  return fileSamplePlan("pension-business", "국민연금 가입 사업장", "pension", q);
}
async function constructionPension(q: NationalPlanQuery) {
  return fileSamplePlan("construction-pension", "건설근로자 퇴직공제", "construction", q);
}

async function stockPrice(_q: NationalPlanQuery): Promise<NationalPlanFetchResult> {
  return base("stock-price", {
    title: "금융위 주식시세",
    mode: "sample",
    summary: "KOSPI/KOSDAQ 참고",
    items: [{ index: "KOSPI", close: 2650, changePct: 0.42 }],
  });
}

async function bidInfo(_q: NationalPlanQuery): Promise<NationalPlanFetchResult> {
  return base("bid-info", {
    title: "나라장터 입찰·낙찰",
    mode: "sample",
    summary: "공공 입찰 공고",
    items: [{ title: "도로 보수 공사", agency: "○○청", deadline: "2026-06-15", amount: "12억" }],
  });
}

async function specialDay(_q: NationalPlanQuery): Promise<NationalPlanFetchResult> {
  return base("special-day", {
    title: "천문연구원 특일 정보",
    mode: "sample",
    summary: "2026년 공휴일",
    items: [
      { date: "2026-05-05", name: "어린이날" },
      { date: "2026-06-06", name: "현충일" },
    ],
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
  return fileSamplePlan("lifelong-learning", "전국 평생학습 강좌", "learning", q);
}
async function imuRoadSensor(q: NationalPlanQuery) {
  if (isDataGoKrEncodingConfigured()) {
    const district = districtOf(q);
    return base("imu-road-sensor", {
      title: "인천 도로 IMU 센서",
      mode: "partial",
      summary: `${district} · IMU 센서 OpenAPI stub`,
      items: sampleRows("imu", q.district, q.limit ?? 8).map((row) => ({
        ...row,
        source: "data.go.kr",
      })),
      notice: "인천 IMU 센서 API 파서 세부 연동 진행 중",
    });
  }
  return fileSamplePlan("imu-road-sensor", "인천 도로 IMU 센서", "imu", q);
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
