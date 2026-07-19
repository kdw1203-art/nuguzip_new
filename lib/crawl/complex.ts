import "server-only";
import { upsertComplexPrices, logIngest, type ComplexPriceRow } from "@/lib/market/store";
import { matchRegionByName } from "@/lib/market/region-code";
import { logger } from "@/lib/log";

export type ComplexCrawlResult = {
  ok: boolean;
  status: "ok" | "skipped" | "error";
  rows: number;
  message: string;
};

/**
 * best-effort 단지 시세 크롤. 기본은 비활성(스킵)이며, 운영자가 아래 환경변수를
 * 설정했을 때만 동작한다. KB/포털의 비공식 JSON 엔드포인트는 변동 가능성이 크므로
 * 실패해도 앱 전체에는 영향이 없도록 graceful 하게 처리한다.
 *
 *  - KB_CRAWL_ENABLED=1                크롤 활성화 게이트
 *  - KB_COMPLEX_API_URL=...{regionCode} 단지 시세 JSON 엔드포인트 (선택)
 */
export function isComplexCrawlEnabled(): boolean {
  return process.env.KB_CRAWL_ENABLED === "1" || process.env.KB_CRAWL_ENABLED === "true";
}

type RawComplex = {
  id?: string | number;
  complexId?: string | number;
  name?: string;
  복합명?: string;
  단지명?: string;
  region?: string;
  district?: string;
  lat?: number;
  lng?: number;
  areaM2?: number;
  saleGeneral?: number;
  jeonseGeneral?: number;
  [k: string]: unknown;
};

function toRow(raw: RawComplex): ComplexPriceRow | null {
  const id = String(raw.complexId ?? raw.id ?? "").trim();
  const name = String(raw.name ?? raw.단지명 ?? raw.복합명 ?? "").trim();
  if (!id || !name) return null;
  const regionName = String(raw.district ?? raw.region ?? "").trim();
  const matched = regionName ? matchRegionByName(regionName) : null;
  return {
    source: "crawl",
    complexId: id,
    name,
    regionId: matched?.id,
    lat: typeof raw.lat === "number" ? raw.lat : undefined,
    lng: typeof raw.lng === "number" ? raw.lng : undefined,
    areaM2: typeof raw.areaM2 === "number" ? raw.areaM2 : undefined,
    saleGeneral: typeof raw.saleGeneral === "number" ? raw.saleGeneral : undefined,
    jeonseGeneral: typeof raw.jeonseGeneral === "number" ? raw.jeonseGeneral : undefined,
  };
}

export async function crawlComplexPrices(): Promise<ComplexCrawlResult> {
  if (!isComplexCrawlEnabled()) {
    return {
      ok: true,
      status: "skipped",
      rows: 0,
      message: "KB_CRAWL_ENABLED 미설정 — 단지 크롤 비활성. 관리자 업로드(R-ONE/KB 엑셀)를 사용하세요.",
    };
  }
  const urlTemplate = process.env.KB_COMPLEX_API_URL;
  if (!urlTemplate) {
    return {
      ok: true,
      status: "skipped",
      rows: 0,
      message: "KB_COMPLEX_API_URL 미설정 — 단지 시세 엔드포인트가 없어 스킵.",
    };
  }

  try {
    const res = await fetch(urlTemplate, {
      headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as unknown;
    const list: RawComplex[] = Array.isArray(json)
      ? (json as RawComplex[])
      : Array.isArray((json as { dataBody?: { data?: RawComplex[] } })?.dataBody?.data)
        ? ((json as { dataBody: { data: RawComplex[] } }).dataBody.data)
        : [];
    const rows = list.map(toRow).filter((r): r is ComplexPriceRow => r != null);
    const n = await upsertComplexPrices(rows);
    await logIngest({ source: "crawl", dataset: "complex", origin: "crawl", rows: n, status: "ok" });
    return { ok: true, status: "ok", rows: n, message: `단지 ${n}건 갱신` };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger.warn("[crawl.complex] failed", message);
    await logIngest({ source: "crawl", dataset: "complex", origin: "crawl", rows: 0, status: "error", message });
    return { ok: false, status: "error", rows: 0, message };
  }
}
