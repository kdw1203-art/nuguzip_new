import "server-only";
import { getReadOnlySupabase } from "@/lib/newui/supabase-read";
import { logger } from "@/lib/log";

/** 온비드 공매 물건 읽기 전용 로더. */

export type AuctionItem = {
  id: number;
  externalKey: string;
  name: string | null;
  prptDiv: string | null;
  usage: string | null;
  sido: string | null;
  sigungu: string | null;
  emd: string | null;
  appraisalKrw: number | null;
  minBidKrw: number | null;
  minBidText: string | null;
  landSqms: number | null;
  bldSqms: number | null;
  bidBegin: string | null;
  bidEnd: string | null;
  status: string | null;
  onbidCltrno: string | null;
  pbctNo: string | null;
};

/** 물건 유형 키워드 → 표시 카테고리 */
export const AUCTION_USAGE_FILTERS: { key: string; label: string; match: string[] }[] = [
  { key: "apt", label: "아파트", match: ["아파트"] },
  { key: "officetel", label: "오피스텔", match: ["오피스텔"] },
  { key: "villa", label: "빌라·연립", match: ["다세대", "연립", "빌라"] },
  { key: "house", label: "단독·다가구", match: ["단독", "다가구"] },
  { key: "land", label: "토지", match: ["대지", "토지", "전", "답", "임야"] },
  { key: "comm", label: "상가·업무", match: ["상가", "근린", "業務", "업무", "사무"] },
];

function mapRow(r: Record<string, unknown>): AuctionItem {
  return {
    id: Number(r.id),
    externalKey: String(r.external_key),
    name: r.name ? String(r.name) : null,
    prptDiv: r.prpt_div ? String(r.prpt_div) : null,
    usage: r.usage_scls ? String(r.usage_scls) : r.usage_mcls ? String(r.usage_mcls) : null,
    sido: r.sido ? String(r.sido) : null,
    sigungu: r.sigungu ? String(r.sigungu) : null,
    emd: r.emd ? String(r.emd) : null,
    appraisalKrw: r.appraisal_krw != null ? Number(r.appraisal_krw) : null,
    minBidKrw: r.min_bid_krw != null ? Number(r.min_bid_krw) : null,
    minBidText: r.min_bid_text ? String(r.min_bid_text) : null,
    landSqms: r.land_sqms != null ? Number(r.land_sqms) : null,
    bldSqms: r.bld_sqms != null ? Number(r.bld_sqms) : null,
    bidBegin: r.bid_begin ? String(r.bid_begin) : null,
    bidEnd: r.bid_end ? String(r.bid_end) : null,
    status: r.status ? String(r.status) : null,
    onbidCltrno: r.onbid_cltrno ? String(r.onbid_cltrno) : null,
    pbctNo: r.pbct_no ? String(r.pbct_no) : null,
  };
}

export async function getAuctions(opts: {
  usage?: string;
  sigungu?: string;
  limit?: number;
} = {}): Promise<AuctionItem[]> {
  const sb = getReadOnlySupabase();
  if (!sb) return [];
  try {
    let q = sb
      .from("onbid_auctions")
      .select("*")
      .order("bid_end", { ascending: true, nullsFirst: false })
      .limit(opts.limit ?? 100);
    if (opts.sigungu) q = q.ilike("sigungu", `%${opts.sigungu}%`);
    if (opts.usage) {
      const f = AUCTION_USAGE_FILTERS.find((x) => x.key === opts.usage);
      if (f) {
        const ors = f.match
          .map((m) => `usage_scls.ilike.%${m}%,usage_mcls.ilike.%${m}%`)
          .join(",");
        q = q.or(ors);
      }
    }
    const { data, error } = await q;
    if (error || !Array.isArray(data)) return [];
    return data.map((r) => mapRow(r as Record<string, unknown>));
  } catch (e) {
    logger.error("[getAuctions]", e);
    return [];
  }
}

export async function getAuctionCount(): Promise<number> {
  const sb = getReadOnlySupabase();
  if (!sb) return 0;
  try {
    const { count, error } = await sb
      .from("onbid_auctions")
      .select("id", { count: "exact", head: true });
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}
