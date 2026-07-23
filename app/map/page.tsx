import { MapClient, type DanjiItem, type TradeItem } from "./map-client";
import {
  getTransactionHistory,
  encodeComplexId,
  type ComplexRow,
  type ComplexTransactionRow,
} from "@/lib/complex/complex-store";
import { loadRegionMarketMarkers } from "@/lib/map/region-market";
import { backfillGeocode } from "@/lib/map/complex-geocode";
import { getServiceSupabase } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "지도 탐색 | 누구집",
  description: "지도에서 단지 시세·실거래·임장노트를 한 번에 탐색하세요.",
};

/** 만원 단위 → "8.4억" / "8,200만" 라벨 */
function formatManwon(manwon: number): string {
  if (!Number.isFinite(manwon) || manwon <= 0) return "—";
  if (manwon >= 10_000) return `${(manwon / 10_000).toFixed(1).replace(/\.0$/, "")}억`;
  return `${Math.round(manwon).toLocaleString("ko-KR")}만`;
}

function pctDelta(curr: number, prev: number | undefined): number | null {
  if (!prev || prev <= 0 || !Number.isFinite(curr)) return null;
  return Math.round(((curr - prev) / prev) * 1000) / 10;
}

function deltaLabel(pct: number | null): { delta: string; tone: "up" | "down" | "flat" } {
  if (pct === null || pct === 0) return { delta: "—", tone: "flat" };
  return pct > 0
    ? { delta: `▲ ${Math.abs(pct).toFixed(1)}%`, tone: "up" }
    : { delta: `▼ ${Math.abs(pct).toFixed(1)}%`, tone: "down" };
}

function toTrades(tx: ComplexTransactionRow[]): TradeItem[] {
  // getTransactionHistory 는 과거→최신 순으로 반환 — 최신 3건을 최신순으로
  const items: TradeItem[] = [];
  for (let i = tx.length - 1; i >= 0 && items.length < 3; i--) {
    const row = tx[i];
    const prev = i > 0 ? tx[i - 1].avg_manwon : undefined;
    const { delta, tone } = deltaLabel(pctDelta(row.avg_manwon, prev));
    items.push({
      date: `${row.yyyymm.slice(0, 4)}.${row.yyyymm.slice(4, 6)}`,
      price: formatManwon(row.avg_manwon),
      sub: `${row.deal_count}건`,
      delta,
      tone,
    });
  }
  return items;
}

function toDanjiItem(row: ComplexRow, tx: ComplexTransactionRow[]): DanjiItem {
  const latest = tx.length > 0 ? tx[tx.length - 1] : null;
  const prev = tx.length > 1 ? tx[tx.length - 2] : null;
  const momPct = latest ? pctDelta(latest.avg_manwon, prev?.avg_manwon) : null;
  const { delta, tone } = deltaLabel(momPct);
  const metaParts = [
    row.build_year ? `${row.build_year}년` : null,
    row.households ? `${row.households.toLocaleString("ko-KR")}세대` : null,
    row.district || null,
  ].filter((v): v is string => Boolean(v));
  return {
    id: row.id,
    name: row.name,
    note: null,
    meta: metaParts.length > 0 ? metaParts.join(" · ") : "정보 준비 중",
    price: latest ? formatManwon(latest.avg_manwon) : "시세 준비 중",
    delta,
    deltaTone: tone,
    size: latest?.area_m2 ? `${Math.round(latest.area_m2)}㎡` : "전체 평균",
    lat: row.lat as number,
    lng: row.lng as number,
    avgPriceWon: latest ? latest.avg_manwon * 10_000 : null,
    momPct,
    areaM2: latest?.area_m2 ?? null,
    buildYear: row.build_year,
    households: row.households,
    buildingType: row.building_type ?? null,
    trades: toTrades(tx),
  };
}

/** region_name("서울 송파구") → city/district */
function splitRegion(region: string): { city: string; district: string } {
  const parts = region.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { city: region, district: region };
  return { city: parts[0], district: parts.slice(1).join(" ") };
}

/** 좌표 캐시(complex_geocode)에 저장된 지오코딩 완료 단지 조회 */
async function loadGeocodedComplexes(
  limit: number,
): Promise<{ region_name: string; complex_name: string; lat: number; lng: number }[]> {
  const sb = getServiceSupabase();
  if (!sb) return [];
  const { data } = await sb
    .from("complex_geocode")
    .select("region_name, complex_name, lat, lng")
    .eq("status", "ok")
    .not("lat", "is", null)
    .order("trade_count", { ascending: false, nullsFirst: false })
    .limit(limit);
  return (
    (data as
      | { region_name: string; complex_name: string; lat: number; lng: number }[]
      | null) ?? []
  ).filter((g) => g.complex_name && Number.isFinite(g.lat) && Number.isFinite(g.lng));
}

/**
 * 실거래·지오코딩 좌표 기반 지도 단지 로드.
 * 좌표 캐시가 비어 있으면 상위 거래량 단지를 소량 인라인 지오코딩(1회 부트스트랩) 후 재조회.
 * 이후는 캐시만 읽어 빠르게 동작 — 대량 백필은 cron(geocode-complexes)이 담당.
 */
async function loadDanjiFromDb(): Promise<{ items: DanjiItem[]; region: string } | null> {
  try {
    let geo = await loadGeocodedComplexes(30);
    if (geo.length === 0) {
      // 최초 진입 부트스트랩 — 캐시가 비었을 때만 소량 지오코딩(이후엔 캐시·cron 사용)
      await backfillGeocode(12).catch(() => undefined);
      geo = await loadGeocodedComplexes(30);
    }
    if (geo.length === 0) return null;

    const items = await Promise.all(
      geo.map(async (g) => {
        const id = encodeComplexId(g.region_name, g.complex_name);
        const tx = await getTransactionHistory(id, 6).catch(
          () => [] as ComplexTransactionRow[],
        );
        const { city, district } = splitRegion(g.region_name);
        const row: ComplexRow = {
          id,
          kapt_code: null,
          name: g.complex_name,
          city,
          district,
          address: null,
          road_address: null,
          lat: g.lat,
          lng: g.lng,
          building_type: "아파트",
          build_year: null,
          total_floors: null,
          households: null,
          parking_per_hh: null,
          builder_name: null,
          heating: null,
        };
        return toDanjiItem(row, tx);
      }),
    );

    // 패널 헤더 라벨 — 최빈 시/도
    const counts = new Map<string, number>();
    for (const g of geo) {
      const { city } = splitRegion(g.region_name);
      if (city) counts.set(city, (counts.get(city) ?? 0) + 1);
    }
    let region = "수도권";
    let best = 0;
    for (const [k, n] of counts) {
      if (n > best) {
        best = n;
        region = k;
      }
    }
    return { items, region };
  } catch {
    return null;
  }
}

export default async function MapPage() {
  // 사실 우선: DB 조회 실패/빈 결과 시 허위 단지(공작아파트 등) 대신 빈 목록 — 지도만 표시
  const [db, regionMarkers] = await Promise.all([
    loadDanjiFromDb(),
    loadRegionMarketMarkers().catch(() => []),
  ]);
  return (
    <MapClient
      danji={db?.items ?? []}
      regionLabel={db?.region ?? "수도권"}
      regionMarkers={regionMarkers}
    />
  );
}
