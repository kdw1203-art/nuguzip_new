import type { NationalIntegrationStatus } from "@/lib/public-data/national-utilization-catalog";

export type NationalFetchMode = NationalIntegrationStatus;

export type NationalPlanQuery = {
  district?: string;
  city?: string;
  q?: string;
  lat?: string;
  lng?: string;
  limit?: number;
  yyyymm?: string;
};

export type NationalPlanFetchResult = {
  planId: string;
  title: string;
  mode: NationalFetchMode;
  summary: string;
  items: unknown[];
  meta?: Record<string, unknown>;
  appSurfaces?: string;
  portalUrl?: string;
  notice?: string;
  fetchedAt: string;
};

export type NationalPlanFetcher = (
  query: NationalPlanQuery,
) => Promise<NationalPlanFetchResult>;
