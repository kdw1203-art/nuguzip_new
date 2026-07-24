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

/* 사실 우선: 여기 있던 mockRealEstate() 를 삭제했다.
   시드 난수로 "강남구 래미안 · 2026-07-15 · 8.4억 · 84.9㎡ · 12층 · 매매" 같은
   실거래 레코드 6건을 지어냈다. 실존 브랜드명(래미안·자이·푸르지오·힐스테이트·
   더샵·트리마제·롯데캐슬)과 실제 구 이름을 붙였고, 무엇보다 이 응답이
   sourceLabel "국토교통부 실거래가" + attribution "국토교통부 실거래가 공개시스템"
   을 달고 나갔다. 정부 출처를 붙인 채 날짜·가격·층수까지 있는 가짜 계약 기록을
   내보내는 것은 이 서비스에서 할 수 있는 최악의 거짓말이다.
   실거래는 실제로 받아온 것만 내보낸다 — 없으면 빈 목록이다. */
function unavailableRealEstate(location: LocationRef): RealEstateSummary {
  return {
    location,
    averagePricePerM2: 0,
    monthOverMonthPct: 0,
    recentTrades: [],
    tradeCount30d: 0,
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

  // 실거래를 못 받아온 상태 — 정부 출처 표기를 달지 않는다(그 데이터가 아니므로).
  return {
    source: "mot-transactions",
    sourceLabel: "실거래가 (미연동)",
    unit: "KRW_PER_M2",
    viz: "card_number",
    updatedAt: new Date().toISOString().slice(0, 10),
    mode: "mock",
    attribution: "API 키 미설정 — 실거래 데이터를 불러오지 못했습니다",
    isLocationBased: true,
    data: unavailableRealEstate(location),
  };
}
