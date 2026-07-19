import { NextRequest } from "next/server";
import { ok, apiError } from "@/lib/api/response";
import { applyRateLimit, READ_RATE_LIMIT, WRITE_RATE_LIMIT } from "@/lib/rate-limit";
import { listReportsByAdminPolicy, updateReportByAdminPolicy } from "@/lib/chat/service";
import { requireChatActor, toErrorResponse } from "@/app/api/chat/_shared";
import type { ChatReportStatus } from "@/lib/chat/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const limited = await applyRateLimit(req, READ_RATE_LIMIT);
  if (limited) return limited;
  const { actor, error } = await requireChatActor();
  if (error || !actor) return error;
  const status = (req.nextUrl.searchParams.get("status") ?? "open") as ChatReportStatus | "all";
  if (!["all", "open", "reviewed", "dismissed", "actioned"].includes(status)) {
    return apiError("INVALID_STATUS", "status는 all/open/reviewed/dismissed/actioned 중 하나여야 합니다.", 400);
  }
  try {
    const reports = await listReportsByAdminPolicy(actor, status);
    return ok({ ok: true, reports });
  } catch (e) {
    return toErrorResponse(e);
  }
}

export async function PATCH(req: NextRequest) {
  const limited = await applyRateLimit(req, WRITE_RATE_LIMIT);
  if (limited) return limited;
  const { actor, error } = await requireChatActor();
  if (error || !actor) return error;
  const body = (await req.json().catch(() => ({}))) as {
    reportId?: string;
    status?: ChatReportStatus;
  };
  const reportId = String(body.reportId ?? "").trim();
  const status = body.status ?? "reviewed";
  if (!reportId) return apiError("REPORT_ID_REQUIRED", "reportId가 필요합니다.", 400);
  if (!["open", "reviewed", "dismissed", "actioned"].includes(status)) {
    return apiError("INVALID_STATUS", "status가 올바르지 않습니다.", 400);
  }
  try {
    const result = await updateReportByAdminPolicy(actor, reportId, status);
    return ok(result);
  } catch (e) {
    return toErrorResponse(e);
  }
}
