import { NextResponse } from "next/server";
import { searchComplexes } from "@/lib/complex/complex-store";
import {
  listApprovedListings,
  LISTING_TYPE_LABEL,
  type PublicListing,
} from "@/lib/listings/store-db";
import { listPublicNotes } from "@/lib/inspection/store-db";
import { readBoardPosts } from "@/lib/newui/board-posts";
import { formatPriceKrw, formatRentLabel } from "@/lib/listings/filter";

/* 통합 검색 API — 단지 + 매물 + 임장노트 + 뉴스를 한 번에.
   그룹별 상위 ~5건, 각 소스 실패 시 해당 그룹만 [] (부분 실패 허용).
   기존 로더 재사용 · 그룹별 쿼리 상한으로 빠르게 유지. */

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

function listingPrice(l: PublicListing): string {
  if (l.listingType === "monthly") {
    return formatRentLabel(l.depositKrw ?? 0, l.monthlyKrw ?? 0);
  }
  const won = l.listingType === "jeonse" ? l.depositKrw : l.priceKrw;
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

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";

  const empty: UnifiedResults = { complexes: [], listings: [], notes: [], news: [] };
  if (!q) return NextResponse.json({ ...empty, query: q });

  const lower = q.toLowerCase();

  const [complexes, listings, notes, news] = await Promise.all([
    // 단지 — search_complexes RPC(프리픽스), 상위 5
    safe<UnifiedComplex>(async () => {
      const rows = await searchComplexes(q, undefined, GROUP_CAP);
      return rows.slice(0, GROUP_CAP).map((c) => ({
        id: c.id,
        name: c.name,
        region: `${c.city} ${c.district}`.trim(),
      }));
    }),
    // 매물 — 승인 매물에서 단지명·지역·설명 매칭
    safe<UnifiedListing>(async () => {
      const rows = await listApprovedListings();
      return rows
        .filter((l) =>
          `${l.complexName} ${l.regionName ?? ""} ${l.description ?? ""}`
            .toLowerCase()
            .includes(lower),
        )
        .slice(0, GROUP_CAP)
        .map((l) => ({
          id: l.id,
          title: `${l.complexName} · ${LISTING_TYPE_LABEL[l.listingType]}`,
          price: listingPrice(l),
        }));
    }),
    // 임장노트 — 공개 노트에서 제목·지역·단지명·요약 매칭
    safe<UnifiedNote>(async () => {
      const rows = await listPublicNotes(50);
      return rows
        .filter((n) =>
          `${n.title} ${n.region} ${n.aptName ?? ""} ${n.summary ?? ""}`
            .toLowerCase()
            .includes(lower),
        )
        .slice(0, GROUP_CAP)
        .map((n) => ({ id: n.id, title: n.title }));
    }),
    // 뉴스 — board_posts(자동수집 뉴스 포함)에서 제목·분류·태그 매칭
    safe<UnifiedNews>(async () => {
      const rows = await readBoardPosts(100);
      return rows
        .filter((p) =>
          `${p.title} ${p.category} ${(p.tags ?? []).join(" ")}`
            .toLowerCase()
            .includes(lower),
        )
        .slice(0, GROUP_CAP)
        .map((p) => ({
          id: p.id,
          title: p.title,
          source: p.sourceName || p.category || "뉴스",
        }));
    }),
  ]);

  return NextResponse.json(
    { complexes, listings, notes, news, query: q },
    { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } },
  );
}
