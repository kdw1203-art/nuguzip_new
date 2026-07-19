import { NextResponse } from "next/server";
import { fetchBrokers } from "@/lib/seoul/adapters/broker";
import { isVworldConfigured, isVworldRebBrokerAvailable } from "@/lib/vworld/adapters";

/**
 * GET /api/public-data/brokers?district=강남구&q=...
 * 전국 부동산중개업 (VWorld) + 서울 Open API fallback
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const district = url.searchParams.get("district") ?? undefined;
  const q = url.searchParams.get("q") ?? undefined;

  const payload = await fetchBrokers({ district, q });
  const vworldConfigured = isVworldConfigured();
  const vworldBrokerLive = vworldConfigured ? await isVworldRebBrokerAvailable() : false;

  return NextResponse.json({
    ...payload,
    vworldConfigured,
    vworldBrokerLive,
    notice: vworldConfigured && !vworldBrokerLive
      ? "VWorld 인증키에 「부동산중개업정보」 국가중점 API 활성화가 필요합니다."
      : undefined,
  });
}
