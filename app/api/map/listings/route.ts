/**
 * GET /api/map/listings?swLat=&swLng=&neLat=&neLng=&type=
 *
 * 지도 "매물 레이어" — 뷰포트(bounds) 안의 승인(approved) 유저 등록 매물을
 * 지도 마커용 최소 정보로 반환한다. 핵심 약속("매물이 지도에 뜬다")의 데이터 소스.
 *
 * - 좌표(lat/lng)를 가진 승인 매물만 (비승인·좌표 없음은 제외).
 * - author_email 등 개인정보 비노출 — priceLabel/좌표/유형만.
 * - type(선택): sale|jeonse|monthly 필터.
 * - env 미설정·조회 실패 시 { items: [] } (지도는 계속 동작 · graceful).
 *
 * priceLabel: 매매=매매가(억/만), 전세=보증금(억/만), 월세=`보증/월세`(만원 단위).
 * 응답: { items: [{ id, lat, lng, priceLabel, listingType, boosted }] }
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { applyRateLimit, READ_RATE_LIMIT } from "@/lib/rate-limit";
import {
  isListingType,
  listListingsInBounds,
  type BoundsListing,
  type ListingType,
} from "@/lib/listings/store-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 마커 하드캡 */
const MAX_ITEMS = 200;

const CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
} as const;

export interface MapListingItem {
  id: string;
  lat: number;
  lng: number;
  priceLabel: string;
  listingType: ListingType;
  boosted: boolean;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** 원(₩) → "12.3억" / "8,200만" 라벨 (없거나 0이면 "-") */
function eokManLabel(krw: number | null): string {
  if (krw == null || !Number.isFinite(krw) || krw <= 0) return "-";
  if (krw >= 100_000_000) {
    const eok = krw / 100_000_000;
    return `${eok >= 10 ? Math.round(eok).toLocaleString("ko-KR") : eok.toFixed(1)}억`;
  }
  return `${Math.round(krw / 10_000).toLocaleString("ko-KR")}만`;
}

/** 원(₩) → 만원 단위 정수 라벨 (월세 보증/월세용) */
function manwonLabel(krw: number | null): string {
  if (krw == null || !Number.isFinite(krw) || krw <= 0) return "0";
  return Math.round(krw / 10_000).toLocaleString("ko-KR");
}

function priceLabelFor(l: BoundsListing): string {
  if (l.listingType === "jeonse") return eokManLabel(l.depositKrw);
  if (l.listingType === "monthly") {
    return `${manwonLabel(l.depositKrw)}/${manwonLabel(l.monthlyKrw)}`;
  }
  return eokManLabel(l.priceKrw);
}

export async function GET(req: NextRequest) {
  const limited = await applyRateLimit(req, READ_RATE_LIMIT);
  if (limited) return limited;

  const url = new URL(req.url);
  const rawSwLat = Number(url.searchParams.get("swLat"));
  const rawSwLng = Number(url.searchParams.get("swLng"));
  const rawNeLat = Number(url.searchParams.get("neLat"));
  const rawNeLng = Number(url.searchParams.get("neLng"));

  if (![rawSwLat, rawSwLng, rawNeLat, rawNeLng].every((n) => Number.isFinite(n))) {
    return NextResponse.json(
      { error: "swLat,swLng,neLat,neLng are required numbers" },
      { status: 400 },
    );
  }

  const swLat = clamp(Math.min(rawSwLat, rawNeLat), -90, 90);
  const neLat = clamp(Math.max(rawSwLat, rawNeLat), -90, 90);
  const swLng = clamp(Math.min(rawSwLng, rawNeLng), -180, 180);
  const neLng = clamp(Math.max(rawSwLng, rawNeLng), -180, 180);

  const typeParam = url.searchParams.get("type");
  const listingType: ListingType | undefined =
    typeParam && isListingType(typeParam) ? typeParam : undefined;

  try {
    const rows = await listListingsInBounds({
      swLat,
      swLng,
      neLat,
      neLng,
      limit: MAX_ITEMS,
      listingType,
    });
    const now = Date.now();
    const items: MapListingItem[] = rows.map((l) => ({
      id: l.id,
      lat: l.lat,
      lng: l.lng,
      priceLabel: priceLabelFor(l),
      listingType: l.listingType,
      boosted: l.boostUntil != null && Date.parse(l.boostUntil) > now,
    }));
    return NextResponse.json({ items }, { headers: CACHE_HEADERS });
  } catch {
    // 테이블 미구축·조회 실패 시에도 지도는 기존 마커로 계속 동작
    return NextResponse.json({ items: [] }, { headers: CACHE_HEADERS });
  }
}
