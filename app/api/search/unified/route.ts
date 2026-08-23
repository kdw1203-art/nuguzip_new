import { NextResponse } from "next/server";
import { searchComplexes, suggestComplexes } from "@/lib/complex/complex-store";
import { LISTING_TYPE_LABEL, type ListingType } from "@/lib/listings/store-db";
import { getServiceSupabase } from "@/lib/supabase/service";
import { formatPriceKrw, formatRentLabel } from "@/lib/listings/format";
import { dbUnavailable } from "@/lib/api/db-unavailable";
import { logger } from "@/lib/log";
import { normalizeSearchQuery } from "@/lib/search/normalize-query";

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

/**
 * 그룹별 조회 — 실패해도 다른 그룹은 살린다. 다만 빈 배열로 뭉개지 않는다.
 *
 * 예전엔 `catch { return [] }` 였다. 그러면 DB 가 흔들린 순간 화면은
 * "‘{검색어}’ 검색 결과가 없어요"라고 단정했다 — 매물도 노트도 그대로 있는데.
 * 사용자는 검색어를 의심하며 같은 검색을 반복하게 된다. 그래서 실패한 그룹의
 * 이름을 응답에 실어 보내고(failed[]), 클라이언트가 "없음"과 다른 문장을 쓴다.
 */
type GroupResult<T> = { rows: T[]; failed: boolean };
async function safe<T>(label: string, fn: () => Promise<T[]>): Promise<GroupResult<T>> {
  try {
    return { rows: await fn(), failed: false };
  } catch (e) {
    logger.error(`[db-unavailable] 통합 검색 — ${label}`, e);
    return { rows: [], failed: true };
  }
}

/** PostgREST or() 필터에 안전한 ilike 패턴 — 구문 문자(콤마·괄호)와 와일드카드 제거.
 *  [개선 #31] 공백은 % 로 바꾼다: "잠실 주공" ↔ "잠실주공5단지"처럼 띄어쓰기
 *  표기 차이가 0건의 최다 원인이었다(단어 순서는 유지된 채 사이만 느슨해진다). */
function ilikePattern(term: string): string {
  return `%${term
    .replace(/[,()%_]/g, " ")
    .trim()
    .replace(/\s+/g, "%")}%`;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const rawQ = searchParams.get("q")?.trim() ?? "";
  // [개선 #31] 통용 약칭·"아파트" 꼬리 정규화 — 응답의 query 는 사용자가 친 원문 유지
  const q = normalizeSearchQuery(rawQ);

  const empty: UnifiedResults = { complexes: [], listings: [], notes: [], news: [] };
  if (!q) return NextResponse.json({ ...empty, query: rawQ });

  const sb = getServiceSupabase();
  const pattern = ilikePattern(q);

  const [complexes, listings, notes, news] = await Promise.all([
    // 단지 — market_transactions 기반 searchComplexes(ilike는 complex_name trigram
    // GIN 인덱스를 탄다), 정확일치 > 접두 > 포함 + 거래량 가중 랭킹은 스토어에서.
    safe<UnifiedComplex>("단지", async () => {
      const rows = await searchComplexes(q, undefined, GROUP_CAP);
      return rows.slice(0, GROUP_CAP).map((c) => ({
        id: c.id,
        name: c.name,
        region: `${c.city} ${c.district}`.trim(),
      }));
    }),
    // 매물 — 승인 매물에서 단지명·지역·설명을 DB단 ilike 매칭
    safe<UnifiedListing>("매물", async () => {
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
      /* error 와 !data 를 같이 묶으면 "못 읽음"이 "없음"이 된다 — 나눠서 던진다. */
      if (error) throw new Error(`listings 조회 실패: ${error.message}`);
      if (!data) return [];
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
    safe<UnifiedNote>("임장노트", async () => {
      if (!sb) return [];
      const { data, error } = await sb
        .from("inspection_notes")
        .select("id, title")
        .eq("is_public", true)
        .or(
          /* [#129] 메모 본문까지 전문 검색 — trgm 인덱스(20260823150000)로 뒷받침 */
          `title.ilike.${pattern},region.ilike.${pattern},apt_name.ilike.${pattern},summary.ilike.${pattern},sections->>memo.ilike.${pattern}`,
        )
        .order("created_at", { ascending: false })
        .limit(GROUP_CAP);
      if (error) throw new Error(`inspection_notes 조회 실패: ${error.message}`);
      if (!data) return [];
      return (data as Array<Record<string, unknown>>).map((n) => ({
        id: String(n.id),
        title: String(n.title ?? "임장노트"),
      }));
    }),
    // 뉴스 — board_posts(자동수집 뉴스 포함)에서 제목·분류를 DB단 ilike 매칭
    safe<UnifiedNews>("뉴스", async () => {
      if (!sb) return [];
      const { data, error } = await sb
        .from("board_posts")
        .select("id, title, category, source_name")
        .eq("board_type", "community")
        .eq("is_published", true)
        .or(`title.ilike.${pattern},category.ilike.${pattern}`)
        .order("created_at", { ascending: false })
        .limit(GROUP_CAP);
      if (error) throw new Error(`board_posts 조회 실패: ${error.message}`);
      if (!data) return [];
      return (data as Array<Record<string, unknown>>).map((p) => ({
        id: String(p.id),
        title: String(p.title ?? ""),
        source: String(p.source_name || p.category || "뉴스"),
      }));
    }),
  ]);

  /* 네 그룹이 전부 실패했으면 그건 부분 실패가 아니라 조회 자체가 안 되는 상태다.
     200 에 빈 결과를 실어 보내면 클라이언트는 그것을 "검색 결과 없음"으로 그린다. */
  const failed = [
    complexes.failed ? "단지" : null,
    listings.failed ? "매물" : null,
    notes.failed ? "임장노트" : null,
    news.failed ? "뉴스" : null,
  ].filter((v): v is string => v !== null);
  if (failed.length === 4) {
    return dbUnavailable("search-unified", new Error("통합 검색 네 그룹이 모두 실패"));
  }

  /* A8 — 전 그룹 무결과일 때만 대안 단지 제안(토큰 완화 매칭).
     "실패해서 비었다"는 무결과가 아니므로, 실패한 그룹이 하나라도 있으면 제안하지
     않는다 — 있는 결과를 못 본 채 엉뚱한 대안을 미는 꼴이 된다. */
  const allEmpty =
    failed.length === 0 &&
    complexes.rows.length === 0 &&
    listings.rows.length === 0 &&
    notes.rows.length === 0 &&
    news.rows.length === 0;
  const suggested = allEmpty
    ? await safe<UnifiedComplex>("대안 제안", async () => {
        const rows = await suggestComplexes(q, 6);
        return rows.map((c) => ({
          id: c.id,
          name: c.name,
          region: `${c.city} ${c.district}`.trim(),
        }));
      })
    : { rows: [] as UnifiedComplex[], failed: false };

  /* [#105] 제로결과 로그 — 진짜 무결과(실패 아님)만 기록. fire-and-forget:
     로깅 실패가 검색 응답을 늦추거나 막으면 안 된다. 개인정보를 줄이기 위해
     2~40자 질의만, 원문 그대로(오타 포함 — 그것이 콘텐츠 주문서의 재료다). */
  if (allEmpty && sb && q.length >= 2 && q.length <= 40) {
    void sb
      .from("search_zero_results")
      .insert({ query: q })
      .then(({ error }) => {
        if (error) logger.warn("[search] 제로결과 로그 실패", error);
      });
  }

  return NextResponse.json(
    {
      complexes: complexes.rows,
      listings: listings.rows,
      notes: notes.rows,
      news: news.rows,
      suggestions: suggested.rows,
      /* 클라이언트는 이 목록을 "없음"이 아니라 "지금 못 불러왔음"으로 그린다. */
      failed,
      query: rawQ,
    },
    {
      headers: {
        // 부분 실패 응답을 CDN 이 재사용하면 장애가 끝난 뒤에도 계속 나간다.
        "Cache-Control": failed.length
          ? "no-store"
          : "public, s-maxage=60, stale-while-revalidate=300",
      },
    },
  );
}
