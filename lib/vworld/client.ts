/**
 * 브이월드(VWorld) Open API — 2D 데이터 / WFS
 * @see https://www.vworld.kr/dev/v4dv_2dDataAPI_0202.do
 */

const VWORLD_DATA_BASE = "https://api.vworld.kr/req/data";

export class VworldApiError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "VworldApiError";
    this.code = code;
  }
}

export function getVworldApiKey(): string | null {
  return process.env.VWORLD_API_KEY?.trim() || null;
}

/** VWorld 키 발급 시 등록한 도메인 (production: https://nuguzip.com) */
export function getVworldDomain(): string {
  return (
    process.env.VWORLD_API_DOMAIN?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    "https://nuguzip.com"
  );
}

export function isVworldConfigured(): boolean {
  return Boolean(getVworldApiKey());
}

export type VworldFeatureCollection = {
  type: string;
  features: Array<{
    type: string;
    properties: Record<string, unknown>;
    geometry?: unknown;
  }>;
};

export type VworldGetFeatureResult = {
  totalFeatureCount?: number;
  featureCollection: VworldFeatureCollection;
};

type VworldDataResponse = {
  response?: {
    status?: string;
    error?: { code?: string; text?: string };
    result?: {
      totalFeatureCount?: number;
      featureCollection?: VworldFeatureCollection;
    };
  };
};

export async function fetchVworldGetFeature(options: {
  data: string;
  page?: number;
  size?: number;
  attrFilter?: string;
  geomFilter?: string;
  geometry?: boolean;
}): Promise<VworldGetFeatureResult> {
  const key = getVworldApiKey();
  if (!key) {
    throw new VworldApiError("NO_KEY", "VWORLD_API_KEY is not configured");
  }

  const params = new URLSearchParams({
    service: "data",
    request: "getfeature",
    version: "2.0",
    data: options.data,
    key,
    domain: getVworldDomain(),
    format: "json",
    size: String(Math.min(options.size ?? 100, 1000)),
    page: String(Math.max(1, options.page ?? 1)),
    geometry: options.geometry ? "true" : "false",
    attribute: "true",
    crs: "EPSG:4326",
  });

  if (options.attrFilter) params.set("attrFilter", options.attrFilter);
  if (options.geomFilter) params.set("geomFilter", options.geomFilter);

  const res = await fetch(`${VWORLD_DATA_BASE}?${params.toString()}`, {
    next: { revalidate: 3600 },
  });

  if (!res.ok) {
    throw new VworldApiError("HTTP_ERROR", `HTTP ${res.status} for ${options.data}`);
  }

  const json = (await res.json()) as VworldDataResponse;
  const status = json.response?.status;
  if (status !== "OK") {
    throw new VworldApiError(
      json.response?.error?.code ?? "API_ERROR",
      json.response?.error?.text ?? `VWorld ${options.data} failed`,
    );
  }

  const fc = json.response?.result?.featureCollection ?? { type: "FeatureCollection", features: [] };
  return {
    totalFeatureCount: json.response?.result?.totalFeatureCount,
    featureCollection: fc,
  };
}

export async function probeVworldDataset(dataLayer: string): Promise<boolean> {
  if (!isVworldConfigured()) return false;
  try {
    await fetchVworldGetFeature({ data: dataLayer, page: 1, size: 1, geometry: false });
    return true;
  } catch {
    return false;
  }
}
