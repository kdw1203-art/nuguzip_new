import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { listSessions } from "@/lib/inspection/session-store";
import { fetchAppUserByEmail } from "@/lib/auth/fetch-app-user";
import { hasAccess, normalizePlanToGate, requirePlan } from "@/lib/subscriptions/access-gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  const items = await listSessions(session.user.email, 100);

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
