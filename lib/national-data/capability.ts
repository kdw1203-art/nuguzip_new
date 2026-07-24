import type { NationalIntegrationStatus } from "@/lib/public-data/national-utilization-catalog";
import { NATIONAL_PLAN_IDS } from "@/lib/national-data/adapters";
import { isSeoulApiConfigured } from "@/lib/seoul/openapi-client";
import {
  isDataGoKrEncodingConfigured,
  isOdcloudConfigured,
} from "@/lib/public-data/data-go-kr-keys";

const SEOUL_RTMS_PLANS = new Set([
  "molit-apt-sale",
  "molit-apt-rent",
  "molit-apt-sale-detail",
]);

/**
 * 사실 우선: 어댑터에 실제 호출부가 없는(항상 빈 목록을 돌려주는) 계획들.
 *
 * 예전에는 아래 규칙이 planId 접두사와 키 존재 여부만 보고 상태를 매겼다 —
 * 키만 있으면 molit-* 는 전부 "live", odcloud 키가 있으면 나머지는 전부 "partial".
 * 그래서 파서가 없는 지적도·주소검색·제주교통·주식시세까지 연동된 것으로 집계돼
 * 어드민 대시보드의 live/partial 카운트가 실제보다 부풀었다.
 * 호출부가 생기면 이 목록에서 빼는 게 순서다.
 */
const NO_LIVE_SOURCE_PLANS = new Set([
  "molit-building-registry", // 실조회는 buildhub-building-registry 가 한다
  "molit-geocoder",
  "molit-cadastral",
  "address-juso",
  "tourism-info",
  "traffic-cctv",
  "jeju-traffic",
  "stock-price",
  "bid-info",
  "imu-road-sensor",
  "commercial-district",
  "public-facility-open",
  "multi-use-business",
  "culture-festival",
  "pension-business",
  "construction-pension",
  "lifelong-learning",
]);

/** 런타임 연동 가능 상태 (fetcher 등록 여부 + env) */
export function getNationalPlanCapability(planId: string): NationalIntegrationStatus | "planned" {
  if (planId === "ex-congestion-frequency") return "live";
  if (planId === "applyhome-competition" && isOdcloudConfigured()) return "live";
  // 내장 데이터로 답하는 계획 (외부 키와 무관)
  if (planId === "portal-open-status") return "sample";
  if (planId === "special-day") return "sample";

  const hasFetcher = NATIONAL_PLAN_IDS.includes(planId);
  if (!hasFetcher) return "planned";

  // 키가 있어도 호출부가 없으면 연동된 게 아니다.
  if (NO_LIVE_SOURCE_PLANS.has(planId)) return "planned";

  if (planId.startsWith("molit-") && isDataGoKrEncodingConfigured()) return "live";
  if (SEOUL_RTMS_PLANS.has(planId) && isSeoulApiConfigured()) return "live";

  // 지하철·버스는 역 목록/정류장 집계만 붙어 있다 — 실시간은 아직 아니다.
  if (planId.startsWith("seoul-") && isSeoulApiConfigured()) return "partial";

  if (
    (planId === "weather-short" || planId === "air-quality") &&
    isDataGoKrEncodingConfigured()
  ) {
    return planId === "weather-short" ? "live" : "planned";
  }

  // 주차장·도시공원·어린이보호구역은 geo ETL 캐시가 적재돼 있으면 live 로 응답하지만,
  // 그건 조회해 봐야 아는 값이다. 여기서는 적재를 단정하지 않고 planned 로 둔다.
  return "planned";
}
