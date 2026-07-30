import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { applyRateLimit, READ_RATE_LIMIT } from "@/lib/rate-limit";
import { haversineDistanceM } from "@/lib/map/geo-haversine";
import {
  estimateWalkingRoute,
  fetchDrivingRoute,
  isDirectionsConfigured,
} from "@/lib/map/naver-directions";

/**
 * POST /api/map/route-measure
 * 거리 재기 — 시작·끝 사이 직선 / 차량 / 도보 요약을 돌려준다.
 *
 * body: { start: {lat,lng}, goal: {lat,lng} }
 * 응답: {
 *   straight: { distanceM, path },
 *   driving: { distanceM, durationMin, path, basis } | null,
 *   walking: { distanceM, durationMin, path, basis },
 *   directionsConfigured: boolean
 * }
 *
 * 도보는 NCP Directions 5 가 자동차 전용이라 직선×우회 추정(estimate)이다 —
 * 가짜 도로 경로를 그리지 않고 점선 직선으로 표시한다.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type LatLng = { lat: number; lng: number };

function parsePoint(raw: unknown): LatLng | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const lat = typeof o.lat === "number" ? o.lat : Number(o.lat);
  const lng = typeof o.lng === "number" ? o.lng : Number(o.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < 32 || lat > 40 || lng < 123 || lng > 133) return null;
  return { lat, lng };
}

export async function POST(req: NextRequest) {
  const limited = await applyRateLimit(req, { ...READ_RATE_LIMIT, max: 40 });
  if (limited) return limited;

  const body = await req.json().catch(() => ({}));
  const start = parsePoint((body as { start?: unknown }).start);
  const goal = parsePoint((body as { goal?: unknown }).goal);
  if (!start || !goal) {
    return NextResponse.json(
      { error: "start·goal 좌표가 필요합니다." },
      { status: 400 },
    );
  }

  const straightM = Math.round(
    haversineDistanceM(start.lat, start.lng, goal.lat, goal.lng),
  );
  const walking = estimateWalkingRoute(start, goal);

  let driving: Awaited<ReturnType<typeof fetchDrivingRoute>> = null;
  if (isDirectionsConfigured() && straightM >= 5 && straightM <= 150_000) {
    driving = await fetchDrivingRoute(start, goal, "traoptimal");
  }

  return NextResponse.json({
    straight: {
      distanceM: straightM,
      path: [start, goal],
    },
    driving,
    walking,
    directionsConfigured: isDirectionsConfigured(),
  });
}
