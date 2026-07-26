import type { NextRequest } from "next/server";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/log";
import {
  publicApiJson,
  publicApiOptions,
  publicApiUnavailable,
} from "@/lib/api/public-response";
import { isProvisionalMonth, listAvailableMonths } from "@/lib/api/public-aggregates";

/* N20 — 집계가 존재하는 월 목록. API 이용자가 "언제부터 언제까지 있나"를
   먼저 묻는 자리라 rows 조회보다 이 엔드포인트가 입구가 된다. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return publicApiOptions();
}

export async function GET(req: NextRequest) {
  const limited = await applyRateLimit(req, { max: 120, windowMs: 60_000 });
  if (limited) return limited;

  try {
    const months = await listAvailableMonths();
    return publicApiJson({
      count: months.length,
      months: months.map((m) => ({ ...m, provisional: isProvisionalMonth(m.month) })),
    });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    logger.error("[api/public/v1/months] 월 목록 조회 실패:", detail);
    return publicApiUnavailable(detail);
  }
}
