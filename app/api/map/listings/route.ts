/**
 * GET /api/map/listings?swLat=&swLng=&neLat=&neLng=&type=&kind=&roomsMin=&bathroomsMin=&parkingMin=
 *
 * 지도 "매물 레이어" — 뷰포트(bounds) 안의 승인(approved) 유저 등록 매물을
 * 지도 마커용 최소 정보로 반환한다.
 *
 * - type: sale|jeonse|monthly
 * - kind: apartment|villa|detached|officetel|commercial|other
 * - roomsMin / bathroomsMin / parkingMin: 이상(값 있는 매물만)
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { applyRateLimit, READ_RATE_LIMIT } from "@/lib/rate-limit";
import {
  isListingType,
  isPropertyKind,
  listListingsInBounds,
  type BoundsListing,
  type ListingType,
  type PropertyKind,
} from "@/lib/listings/store-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  propertyKind: PropertyKind | null;
  rooms: number | null;
  bathrooms: number | null;
  parkingSpaces: number | null;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function eokManLabel(krw: number | null): string {
  if (krw == null || !Number.isFinite(krw) || krw <= 0) return "-";
  if (krw >= 100_000_000) {
    const eok = krw / 100_000_000;
    return `${eok >= 10 ? Math.round(eok).toLocaleString("ko-KR") : eok.toFixed(1)}억`;
  }
  return `${Math.round(krw / 10_000).toLocaleString("ko-KR")}만`;
}

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

function parseMinInt(raw: string | null, lo: number, hi: number): number | undefined {
  if (raw == null || raw === "") return undefined;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return undefined;
  return Math.min(hi, Math.max(lo, n));
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
  const kindParam = url.searchParams.get("kind");
  const propertyKind: PropertyKind | undefined =
    kindParam && isPropertyKind(kindParam) ? kindParam : undefined;
  const roomsMin = parseMinInt(url.searchParams.get("roomsMin"), 1, 7);
  const bathroomsMin = parseMinInt(url.searchParams.get("bathroomsMin"), 0, 5);
  const parkingMin = parseMinInt(url.searchParams.get("parkingMin"), 0, 10);

  try {
    const { items: rows, detailFiltersSupported } = await listListingsInBounds({
      swLat,
      swLng,
      neLat,
      neLng,
      limit: MAX_ITEMS,
      listingType,
      propertyKind,
      roomsMin,
      bathroomsMin,
      parkingMin,
    });
    const now = Date.now();
    const items: MapListingItem[] = rows.map((l) => ({
      id: l.id,
      lat: l.lat,
      lng: l.lng,
      priceLabel: priceLabelFor(l),
      listingType: l.listingType,
      boosted: l.boostUntil != null && Date.parse(l.boostUntil) > now,
      propertyKind: l.propertyKind,
      rooms: l.rooms,
      bathrooms: l.bathrooms,
      parkingSpaces: l.parkingSpaces,
    }));
    return NextResponse.json(
      { items, detailFiltersSupported },
      { headers: CACHE_HEADERS },
    );
  } catch {
    return NextResponse.json(
      { items: [], detailFiltersSupported: false },
      { headers: CACHE_HEADERS },
    );
  }
}
