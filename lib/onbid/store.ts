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
  cltrMngNo: string | null;
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
    cltrMngNo: r.cltr_mng_no ? String(r.cltr_mng_no) : null,
    pbctNo: r.pbct_no ? String(r.pbct_no) : null,
  };
}

/**
 * 입찰마감(bid_end)이 오늘보다 이전인지 판정.
 * bid_end 는 온비드 원문 텍스트 컬럼("YYYYMMDDHHMM"·"YYYY-MM-DD HH:MM" 등 형식 관용) —
 * 숫자만 추출해 날짜로 해석하고, 형식 불명·미상은 "지난 것"으로 단정하지 않는다.
 */
export function isPastBidEnd(bidEnd: string | null, now: Date = new Date()): boolean {
  if (!bidEnd) return false;
  const digits = bidEnd.replace(/\D/g, "");
  if (digits.length < 8) return false;
  const y = Number(digits.slice(0, 4));
  const mo = Number(digits.slice(4, 6));
  const da = Number(digits.slice(6, 8));
  if (!y || !mo || !da) return false;
  const end = new Date(y, mo - 1, da);
  if (Number.isNaN(end.getTime())) return false;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return end.getTime() < today.getTime();
}

/* 2026-07-26: 아래 두 함수는 실패할 때 `[]`·`0` 을 돌려줬다. 그러면 화면은
   "진행·예정 물건 0건 / 조건에 맞는 물건이 없어요" 라고 그린다 — 공매 물건이
   실제로 없는 것과 조회가 죽은 것은 전혀 다른 사실인데, 사용자에겐 똑같이
   "없다"로 보인다. 실패는 던져서 호출부(app/auctions/page.tsx)가 "지금
   불러오지 못했다"고 말하게 한다. 사실 우선 — 실패를 데이터 없음으로 덮지 않는다. */
export async function getAuctions(opts: {
  usage?: string;
  sigungu?: string;
  limit?: number;
} = {}): Promise<AuctionItem[]> {
  const sb = getReadOnlySupabase();
  if (!sb) throw new Error("Supabase 읽기 클라이언트를 만들 수 없습니다 (환경변수 누락)");
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
    if (error) throw new Error(error.message);
    if (!Array.isArray(data)) throw new Error("onbid_auctions 응답이 배열이 아닙니다");
    return data.map((r) => mapRow(r as Record<string, unknown>));
  } catch (e) {
    logger.error("[getAuctions] 공매 물건 조회 실패", e);
    throw e;
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

/**
 * 입찰 중·예정(마감 전) 물건 수 — "입찰 중·예정 N건" 표기용.
 * bid_end 가 형식 자유 텍스트라 SQL 비교(gte)로는 형식이 섞이면 오판할 수 있어,
 * bid_end 만 가져와 isPastBidEnd 로 앱에서 센다(목록 필터와 동일 기준).
 */
export async function getActiveAuctionCount(): Promise<number> {
  const sb = getReadOnlySupabase();
  if (!sb) throw new Error("Supabase 읽기 클라이언트를 만들 수 없습니다 (환경변수 누락)");
  try {
    const { data, error } = await sb
      .from("onbid_auctions")
      .select("bid_end")
      .limit(5000);
    if (error) throw new Error(error.message);
    if (!Array.isArray(data)) throw new Error("onbid_auctions 응답이 배열이 아닙니다");
    const now = new Date();
    return data.filter((r) => {
      const v = (r as { bid_end?: unknown }).bid_end;
      return !isPastBidEnd(v ? String(v) : null, now);
    }).length;
  } catch (e) {
    /* 0 을 돌려주면 "진행·예정 물건 0건 · 온비드 실데이터" 라고 단정하게 된다.
       실집계라고 써 놓은 자리라서, 실패를 0 으로 채우면 그 문장이 거짓이 된다. */
    logger.error("[getActiveAuctionCount] 진행 물건 수 집계 실패", e);
    throw e;
  }
}
