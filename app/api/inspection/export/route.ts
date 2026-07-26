import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { listSessions } from "@/lib/inspection/session-store";
import { fetchAppUserByEmail } from "@/lib/auth/fetch-app-user";
import { hasAccess, normalizePlanToGate, requirePlan } from "@/lib/subscriptions/access-gate";
import { dbUnavailable } from "@/lib/api/db-unavailable";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 못 읽은 목록을 "0건 내보내기"로 답하지 않기 위한 안내. */
const EXPORT_UNAVAILABLE = "지금은 내보낼 자료를 불러올 수 없습니다. 잠시 후 다시 시도해 주세요.";

/** GET /api/inspection/export?format=json|csv — B2B 내보내기 (EXPERT+) */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const profile = await fetchAppUserByEmail(session.user.email);
  const isAdmin = profile.role === "admin";
  const isExpert = hasAccess(normalizePlanToGate(profile.plan), requirePlan("pdf_export"));
  if (!isAdmin && !isExpert) {
    return NextResponse.json({ error: "EXPERT 플랜 또는 관리자 권한 필요" }, { status: 402 });
  }

  const url = new URL(req.url);
  const format = url.searchParams.get("format") ?? "json";
  /* 내보내기는 결과 파일이 손에 남는다. 조회 실패로 비어 버린 CSV 는 "이 계정에
     임장 기록이 없다"는 증거처럼 보관되므로, 빈 파일을 만들어 주지 않는다. */
  let items: Awaited<ReturnType<typeof listSessions>>;
  try {
    items = await listSessions(session.user.email, 100);
  } catch (err) {
    return dbUnavailable("임장 세션 내보내기 조회 실패", err, EXPORT_UNAVAILABLE);
  }

  const exportRows = items.map((s) => ({
    sessionId: s.id,
    region: s.region,
    aptName: s.aptName,
    status: s.status,
    startedAt: s.startedAt,
    overallScore: s.structuredReport?.scores.overall ?? null,
    observationCount: s.structuredReport?.observations.length ?? 0,
    reportVersion: s.reportVersion,
  }));

  if (format === "csv") {
    const headers = Object.keys(exportRows[0] ?? { sessionId: "" });
    const lines = [
      headers.join(","),
      ...exportRows.map((r) =>
        headers.map((h) => JSON.stringify((r as Record<string, unknown>)[h] ?? "")).join(","),
      ),
    ];
    return new NextResponse(lines.join("\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="inspection-export.csv"',
      },
    });
  }

  return NextResponse.json({ exportedAt: new Date().toISOString(), count: exportRows.length, items: exportRows });
}
