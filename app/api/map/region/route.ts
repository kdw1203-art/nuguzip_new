import { NextResponse } from "next/server";
import {
  getFacilitySummary,
  getPopulationSummary,
  getRealEstateSummary,
  getRedevelopmentSummary,
  getSchoolSummary,
  getWeeklyPriceSummary,
  type LocationRef,
} from "@/lib/datasources";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const city = url.searchParams.get("city") ?? "서울특별시";
  const district = url.searchParams.get("district") ?? undefined;
  const dong = url.searchParams.get("dong") ?? undefined;
  const lat = Number(url.searchParams.get("lat")) || undefined;
  const lng = Number(url.searchParams.get("lng")) || undefined;

  const location: LocationRef = { city, district, dong, lat, lng };

  const [realEstate, population, facilities, schools, weekly, redev] = await Promise.all([
    getRealEstateSummary(location),
    getPopulationSummary(location),
    getFacilitySummary(location),
    getSchoolSummary(location),
    getWeeklyPriceSummary(location),
    getRedevelopmentSummary(location),
  ]);

  return NextResponse.json({ realEstate, population, facilities, schools, weekly, redev });
}
