/**
 * GET /api/map/regions?city=서울&district=강남구
 * 지역 부동산 요약 + 편의시설 정보 반환.
 *
 * 사실 우선: 이 라우트에 있던 허구 생성기를 전부 제거했다.
 *  - `base = seoulData?.avgPricePerM2 ?? 10_000_000` — 근거 없는 ㎡당 1천만원 기본값.
 *  - `mockHistory()` — 시드 난수로 ±1.5% 흔들어 만든 12개월 "시세 추이" 차트.
 *  - `seededIntRange()` 로 만든 학교·병원·지하철·공원·편의점 / 재개발 건수.
 *    이건 `dataMode: "live"` 응답 안에서도 그대로 나갔다 — 실데이터라고 라벨을
 *    붙인 채 지어낸 숫자를 섞어 내보내는 것이 가장 나쁘다.
 * 이제 모르는 값은 null 로 내보내고, 아무것도 모르면 dataMode: "unavailable" 이다.
 * 숫자를 만들어내느니 비워서 보낸다.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { applyRateLimit, READ_RATE_LIMIT } from "@/lib/rate-limit";
import { SEOUL_DISTRICTS, METRO_EXPLORE_DISTRICTS } from "@/lib/map/seoul-districts";
import { fetchPublicData, isPublicDataLive } from "@/lib/public-data";
import { getRegionSnapshot, getRegionSeries } from "@/lib/market/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface RegionSummary {
  district: string;
  city: string;
  /** ㎡당 매매가(원) — 모르면 null */
  avgPricePerM2: number | null;
  /** 전월 대비 변동률(%) — 모르면 null */
  momPct: number | null;
  /** 최근 집계 거래 건수 — 모르면 null */
  tradeCount30d: number | null;
  /** ㎡당 전세 보증금(원) — 전세가율을 아는 경우에만 */
  avgDeposit: number | null;
  /** 편의시설 — 공공데이터 미연동이면 null (0 으로 위장하지 않는다) */
  facilities: {
    schools: number;
    hospitals: number;
    subways: number;
    parks: number;
    convenience: number;
  } | null;
  /** 재개발/재건축 — 공공데이터 미연동이면 null */
  redevelopment: {
    active: number;
    planned: number;
  } | null;
  /** 실제 지수 시계열로만 구성. 없으면 빈 배열 (가짜 곡선을 그리지 않는다) */
  priceHistory: Array<{ yyyymm: string; avgPricePerM2: number }>;
  dataMode: "live" | "unavailable";
  /** 값이 비어 있는 이유를 클라이언트가 문구로 쓸 수 있게 */
  source: string | null;
}

const ALL_DISTRICTS = [...SEOUL_DISTRICTS, ...METRO_EXPLORE_DISTRICTS];

function emptySummary(district: string, city: string): RegionSummary {
  return {
    district: district || "전체",
    city,
    avgPricePerM2: null,
    momPct: null,
    tradeCount30d: null,
    avgDeposit: null,
    facilities: null,
    redevelopment: null,
    priceHistory: [],
    dataMode: "unavailable",
    source: null,
  };
}

export async function GET(req: NextRequest) {
  const limited = await applyRateLimit(req, READ_RATE_LIMIT);
  if (limited) return limited;

  const city = req.nextUrl.searchParams.get("city")?.trim() ?? "서울";
  const district = req.nextUrl.searchParams.get("district")?.trim() ?? "";

  const known = ALL_DISTRICTS.find((d) => d.name === district || d.id === district);

  // ── 1순위: 한국부동산원(REB)·KB 실집계 ──
  const marketSnap = known?.id ? await getRegionSnapshot(known.id).catch(() => null) : null;

  if (marketSnap && (marketSnap.perM2Sale || typeof marketSnap.saleChangeMonthly === "number")) {
    const m2 =
      marketSnap.perM2Sale && marketSnap.perM2Sale > 0 ? Math.round(marketSnap.perM2Sale) : null;

    // 시세 추이는 실제 매매가격지수 시계열이 있을 때만 그린다.
    const idxSeries = await getRegionSeries(known!.id, "sale_index", "monthly", 12).catch(() => []);
    const latestIdx = idxSeries.length ? idxSeries[idxSeries.length - 1].value : 0;
    const priceHistory =
      m2 && idxSeries.length && latestIdx
        ? idxSeries.map((p) => ({
            yyyymm: p.period.replace(/-/g, "").slice(0, 6),
            avgPricePerM2: Math.round(m2 * (p.value / latestIdx)),
          }))
        : [];

    // 전세 보증금은 실제 전세가율이 있을 때만 환산한다(0.6 같은 임의 계수 금지).
    const avgDeposit =
      m2 && marketSnap.jeonseRatio
        ? Math.round((m2 * marketSnap.jeonseRatio) / 100 / 10_000) * 10_000
        : null;

    // 편의시설·재개발은 이 스냅샷의 소관이 아니다 — 공공데이터가 붙어 있을 때만 조회.
    const [facilities, redevelopment] = await Promise.all([
      loadFacilities(city, district),
      loadRedevelopment(city, district),
    ]);

    const summary: RegionSummary = {
      district: known?.name ?? district,
      city,
      avgPricePerM2: m2,
      momPct:
        typeof marketSnap.saleChangeMonthly === "number" ? marketSnap.saleChangeMonthly : null,
      tradeCount30d:
        typeof marketSnap.tradeCount === "number" ? Math.round(marketSnap.tradeCount) : null,
      avgDeposit,
      facilities,
      redevelopment,
      priceHistory,
      dataMode: "live",
      source: marketSnap.source ?? "reb",
    };
    return NextResponse.json(summary, {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=600",
        "X-Data-Mode": `market-${marketSnap.source}`,
      },
    });
  }

  // ── 2순위: 국토부 실거래 공공데이터 ──
  if (isPublicDataLive("mot-transactions") && district) {
    const motEnv = await fetchPublicData("mot-transactions", { city, district }).catch(() => null);
    const mot = (motEnv?.data ?? {}) as {
      avgPricePerM2?: number;
      tradeCount30d?: number;
      months?: Array<{ yyyymm: string; avgPrice: number; count: number }>;
      mode?: string;
    };

    // 목업 모드로 돌아온 응답은 실데이터가 아니다 — 받아서 내보내지 않는다.
    if (mot.mode !== "mock") {
      const months = mot.months ?? [];
      const momPct =
        months.length >= 2
          ? Math.round(
              ((months[months.length - 1].avgPrice - months[months.length - 2].avgPrice) /
                Math.max(months[months.length - 2].avgPrice, 1)) *
                10000,
            ) / 100
          : null;

      const m2 = typeof mot.avgPricePerM2 === "number" && mot.avgPricePerM2 > 0
        ? mot.avgPricePerM2
        : null;

      if (m2 !== null || months.length > 0) {
        const [facilities, redevelopment] = await Promise.all([
          loadFacilities(city, district),
          loadRedevelopment(city, district),
        ]);

        const summary: RegionSummary = {
          district: known?.name ?? district,
          city,
          avgPricePerM2: m2,
          momPct,
          tradeCount30d: typeof mot.tradeCount30d === "number" ? mot.tradeCount30d : null,
          // 전세가율을 모르므로 보증금을 추정하지 않는다.
          avgDeposit: null,
          facilities,
          redevelopment,
          priceHistory: months.map((m) => ({ yyyymm: m.yyyymm, avgPricePerM2: m.avgPrice })),
          dataMode: "live",
          source: "molit",
        };

        return NextResponse.json(summary, {
          headers: {
            "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=600",
            "X-Data-Mode": "live",
          },
        });
      }
    }
  }

  // ── 아는 것이 없음 ── 지어낸 요약 대신 빈 요약을 명시적으로 알린다.
  return NextResponse.json(emptySummary(known?.name ?? district, city), {
    headers: { "X-Data-Mode": "unavailable" },
  });
}

/** 편의시설 — 공공데이터가 실제로 연동돼 있을 때만. 아니면 null. */
async function loadFacilities(
  city: string,
  district: string,
): Promise<RegionSummary["facilities"]> {
  if (!district || !isPublicDataLive("facilities")) return null;
  const env = await fetchPublicData("facilities", { city, district }).catch(() => null);
  const fac = env?.data as
    | {
        hospitals?: number;
        subwayStations?: number;
        parks?: number;
        schools?: number;
        convenienceStores?: number;
        pharmacies?: number;
        mode?: string;
      }
    | undefined;
  if (!fac || fac.mode === "mock") return null;
  return {
    schools: fac.schools ?? 0,
    hospitals: fac.hospitals ?? 0,
    subways: fac.subwayStations ?? 0,
    parks: fac.parks ?? 0,
    convenience: (fac.convenienceStores ?? 0) + (fac.pharmacies ?? 0),
  };
}

/** 재개발·재건축 — 공공데이터가 실제로 연동돼 있을 때만. 아니면 null. */
async function loadRedevelopment(
  city: string,
  district: string,
): Promise<RegionSummary["redevelopment"]> {
  if (!district || !isPublicDataLive("redevelopment")) return null;
  const env = await fetchPublicData("redevelopment", { city, district }).catch(() => null);
  const redev = env?.data as
    | { activeProjects?: number; plannedProjects?: number; mode?: string }
    | undefined;
  if (!redev || redev.mode === "mock") return null;
  return {
    active: redev.activeProjects ?? 0,
    planned: redev.plannedProjects ?? 0,
  };
}
