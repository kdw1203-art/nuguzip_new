/**
 * GET /api/map/regions?city=서울&district=강남구
 * 지역 부동산 요약 + 편의시설 정보 반환.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { applyRateLimit, READ_RATE_LIMIT } from "@/lib/rate-limit";
import { SEOUL_DISTRICTS } from "@/lib/map/seoul-districts";
import { fetchPublicData, isPublicDataLive } from "@/lib/public-data";
import { getRegionSnapshot, getRegionSeries } from "@/lib/market/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface RegionSummary {
  district: string;
  city: string;
  avgPricePerM2: number;
  momPct: number;
  tradeCount30d: number;
  avgDeposit?: number;
  avgRent?: number;
  facilities: {
    schools: number;
    hospitals: number;
    subways: number;
    parks: number;
    convenience: number;
  };
  redevelopment: {
    active: number;
    planned: number;
  };
  priceHistory: Array<{ yyyymm: string; avgPricePerM2: number }>;
  dataMode: "live" | "mock";
}

/** 지역 키로 결정적 의사난수 — 요청마다 값이 바뀌어 차트가 흔들리거나
 *  하이드레이션이 어긋나는 문제를 막는다. */
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededIntRange(rng: () => number, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function mockHistory(
  base: number,
  seedKey: string,
): Array<{ yyyymm: string; avgPricePerM2: number }> {
  const result = [];
  const now = new Date();
  const rng = mulberry32(hashStr(`history:${seedKey}`));
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now);
    d.setMonth(d.getMonth() - i);
    const yyyymm = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
    const fluctuation = 1 + (rng() - 0.5) * 0.03;
    result.push({ yyyymm, avgPricePerM2: Math.round(base * fluctuation) });
  }
  return result;
}

export async function GET(req: NextRequest) {
  const limited = await applyRateLimit(req, READ_RATE_LIMIT);
  if (limited) return limited;

  const city = req.nextUrl.searchParams.get("city")?.trim() ?? "서울";
  const district = req.nextUrl.searchParams.get("district")?.trim() ?? "";

  const seoulData = SEOUL_DISTRICTS.find(
    (d) => d.name === district || d.id === district,
  );

  const base = seoulData?.avgPricePerM2 ?? 10_000_000;

  // ── 한국부동산원(R-ONE)·KB 실데이터 우선 ──
  const marketSnap = seoulData?.id
    ? await getRegionSnapshot(seoulData.id).catch(() => null)
    : null;
  if (marketSnap && (marketSnap.perM2Sale || typeof marketSnap.saleChangeMonthly === "number")) {
    const seedKey = seoulData?.id ?? district ?? city ?? "전체";
    const m2 = marketSnap.perM2Sale && marketSnap.perM2Sale > 0 ? Math.round(marketSnap.perM2Sale) : base;
    const idxSeries = await getRegionSeries(seoulData!.id, "sale_index", "monthly", 12).catch(() => []);
    const latestIdx = idxSeries.length ? idxSeries[idxSeries.length - 1].value : 0;
    const priceHistory = idxSeries.length && latestIdx
      ? idxSeries.map((p) => ({
          yyyymm: p.period.replace(/-/g, "").slice(0, 6),
          avgPricePerM2: Math.round(m2 * (p.value / latestIdx)),
        }))
      : mockHistory(m2, seedKey);
    const facRng = mulberry32(hashStr(`facilities:${seedKey}`));
    const redevRng = mulberry32(hashStr(`redev:${seedKey}`));
    const depositPerM2 = marketSnap.jeonseRatio
      ? Math.round((m2 * marketSnap.jeonseRatio) / 100 / 10_000) * 10_000
      : Math.round((m2 * 0.6) / 10_000) * 10_000;
    const summary: RegionSummary = {
      district: seoulData?.name ?? district,
      city,
      avgPricePerM2: m2,
      momPct: typeof marketSnap.saleChangeMonthly === "number" ? marketSnap.saleChangeMonthly : seoulData?.momPct ?? 0,
      tradeCount30d: typeof marketSnap.tradeCount === "number" ? Math.round(marketSnap.tradeCount) : seoulData?.tradeCount30d ?? 30,
      avgDeposit: depositPerM2,
      avgRent: Math.round((m2 * 0.005) / 1_000) * 1_000,
      facilities: {
        schools: seededIntRange(facRng, 5, 24),
        hospitals: seededIntRange(facRng, 3, 17),
        subways: seededIntRange(facRng, 1, 8),
        parks: seededIntRange(facRng, 2, 11),
        convenience: seededIntRange(facRng, 10, 39),
      },
      redevelopment: {
        active: seededIntRange(redevRng, 0, 4),
        planned: seededIntRange(redevRng, 0, 7),
      },
      priceHistory,
      dataMode: "live",
    };
    return NextResponse.json(summary, {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=600",
        "X-Data-Mode": `market-${marketSnap.source}`,
      },
    });
  }

  const live =
    isPublicDataLive("mot-transactions") &&
    isPublicDataLive("facilities") &&
    isPublicDataLive("redevelopment");

  if (live && district) {
    const [motEnv, facEnv, redevEnv] = await Promise.all([
      fetchPublicData("mot-transactions", { city, district }),
      fetchPublicData("facilities", { city, district }),
      fetchPublicData("redevelopment", { city, district }),
    ]);

    const mot = motEnv.data as {
      avgPricePerM2?: number;
      tradeCount30d?: number;
      months?: Array<{ yyyymm: string; avgPrice: number; count: number }>;
      mode?: string;
    };
    const fac = facEnv.data as {
      hospitals?: number;
      subwayStations?: number;
      parks?: number;
      schools?: number;
      convenienceStores?: number;
      pharmacies?: number;
    };
    const redev = redevEnv.data as {
      activeProjects?: number;
      plannedProjects?: number;
    };

    const months = mot.months ?? [];
    const momPct =
      months.length >= 2
        ? Math.round(
            ((months[months.length - 1].avgPrice - months[months.length - 2].avgPrice) /
              Math.max(months[months.length - 2].avgPrice, 1)) *
              10000,
          ) / 100
        : seoulData?.momPct ?? 0;

    const summary: RegionSummary = {
      district: seoulData?.name ?? district,
      city,
      avgPricePerM2: mot.avgPricePerM2 ?? base,
      momPct,
      tradeCount30d: mot.tradeCount30d ?? seoulData?.tradeCount30d ?? 30,
      avgDeposit: Math.round((mot.avgPricePerM2 ?? base) * 0.6 / 10_000) * 10_000,
      avgRent: Math.round((mot.avgPricePerM2 ?? base) * 0.005 / 1_000) * 1_000,
      facilities: {
        schools: fac.schools ?? 0,
        hospitals: fac.hospitals ?? 0,
        subways: fac.subwayStations ?? 0,
        parks: fac.parks ?? 0,
        convenience: (fac.convenienceStores ?? 0) + (fac.pharmacies ?? 0),
      },
      redevelopment: {
        active: redev.activeProjects ?? 0,
        planned: redev.plannedProjects ?? 0,
      },
      priceHistory: months.length
        ? months.map((m) => ({ yyyymm: m.yyyymm, avgPricePerM2: m.avgPrice }))
        : mockHistory(mot.avgPricePerM2 ?? base, seoulData?.id ?? district),
      dataMode: "live",
    };

    return NextResponse.json(summary, {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=600",
        "X-Data-Mode": "live",
      },
    });
  }

  const seedKey = seoulData?.id ?? district ?? city ?? "전체";
  const facRng = mulberry32(hashStr(`facilities:${seedKey}`));
  const redevRng = mulberry32(hashStr(`redev:${seedKey}`));

  const summary: RegionSummary = {
    district: seoulData?.name ?? district ?? "전체",
    city,
    avgPricePerM2: base,
    momPct: seoulData?.momPct ?? 0,
    tradeCount30d: seoulData?.tradeCount30d ?? 30,
    avgDeposit: Math.round(base * 0.6 / 10_000) * 10_000,
    avgRent: Math.round(base * 0.005 / 1_000) * 1_000,
    facilities: {
      schools: seededIntRange(facRng, 5, 24),
      hospitals: seededIntRange(facRng, 3, 17),
      subways: seededIntRange(facRng, 1, 8),
      parks: seededIntRange(facRng, 2, 11),
      convenience: seededIntRange(facRng, 10, 39),
    },
    redevelopment: {
      active: seededIntRange(redevRng, 0, 4),
      planned: seededIntRange(redevRng, 0, 7),
    },
    priceHistory: mockHistory(base, seedKey),
    dataMode: "mock",
  };

  return NextResponse.json(summary, {
    headers: { "X-Data-Mode": "mock" },
  });
}
