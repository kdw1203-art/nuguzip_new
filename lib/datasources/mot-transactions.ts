import { getBackendMode, type DataEnvelope, type LocationRef } from "./types";
import { isSeoulApiConfigured } from "@/lib/seoul/openapi-client";
import { fetchRtmsSale } from "@/lib/seoul/adapters";
import { fetchMolitAptTrade } from "@/lib/national-data/molit-api";
import { isDataGoKrEncodingConfigured } from "@/lib/public-data/data-go-kr-keys";

/**
 * 국토교통부 / 서울시 실거래가.
 * MOLIT_SERVICE_KEY(인코딩) 설정 시 국토부 API 우선, 서울 Open API fallback.
 */

export type RealEstateTrade = {
  complexName: string;
  dealDate: string;
  priceKrw: number;
  sizeM2: number;
  floor: number;
  tradeType: "매매" | "전세" | "월세";
};

export type RealEstateSummary = {
  location: LocationRef;
  averagePricePerM2: number;
  monthOverMonthPct: number;
  recentTrades: RealEstateTrade[];
  tradeCount30d: number;
};

function mockRealEstate(location: LocationRef): RealEstateSummary {
  const seed = `${location.city}${location.district ?? ""}`.length;
  const base = 2200 + (seed % 18) * 180;
  const mom = ((seed % 7) - 3) * 0.35;
  const complexes = ["래미안", "자이", "푸르지오", "힐스테이트", "더샵", "트리마제", "롯데캐슬"];
  const sizes = [59.9, 74.8, 84.9, 99.1, 114.7];
  const now = new Date();
  const trades: RealEstateTrade[] = Array.from({ length: 6 }, (_, i) => {
    const size = sizes[(seed + i) % sizes.length];
    const price = Math.round(base * size * (0.98 + ((seed + i) % 7) / 100)) / 10_000;
    const d = new Date(now);
    d.setDate(d.getDate() - i * 4 - (seed % 5));
    return {
      complexName: `${location.district ?? location.city} ${complexes[(seed + i) % complexes.length]}`,
      dealDate: d.toISOString().slice(0, 10),
      priceKrw: Math.round(price * 10_000),
      sizeM2: size,
      floor: 3 + ((seed + i) % 20),
      tradeType: i % 4 === 0 ? "전세" : "매매",
    };
  });

  return {
    location,
    averagePricePerM2: base * 10_000,
    monthOverMonthPct: Math.round(mom * 100) / 100,
    recentTrades: trades,
    tradeCount30d: 48 + (seed % 30),
  };
}

function formatContractDay(day: string): string {
  if (day.length !== 8) return day;
  return `${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)}`;
}

function molitRowToTrade(r: Record<string, unknown>, district: string): RealEstateTrade {
  const dealAmount = String(r.dealAmount ?? "").replace(/,/g, "");
  const priceManwon = Number.parseInt(dealAmount, 10) || 0;
  const year = String(r.dealYear ?? "");
  const month = String(r.dealMonth ?? "").padStart(2, "0");
  const day = String(r.dealDay ?? "").padStart(2, "0");
  const area = Number.parseFloat(String(r.excluUseAr ?? "84")) || 84;
  return {
    complexName: String(r.aptNm ?? `${district} 아파트`),
    dealDate: year && month && day ? `${year}-${month}-${day}` : new Date().toISOString().slice(0, 10),
    priceKrw: priceManwon * 10_000,
    sizeM2: area,
    floor: Number.parseInt(String(r.floor ?? "0"), 10) || 0,
    tradeType: "매매",
  };
}

function molitSummaryFromRows(
  location: LocationRef,
  rows: Record<string, unknown>[],
): RealEstateSummary {
  const trades = rows.slice(0, 8).map((r) => molitRowToTrade(r, location.district ?? location.city));
  const prices = trades.map((t) => t.priceKrw / Math.max(t.sizeM2, 1));
  const avgPricePerM2 =
    prices.length > 0 ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : 0;
  return {
    location,
    averagePricePerM2: avgPricePerM2,
    monthOverMonthPct: 0,
    recentTrades: trades,
    tradeCount30d: rows.length,
  };
}

export async function getRealEstateSummary(
  location: LocationRef,
): Promise<DataEnvelope<RealEstateSummary>> {
  if (isDataGoKrEncodingConfigured()) {
    try {
      const molit = await fetchMolitAptTrade({ district: location.district });
      if (molit.mode === "live" && molit.rows.length > 0) {
        const data = molitSummaryFromRows(location, molit.rows);
        return {
          source: "mot-transactions",
          sourceLabel: "국토교통부 실거래가",
          unit: "KRW_PER_M2",
          viz: "card_number",
          updatedAt: new Date().toISOString().slice(0, 10),
          mode: "live",
          attribution: "국토교통부 실거래가 공개시스템 (apis.data.go.kr)",
          isLocationBased: true,
          data,
        };
      }
    } catch {
      // fall through to Seoul
    }
  }

  const seoulKey = "SEOUL_DATA_API_KEY";
  const mode = getBackendMode(seoulKey);

  if (mode === "live" && isSeoulApiConfigured()) {
    try {
      const sale = await fetchRtmsSale({
        city: location.city,
        district: location.district,
      });
      const recentTrades: RealEstateTrade[] = sale.rows.slice(0, 8).map((r) => ({
        complexName: r.buildingName || `${r.district} ${r.dong}`,
        dealDate: formatContractDay(r.contractDay),
        priceKrw: r.priceManwon * 10_000,
        sizeM2: r.archArea,
        floor: r.floor,
        tradeType: sale.sourceService.includes("V") ? "전세" : "매매",
      }));
      const months = sale.months;
      const mom =
        months.length >= 2
          ? Math.round(
              ((months[months.length - 1].avgPrice - months[months.length - 2].avgPrice) /
                Math.max(months[months.length - 2].avgPrice, 1)) *
                10000,
            ) / 100
          : 0;

      return {
        source: "mot-transactions",
        sourceLabel: "서울 실거래가",
        unit: "KRW_PER_M2",
        viz: "card_number",
        updatedAt: new Date().toISOString().slice(0, 10),
        mode: "live",
        attribution: `서울열린데이터광장 (${sale.sourceService})`,
        isLocationBased: true,
        data: {
          location,
          averagePricePerM2: sale.avgPricePerM2,
          monthOverMonthPct: mom,
          recentTrades,
          tradeCount30d: sale.tradeCount30d,
        },
      };
    } catch {
      // fall through
    }
  }

  return {
    source: "mot-transactions",
    sourceLabel: "국토교통부 실거래가",
    unit: "KRW_PER_M2",
    viz: "card_number",
    updatedAt: new Date().toISOString().slice(0, 10),
    mode: "mock",
    attribution: "국토교통부 실거래가 공개시스템 (rt.molit.go.kr)",
    isLocationBased: true,
    data: mockRealEstate(location),
  };
}
