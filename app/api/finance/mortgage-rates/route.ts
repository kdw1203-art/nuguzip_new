/**
 * GET /api/finance/mortgage-rates
 * 주택담보대출 금리 (금융감독원 금융상품 공시 실데이터, 키 없으면 폴백 표).
 */
import { NextResponse } from "next/server";
import { getMortgageRates } from "@/lib/finance/mortgage-rates";

export const runtime = "nodejs";
export const revalidate = 21600; // 6h

export async function GET() {
  const data = await getMortgageRates();
  return NextResponse.json(data, {
    headers: { "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400" },
  });
}
