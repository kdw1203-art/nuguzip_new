/**
 * GET /api/banners?placement=home
 * 일반 사용자용 배너 조회 (활성 배너만 반환)
 */
import { NextResponse } from "next/server";
import { listBanners, type BannerPlacement } from "@/lib/admin/banners";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const placement = (url.searchParams.get("placement") ?? "home") as BannerPlacement;
  const banners = await listBanners(placement);
  return NextResponse.json({ banners });
}
