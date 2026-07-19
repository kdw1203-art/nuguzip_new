import type {
  ApplyhomeCompetitionEndpoint,
  ApplyhomeDetailEndpoint,
  ApplyhomeSpecialEndpoint,
  OdcloudListResponse,
} from "@/lib/applyhome/types";

const ODCLOUD_BASE = "https://api.odcloud.kr/api";

const SERVICE_PATHS = {
  competition: "ApplyhomeInfoCmpetRtSvc/v1",
  detail: "ApplyhomeInfoDetailSvc/v1",
} as const;

export function isApplyhomeConfigured(): boolean {
  return Boolean(process.env.DATA_GO_KR_SERVICE_KEY?.trim());
}

export function getApplyhomeServiceKey(): string {
  const key = process.env.DATA_GO_KR_SERVICE_KEY?.trim();
  if (!key) throw new Error("DATA_GO_KR_SERVICE_KEY is not configured");
  return key;
}

async function fetchOdcloud<T>(
  servicePath: string,
  endpoint: string,
  params: Record<string, string | number | undefined> = {},
): Promise<OdcloudListResponse<T>> {
  const serviceKey = getApplyhomeServiceKey();
  const url = new URL(`${ODCLOUD_BASE}/${servicePath}/${endpoint}`);
  url.searchParams.set("serviceKey", serviceKey);
  url.searchParams.set("returnType", "JSON");

  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
  }

  const res = await fetch(url.toString(), {
    next: { revalidate: 3600 },
    headers: { Accept: "application/json" },
  });

  const body = await res.text().catch(() => "");
  if (!res.ok) {
    throw new Error(`Applyhome ${endpoint} failed (${res.status}): ${body.slice(0, 200)}`);
  }

  try {
    return JSON.parse(body) as OdcloudListResponse<T>;
  } catch {
    throw new Error(`Applyhome ${endpoint} invalid JSON`);
  }
}

export async function fetchOdcloudApplyhome<T>(
  endpoint: ApplyhomeCompetitionEndpoint | ApplyhomeSpecialEndpoint,
  params: Record<string, string | number | undefined> = {},
): Promise<OdcloudListResponse<T>> {
  return fetchOdcloud<T>(SERVICE_PATHS.competition, endpoint, params);
}

export async function fetchOdcloudApplyhomeDetail<T>(
  endpoint: ApplyhomeDetailEndpoint,
  params: Record<string, string | number | undefined> = {},
): Promise<OdcloudListResponse<T>> {
  return fetchOdcloud<T>(SERVICE_PATHS.detail, endpoint, params);
}

export async function probeApplyhomeDetailAccess(): Promise<boolean> {
  if (!isApplyhomeConfigured()) return false;
  try {
    await fetchOdcloudApplyhomeDetail("getAPTLttotPblancDetail", { page: 1, perPage: 1 });
    return true;
  } catch {
    return false;
  }
}
