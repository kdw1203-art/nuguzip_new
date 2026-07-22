import "server-only";

import { getReadOnlySupabase } from "@/lib/newui/supabase-read";
import { listListingsInBounds } from "@/lib/listings/store-db";
import { logger } from "@/lib/log";
import type { RedevelopmentProject } from "./types";

/**
 * 정비사업 구역 ↔ 매물·실거래 연계.
 *
 * - 매물: 구역 좌표 기준 약 ±0.02°(≈2km) bbox 안의 승인 매물(listings, 좌표 필수).
 * - 실거래: 구역이 속한 시군구(region_name)의 최근 매매 실거래(market_transactions).
 *   market_transactions 에는 좌표가 없어 시군구 단위로 연결한다.
 */

export type NearbyTransaction = {
  complexName: string;
  areaM2: number | null;
  floor: number | null;
  dealAmountKrw: number | null;
  priceLabel: string;
  contractYmd: string;
};

export type NearbyListing = {
  id: string;
  listingType: string;
  complexName: string | null;
  priceLabel: string;
};

export type NearbyResult = {
  transactions: NearbyTransaction[];
  listings: NearbyListing[];
  regionLabel: string;
};

/** 원(₩) → "12.3억"/"8,200만" (없으면 "-") */
function eokMan(krw: number | null): string {
  if (krw == null || !Number.isFinite(krw) || krw <= 0) return "-";
  if (krw >= 100_000_000) {
    const eok = krw / 100_000_000;
    return `${eok >= 10 ? Math.round(eok).toLocaleString("ko-KR") : eok.toFixed(1)}억`;
  }
  return `${Math.round(krw / 10_000).toLocaleString("ko-KR")}만`;
}

function manwon(krw: number | null): string {
  if (krw == null || !Number.isFinite(krw) || krw <= 0) return "0";
  return Math.round(krw / 10_000).toLocaleString("ko-KR");
}

/** 시군구 → market_transactions.region_name 후보(표기 불일치 대응). */
function regionNameCandidates(sido: string, sigungu: string): string[] {
  const set = new Set<string>();
  if (sido && sigungu) set.add(`${sido} ${sigungu}`);
  if (sigungu) set.add(sigungu);
  if (sido === "경기") {
    const parts = sigungu.split(" ");
    const city = (parts[0] ?? "").replace(/시$/, "");
    const gu = parts[1] ?? "";
    set.add(gu ? `${city} ${gu}` : (parts[0] ?? ""));
  }
  return [...set].filter(Boolean);
}

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function fetchNearbyTransactions(p: RedevelopmentProject): Promise<NearbyTransaction[]> {
  const sb = getReadOnlySupabase();
  if (!sb) return [];
  try {
    const candidates = regionNameCandidates(p.sido, p.sigungu);
    if (candidates.length === 0) return [];
    const { data, error } = await sb
      .from("market_transactions")
      .select("complex_name,area_m2,floor,deal_amount_krw,contract_ym,contract_day")
      .in("region_name", candidates)
      .eq("transaction_type", "trade")
      .order("contract_ym", { ascending: false })
      .order("contract_day", { ascending: false, nullsFirst: false })
      .limit(24);
    if (error) {
      logger.warn("[redev.nearby.tx] query error", error.message, "cands", candidates);
      return [];
    }
    const raw = (data ?? []) as Record<string, unknown>[];
    if (raw.length === 0) {
      logger.warn("[redev.nearby.tx] 0 rows", "cands", JSON.stringify(candidates));
    }
    const rows = raw.filter((r) => num(r.deal_amount_krw) != null).slice(0, 8);
    return rows.map((r) => {
      const ym = String(r.contract_ym ?? "");
      const day = num(r.contract_day);
      const ymd =
        ym.length === 6
          ? `${ym.slice(0, 4)}.${ym.slice(4, 6)}${day ? `.${String(day).padStart(2, "0")}` : ""}`
          : ym;
      const amount = num(r.deal_amount_krw);
      return {
        complexName: String(r.complex_name ?? "—"),
        areaM2: num(r.area_m2),
        floor: num(r.floor),
        dealAmountKrw: amount,
        priceLabel: eokMan(amount),
        contractYmd: ymd,
      };
    });
  } catch (e) {
    logger.error("[redev.nearby.tx]", e);
    return [];
  }
}

async function fetchNearbyListings(p: RedevelopmentProject): Promise<NearbyListing[]> {
  try {
    const d = 0.02; // ≈ 2km
    const items = await listListingsInBounds({
      swLat: p.lat - d,
      swLng: p.lng - d,
      neLat: p.lat + d,
      neLng: p.lng + d,
      limit: 8,
    });
    return items.map((l) => {
      let priceLabel = "-";
      if (l.listingType === "jeonse") priceLabel = eokMan(l.depositKrw);
      else if (l.listingType === "monthly")
        priceLabel = `${manwon(l.depositKrw)}/${manwon(l.monthlyKrw)}`;
      else priceLabel = eokMan(l.priceKrw);
      return {
        id: l.id,
        listingType: l.listingType,
        complexName: l.complexName ?? null,
        priceLabel,
      };
    });
  } catch (e) {
    logger.error("[redev.nearby.listings]", e);
    return [];
  }
}

export async function getNearbyForProject(p: RedevelopmentProject): Promise<NearbyResult> {
  const [transactions, listings] = await Promise.all([
    fetchNearbyTransactions(p),
    fetchNearbyListings(p),
  ]);
  return {
    transactions,
    listings,
    regionLabel: [p.sido, p.sigungu].filter(Boolean).join(" "),
  };
}
