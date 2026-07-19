/**
 * GET /api/etl/apartment-sales?legal_code=11680&deal_ym=202606
 * Flask ETL 대응 — 국토부 아파트 매매 실거래 원시·정규화 데이터
 * 보호: CRON_SECRET 또는 관리자 세션
 */
import { NextResponse } from "next/server";
import { isAdminApiRequest } from "@/lib/admin/api-auth";
import { fetchMolitAptTrade } from "@/lib/national-data/molit-api";
import { resolveSigunguCd } from "@/lib/national-data/region-codes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function defaultDealYm(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export async function GET(req: Request) {
  const expected = process.env.CRON_SECRET?.trim();
  const url = new URL(req.url);
  const provided = url.searchParams.get("secret") ?? req.headers.get("x-cron-secret");
  const fromVercelCron = req.headers.get("x-vercel-cron") === "1";
  const authorized =
    fromVercelCron ||
    (expected ? provided === expected : false) ||
    (await isAdminApiRequest());
  if (!authorized) {
    return NextResponse.json({ error: "권한이 필요합니다." }, { status: 403 });
  }

  const legalCode = url.searchParams.get("legal_code")?.trim() ?? "11680";
  const dealYm = url.searchParams.get("deal_ym")?.trim() ?? defaultDealYm();
  const district = url.searchParams.get("district")?.trim();

  const resolvedCode = district ? resolveSigunguCd(district) : legalCode;

  const { rows, mode } = await fetchMolitAptTrade({
    district: district ?? undefined,
    yyyymm: dealYm,
  });

  return NextResponse.json({
    legal_code: resolvedCode,
    deal_ym: dealYm,
    mode,
    count: rows.length,
    items: rows,
  });
}
