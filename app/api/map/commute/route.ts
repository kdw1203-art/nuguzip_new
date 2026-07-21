import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { isNaverMapsRestConfigured, naverGeocode } from "@/lib/map/naver-maps-rest";
import {
  estimateCommuteMinutes,
  isDirectionsConfigured,
  type CommuteBasis,
} from "@/lib/map/naver-directions";
import { logger } from "@/lib/log";

/**
 * POST /api/map/commute
 *
 * 출퇴근 필터(#10) — 회사 위치에서 각 단지까지의 예상 소요시간(분)을 추정한다.
 *
 * body: {
 *   office: { lat:number, lng:number } | address:string,
 *   points: [{ id:string, lat:number, lng:number }]   // 보통 화면에 보이는 단지
 * }
 *
 * - office 가 주소 문자열이면 Geocoding(naverGeocode)으로 좌표를 구한다.
 * - 소요시간은 Directions 연동 시 실제 경로, 아니면 haversine 직선거리 추정(도심 22km/h).
 * - 좌표 미해결/미설정/오류에도 지도는 계속 동작하도록 graceful 응답.
 *
 * 응답: {
 *   office: { lat, lng } | null,
 *   basis: "directions" | "haversine",
 *   results: [{ id, minutes }],
 *   note?: string,     // 직선거리 기준 안내 라벨
 *   error?: string
 * }
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Directions 남용/과호출 방지 하드캡 */
const MAX_POINTS = 60;

const HAVERSINE_NOTE = "직선거리 기준(정확 소요시간은 연동 시)";

type PointIn = { id: string; lat: number; lng: number };

function toFiniteNumber(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number.parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : null;
}

function parsePoints(raw: unknown): PointIn[] {
  if (!Array.isArray(raw)) return [];
  const out: PointIn[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const id = String(rec.id ?? "").trim();
    const lat = toFiniteNumber(rec.lat);
    const lng = toFiniteNumber(rec.lng);
    if (!id || lat === null || lng === null) continue;
    out.push({ id, lat, lng });
    if (out.length >= MAX_POINTS) break;
  }
  return out;
}

/** office 필드를 좌표로 해석 — {lat,lng} 우선, 문자열이면 geocode. */
async function resolveOffice(
  office: unknown,
): Promise<{ lat: number; lng: number } | null> {
  if (office && typeof office === "object") {
    const rec = office as Record<string, unknown>;
    const lat = toFiniteNumber(rec.lat);
    const lng = toFiniteNumber(rec.lng);
    if (lat !== null && lng !== null) return { lat, lng };
    // address 필드로 감싸온 경우도 허용
    const addr = String(rec.address ?? "").trim();
    if (addr) return resolveOffice(addr);
    return null;
  }
  const query = String(office ?? "").trim();
  if (!query) return null;
  if (!isNaverMapsRestConfigured()) return null;
  try {
    const items = await naverGeocode(query, 1);
    const first = items[0];
    if (first && Number.isFinite(first.lat) && Number.isFinite(first.lng)) {
      return { lat: first.lat, lng: first.lng };
    }
  } catch (e) {
    logger.warn("[map/commute] office geocode 실패", e);
  }
  return null;
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const points = parsePoints(body.points);
  const office = await resolveOffice(body.office);

  if (!office) {
    // 좌표 미해결 — geocode 미설정이거나 주소를 찾지 못함. 지도는 계속 동작.
    return NextResponse.json({
      office: null,
      basis: "haversine" as CommuteBasis,
      results: [],
      note: HAVERSINE_NOTE,
      error: isNaverMapsRestConfigured()
        ? "회사 주소를 찾지 못했어요."
        : "주소 검색(지오코딩)이 설정되지 않았어요.",
    });
  }

  if (points.length === 0) {
    return NextResponse.json({
      office,
      basis: (isDirectionsConfigured() ? "directions" : "haversine") as CommuteBasis,
      results: [],
      note: isDirectionsConfigured() ? undefined : HAVERSINE_NOTE,
    });
  }

  // estimateCommuteMinutes 는 절대 throw 하지 않음 — 병렬 추정.
  const estimates = await Promise.all(
    points.map(async (p) => {
      const { minutes, basis } = await estimateCommuteMinutes(office, {
        lat: p.lat,
        lng: p.lng,
      });
      return { id: p.id, minutes, basis };
    }),
  );

  const usedDirections = estimates.some((e) => e.basis === "directions");
  const basis: CommuteBasis = usedDirections ? "directions" : "haversine";

  return NextResponse.json({
    office,
    basis,
    results: estimates.map((e) => ({ id: e.id, minutes: e.minutes })),
    note: usedDirections ? undefined : HAVERSINE_NOTE,
  });
}
