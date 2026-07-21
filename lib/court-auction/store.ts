import "server-only";
import { getReadOnlySupabase } from "@/lib/newui/supabase-read";
import { logger } from "@/lib/log";

/**
 * 법원경매(court auction) 물건 읽기 전용 로더.
 *
 * 온비드 공매(lib/onbid/store.ts)의 형제 소스. 현재는 is_sample=true 예시 행을
 * 렌더링하며, 실 데이터 소스가 연결되면(lib/court-auction/sync.ts) 동일 테이블에
 * 적재된다. RLS deny-all 이므로 서버(Service Role/anon) 헬퍼로만 접근한다.
 */

export type CourtAuctionItem = {
  id: number;
  externalKey: string;
  caseNo: string | null;
  itemNo: string | null;
  name: string | null;
  usage: string | null;
  sido: string | null;
  sigungu: string | null;
  address: string | null;
  appraisalKrw: number | null;
  minBidKrw: number | null;
  minBidText: string | null;
  bidDate: string | null;
  failCount: number | null;
  status: string | null;
  courtName: string | null;
  source: string | null;
  thumbUrl: string | null;
  detailUrl: string | null;
  isSample: boolean;
  updatedAt: string | null;
};

/** 물건 유형 키워드 → 표시 카테고리 (온비드 AUCTION_USAGE_FILTERS 형태 미러) */
export const COURT_USAGE_FILTERS: { key: string; label: string; match: string[] }[] = [
  { key: "apt", label: "아파트", match: ["아파트"] },
  { key: "officetel", label: "오피스텔", match: ["오피스텔"] },
  { key: "villa", label: "다세대·빌라", match: ["다세대", "연립", "빌라"] },
  { key: "comm", label: "상가", match: ["상가", "근린", "업무", "사무"] },
  { key: "land", label: "토지", match: ["대지", "토지", "전", "답", "임야"] },
  { key: "etc", label: "기타", match: [] },
];

function mapRow(r: Record<string, unknown>): CourtAuctionItem {
  return {
    id: Number(r.id),
    externalKey: String(r.external_key),
    caseNo: r.case_no ? String(r.case_no) : null,
    itemNo: r.item_no ? String(r.item_no) : null,
    name: r.name ? String(r.name) : null,
    usage: r.usage ? String(r.usage) : null,
    sido: r.sido ? String(r.sido) : null,
    sigungu: r.sigungu ? String(r.sigungu) : null,
    address: r.address ? String(r.address) : null,
    appraisalKrw: r.appraisal_krw != null ? Number(r.appraisal_krw) : null,
    minBidKrw: r.min_bid_krw != null ? Number(r.min_bid_krw) : null,
    minBidText: r.min_bid_text ? String(r.min_bid_text) : null,
    bidDate: r.bid_date ? String(r.bid_date) : null,
    failCount: r.fail_count != null ? Number(r.fail_count) : null,
    status: r.status ? String(r.status) : null,
    courtName: r.court_name ? String(r.court_name) : null,
    source: r.source ? String(r.source) : null,
    thumbUrl: r.thumb_url ? String(r.thumb_url) : null,
    detailUrl: r.detail_url ? String(r.detail_url) : null,
    isSample: Boolean(r.is_sample),
    updatedAt: r.updated_at ? String(r.updated_at) : null,
  };
}

export async function getCourtAuctions(opts: {
  usage?: string;
  sigungu?: string;
  limit?: number;
} = {}): Promise<CourtAuctionItem[]> {
  const sb = getReadOnlySupabase();
  if (!sb) return [];
  try {
    let q = sb
      .from("court_auctions")
      .select("*")
      .order("bid_date", { ascending: true, nullsFirst: false })
      .order("updated_at", { ascending: false })
      .limit(opts.limit ?? 100);
    if (opts.sigungu) q = q.ilike("sigungu", `%${opts.sigungu}%`);
    if (opts.usage) {
      const f = COURT_USAGE_FILTERS.find((x) => x.key === opts.usage);
      if (f && f.match.length > 0) {
        const ors = f.match.map((m) => `usage.ilike.%${m}%`).join(",");
        q = q.or(ors);
      } else if (f && f.key === "etc") {
        // 기타: 알려진 유형 키워드 어디에도 해당하지 않는 물건
        const known = COURT_USAGE_FILTERS.flatMap((x) => x.match);
        for (const m of known) q = q.not("usage", "ilike", `%${m}%`);
      }
    }
    const { data, error } = await q;
    if (error || !Array.isArray(data)) return [];
    return data.map((r) => mapRow(r as Record<string, unknown>));
  } catch (e) {
    logger.error("[getCourtAuctions]", e);
    return [];
  }
}

export async function getCourtAuctionCount(): Promise<number> {
  const sb = getReadOnlySupabase();
  if (!sb) return 0;
  try {
    const { count, error } = await sb
      .from("court_auctions")
      .select("id", { count: "exact", head: true });
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}
