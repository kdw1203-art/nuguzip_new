import { NextResponse } from "next/server";
import { isAdminApiRequest } from "@/lib/admin/api-auth";
import { isOnbidConfigured } from "@/lib/onbid/client";
import { syncOnbidSeoul } from "@/lib/onbid/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * 온비드 서울권 부동산 공매 물건 동기화 크론.
 * 보호: CRON_SECRET 또는 관리자 세션. 키 없으면 skipped(정상 폴백).
 */
export async function GET(req: Request) {
  const expected = process.env.CRON_SECRET?.trim();
  const url = new URL(req.url);
  const provided =
    url.searchParams.get("secret") ?? req.headers.get("x-cron-secret");
  const fromVercelCron = req.headers.get("x-vercel-cron") === "1";
  const authorized =
    fromVercelCron ||
    (expected ? provided === expected : true) ||
    (await isAdminApiRequest());
  if (!authorized) {
    return NextResponse.json({ error: "권한이 필요합니다." }, { status: 403 });
  }
  if (!isOnbidConfigured()) {
    return NextResponse.json({
      ok: false,
      skipped: true,
      reason: "ONBID_SERVICE_KEY 미설정 — 설정 시 서울권 공매 물건이 자동 적재됩니다.",
    });
  }
  const sido = url.searchParams.get("sido")?.trim() || undefined;
  const maxPages = Number(url.searchParams.get("pages") ?? "5") || 5;
  const result = await syncOnbidSeoul({ sido, maxPages });
  return NextResponse.json(result);
}
