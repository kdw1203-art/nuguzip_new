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



/** 런타임 연동 가능 상태 (fetcher 등록 여부 + env) */

export function getNationalPlanCapability(planId: string): NationalIntegrationStatus | "planned" {

  if (planId === "ex-congestion-frequency") return "live";

  if (planId === "applyhome-competition" && isOdcloudConfigured()) return "live";

  if (planId === "portal-open-status") return "sample";



  const hasFetcher = NATIONAL_PLAN_IDS.includes(planId);

  if (!hasFetcher) return "planned";



  if (planId.startsWith("molit-") && isDataGoKrEncodingConfigured()) return "live";

  if (SEOUL_RTMS_PLANS.has(planId) && isSeoulApiConfigured()) return "live";



  if (planId.startsWith("seoul-") && isSeoulApiConfigured()) return "live";



  if (

    (planId === "weather-short" || planId === "air-quality" || planId === "address-juso") &&

    (isDataGoKrEncodingConfigured() || isOdcloudConfigured())

  ) {

    return isDataGoKrEncodingConfigured() ? "live" : "partial";

  }



  if (isOdcloudConfigured()) return "partial";



  return "sample";

}

