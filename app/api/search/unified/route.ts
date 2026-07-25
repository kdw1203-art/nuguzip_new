import { NextResponse } from "next/server";
import { searchComplexes, suggestComplexes } from "@/lib/complex/complex-store";
import { LISTING_TYPE_LABEL, type ListingType } from "@/lib/listings/store-db";
import { getServiceSupabase } from "@/lib/supabase/service";
import { formatPriceKrw, formatRentLabel } from "@/lib/listings/format";

/* 통합 검색 API — 단지 + 매물 + 임장노트 + 뉴스를 한 번에.
   그룹별 상위 ~5건, 각 소스 실패 시 해당 그룹만 [] (부분 실패 허용).

   매물·노트·뉴스는 검색어를 DB단 ilike 로 내려보낸다. 예전엔 "최신 상위 N건을
   통째로 받아 JS includes" 방식이라, 최신 N건 밖의 글은 검색어가 정확해도
   영원히 검색되지 않았다(도달 불가). 단지는 searchComplexes 가 trigram 인덱스
   기반 ilike + 정확>접두>포함·거래량 가중 랭킹을 수행한다. */

export const runtime = "nodejs";

const GROUP_CAP = 5;

export interface UnifiedComplex {
  id: string;
  name: string;
  region: string;
}
export interface UnifiedListing {
  id: string;
  title: string;
  price: string;
}
export interface UnifiedNote {
  id: string;
  title: string;
}
export interface UnifiedNews {
  id: string;
  title: string;
  source: string;
}

export interface UnifiedResults {
  complexes: UnifiedComplex[];
  listings: UnifiedListing[];
  notes: UnifiedNote[];
  news: UnifiedNews[];
}

function listingPrice(row: {
  listing_type: string;
  price_krw: number | null;
  deposit_krw: number | null;
  monthly_krw: number | null;
}): string {
  if (row.listing_type === "monthly") {
    return formatRentLabel(row.deposit_krw ?? 0, row.monthly_krw ?? 0);
  }
  const won = row.listing_type === "jeonse" ? row.deposit_krw : row.price_krw;
  return won != null ? formatPriceKrw(won) : "—";
}

/** 그룹별 조회 — 실패 시 빈 배열로 우아하게 폴백. */
async function safe<T>(fn: () => Promise<T[]>): Promise<T[]> {
  try {
    return await fn();
  } catch {
    return [];
  }
}

/** PostgREST or() 필터에 안전한 ilike 패턴 — 구문 문자(콤마·괄호)와 와일드카드 제거 */
function ilikePattern(term: string): string {
  return `%${term.replace(/[,()%_]/g, " ").trim()}%`;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";

  const empty: UnifiedResults = { complexes: [], listings: [], notes: [], news: [] };
  if (!q) return NextResponse.json({ ...empty, query: q });

  const sb = getServiceSupabase();
  const pattern = ilikePattern(q);

  const [complexes, listings, notes, news] = await Promise.all([
    // 단지 — market_transactions 기반 searchComplexes(ilike는 complex_name trigram
    // GIN 인덱스를 탄다), 정확일치 > 접두 > 포함 + 거래량 가중 랭킹은 스토어에서.
    safe<UnifiedComplex>(async () => {
      const rows = await searchComplexes(q, undefined, GROUP_CAP);
      return rows.slice(0, GROUP_CAP).map((c) => ({
        id: c.id,
        name: c.name,
        region: `${c.city} ${c.district}`.trim(),
      }));
    }),
    // 매물 — 승인 매물에서 단지명·지역·설명을 DB단 ilike 매칭
    safe<UnifiedListing>(async () => {
      if (!sb) return [];
      const { data, error } = await sb
        .from("listings")
        .select("id, complex_name, region_name, listing_type, price_krw, deposit_krw, monthly_krw")
        .eq("status", "approved")
        .eq("is_hidden", false)
        .is("deleted_at", null)
        .or(
          `complex_name.ilike.${pattern},region_name.ilike.${pattern},description.ilike.${pattern}`,
        )
        .order("created_at", { ascending: false })
        .limit(GROUP_CAP);
      if (error || !data) return [];
      return (data as Array<Record<string, unknown>>).map((l) => ({
        id: String(l.id),
        title: `${String(l.complex_name ?? "")} · ${
          LISTING_TYPE_LABEL[(l.listing_type as ListingType) ?? "sale"] ?? "매물"
        }`,
        price: listingPrice({
          listing_type: String(l.listing_type ?? "sale"),
          price_krw: l.price_krw != null ? Number(l.price_krw) : null,
          deposit_krw: l.deposit_krw != null ? Number(l.deposit_krw) : null,
          monthly_krw: l.monthly_krw != null ? Number(l.monthly_krw) : null,
        }),
      }));
    }),
    // 임장노트 — 공개 노트에서 제목·지역·단지명·요약을 DB단 ilike 매칭
    safe<UnifiedNote>(async () => {
      if (!sb) return [];
      const { data, error } = await sb
        .from("inspection_notes")
        .select("id, title")
        .eq("is_public", true)
        .or(
          `title.ilike.${pattern},region.ilike.${pattern},apt_name.ilike.${pattern},summary.ilike.${pattern}`,
        )
        .order("created_at", { ascending: false })
        .limit(GROUP_CAP);
      if (error || !data) return [];
      return (data as Array<Record<string, unknown>>).map((n) => ({
        id: String(n.id),
        title: String(n.title ?? "임장노트"),
      }));
    }),
    // 뉴스 — board_posts(자동수집 뉴스 포함)에서 제목·분류를 DB단 ilike 매칭
    safe<UnifiedNews>(async () => {
      if (!sb) return [];
      const { data, error } = await sb
        .from("board_posts")
        .select("id, title, category, source_name")
        .eq("board_type", "community")
        .eq("is_published", true)
        .or(`title.ilike.${pattern},category.ilike.${pattern}`)
        .order("created_at", { ascending: false })
        .limit(GROUP_CAP);
      if (error || !data) return [];
      return (data as Array<Record<string, unknown>>).map((p) => ({
        id: String(p.id),
        title: String(p.title ?? ""),
        source: String(p.source_name || p.category || "뉴스"),
      }));
    }),
  ]);

  // A8 — 전 그룹 무결과일 때만 대안 단지 제안(토큰 완화 매칭). 결과 있으면 빈 배열.
  const allEmpty =
    complexes.length === 0 &&
    listings.length === 0 &&
    notes.length === 0 &&
    news.length === 0;
  const suggestions: UnifiedComplex[] = allEmpty
    ? await safe<UnifiedComplex>(async () => {
        const rows = await suggestComplexes(q, 6);
        return rows.map((c) => ({
          id: c.id,
          name: c.name,
          region: `${c.city} ${c.district}`.trim(),
        }));
      })
    : [];

  return NextResponse.json(
    { complexes, listings, notes, news, suggestions, query: q },
    { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } },
  );
}
