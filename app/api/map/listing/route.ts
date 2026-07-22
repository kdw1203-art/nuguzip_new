/**
 * 지도 매물 미리보기 API — 마커 클릭 시 슬라이드 패널용 최소 정보.
 * GET /api/map/listing?id=<listingId>
 * 승인(approved)·비숨김 매물만. 개인정보(이메일·연락처) 비노출.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getListingById, LISTING_TYPE_LABEL } from "@/lib/listings/store-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

export async function GET(req: NextRequest) {
  const id = (req.nextUrl.searchParams.get("id") ?? "").trim();
  if (!id) return NextResponse.json({ error: "id가 필요합니다." }, { status: 400 });

  const l = await getListingById(id);
  if (!l || l.status !== "approved" || l.isHidden) {
    return NextResponse.json({ error: "매물을 찾을 수 없습니다." }, { status: 404 });
  }

  const priceLabel =
    l.listingType === "jeonse"
      ? eokMan(l.depositKrw)
      : l.listingType === "monthly"
        ? `${manwon(l.depositKrw)}/${manwon(l.monthlyKrw)}`
        : eokMan(l.priceKrw);

  const areaLabel =
    l.areaM2 != null && l.areaM2 > 0
      ? `${Math.round(l.areaM2)}㎡(${Math.round(l.areaM2 / 3.3058)}평)`
      : null;

  return NextResponse.json(
    {
      id: l.id,
      listingType: l.listingType,
      listingTypeLabel: LISTING_TYPE_LABEL[l.listingType] ?? "매물",
      complexName: l.complexName || null,
      regionName: l.regionName,
      priceLabel,
      areaLabel,
      floor: l.floor,
      description: l.description ? l.description.slice(0, 120) : null,
      thumbnailUrl: l.thumbnailUrl,
      ownerVerified: l.ownerVerified,
      boosted: Boolean(l.boostUntil && new Date(l.boostUntil).getTime() > Date.now()),
      source: l.source,
      authorLabel: l.authorLabel,
    },
    { headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=120" } },
  );
}
