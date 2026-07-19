import { NextResponse } from "next/server";
import { getWeeklyDigest } from "@/lib/newui/digest";

export const runtime = "nodejs";
export const revalidate = 3600;

/** 주간 다이제스트 JSON (#86) — 추후 이메일/푸시 발송용과 동일 데이터 */
export async function GET() {
  const digest = await getWeeklyDigest();
  return NextResponse.json(digest, {
    headers: {
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=600",
    },
  });
}
