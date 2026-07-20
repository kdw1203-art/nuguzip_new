import { MapClient, type DanjiItem, type TradeItem } from "./map-client";
import {
  searchComplexes,
  getTransactionHistory,
  type ComplexRow,
  type ComplexTransactionRow,
} from "@/lib/complex/complex-store";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "지도 탐색 | 누구집",
  description: "지도에서 단지 시세·실거래·임장노트를 한 번에 탐색하세요.",
};

/* ===== 목업 폴백 (DB/env 없을 때) — 관양동 시안 데이터 ===== */
const FALLBACK_DANJI: DanjiItem[] = [
  {
    id: "mock-gongjak",
    name: "공작아파트",
    note: "노트 3",
    meta: "1988년 · 1,486세대 · 용적률 199%",
    price: "8.4억",
    delta: "▼ 2.1%",
    deltaTone: "down",
    size: "84㎡",
    lat: 37.3946,
    lng: 126.9707,
    avgPriceWon: 840_000_000,
    momPct: -2.1,
    areaM2: 84,
    buildYear: 1988,
    households: 1486,
    buildingType: "아파트",
    trades: [],
  },
  {
    id: "mock-hangaram",
    name: "한가람세경",
    note: null,
    meta: "1992년 · 918세대 · 용적률 214%",
    price: "7.9억",
    delta: "▲ 0.8%",
    deltaTone: "up",
    size: "84㎡",
    lat: 37.3921,
    lng: 126.975,
    avgPriceWon: 790_000_000,
    momPct: 0.8,
    areaM2: 84,
    buildYear: 1992,
    households: 918,
    buildingType: "아파트",
    trades: [],
  },
  {
    id: "mock-dongpyeon3",
    name: "동편마을 3단지",
    note: "노트 1",
    meta: "2012년 · 762세대 · 용적률 179%",
    price: "10.2억",
    delta: "▼ 1.4%",
    deltaTone: "down",
    size: "84㎡",
    lat: 37.4003,
    lng: 126.9605,
    avgPriceWon: 1_020_000_000,
    momPct: -1.4,
    areaM2: 84,
    buildYear: 2012,
    households: 762,
    buildingType: "아파트",
    trades: [],
  },
];

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

/** Supabase(구 lib)에서 단지 목록 + 실거래 시세 로드. 실패/빈 결과 시 null. */
async function loadDanjiFromDb(): Promise<{ items: DanjiItem[]; region: string } | null> {
  try {
    // 시안 지역(안양 동안구) 우선 → 없으면 전체에서 조회
    let rows = await searchComplexes("", "동안구", 24);
    if (rows.length === 0) rows = await searchComplexes("", "", 24);
    const withCoords = rows.filter((r) => r.lat !== null && r.lng !== null);
    if (withCoords.length === 0) return null;

    const top = withCoords.slice(0, 16);
    const items = await Promise.all(
      top.map(async (row) => {
        const tx = await getTransactionHistory(row.id, 6).catch(
          () => [] as ComplexTransactionRow[],
        );
        return toDanjiItem(row, tx);
      }),
    );

    // 최빈 지역명으로 패널 헤더 라벨
    const counts = new Map<string, number>();
    for (const r of top) {
      const key = r.district || r.city;
      if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    let region = "관양동";
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
  const db = await loadDanjiFromDb();
  return (
    <MapClient danji={db?.items ?? FALLBACK_DANJI} regionLabel={db?.region ?? "관양동"} />
  );
}
