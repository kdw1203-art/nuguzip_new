/**
 * GET /api/applyhome/competition
 * 청약홈 APT 분양정보/경쟁률 (odcloud ApplyhomeInfoCmpetRtSvc)
 */
import { NextResponse } from "next/server";
import { fetchAptCompetition } from "@/lib/applyhome/adapters/apt-competition";
import type { ApplyhomeCompetitionEndpoint } from "@/lib/applyhome/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ENDPOINTS: ApplyhomeCompetitionEndpoint[] = [
  "getAPTLttotPblancCmpet",
  "getUrbtyOfctlLttotPblancCmpet",
  "getAptLttotPblancScore",
  "getOPTLttotPblancCmpet",
];

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const endpointParam = searchParams.get("endpoint") ?? "getAPTLttotPblancCmpet";
  const endpoint = ENDPOINTS.includes(endpointParam as ApplyhomeCompetitionEndpoint)
    ? (endpointParam as ApplyhomeCompetitionEndpoint)
    : "getAPTLttotPblancCmpet";

  try {
    const data = await fetchAptCompetition({
      endpoint,
      page: Number(searchParams.get("page") ?? "1") || 1,
      perPage: Math.min(Number(searchParams.get("perPage") ?? "20") || 20, 50),
      houseManageNo: searchParams.get("houseManageNo") ?? undefined,
      pblancNo: searchParams.get("pblancNo") ?? undefined,
    });
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Applyhome fetch failed";
    return NextResponse.json({ error: message, mode: "error" }, { status: 502 });
  }
}
