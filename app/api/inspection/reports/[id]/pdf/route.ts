import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { fetchAppUserByEmail } from "@/lib/auth/fetch-app-user";
import { getSession } from "@/lib/inspection/session-store";
import { pdfBrandingForPlan } from "@/lib/inspection/pdf-branding";
import { buildInspectionReportPdf } from "@/lib/inspection/report-pdf";
import {
  hasAccess,
  normalizePlanToGate,
  requirePlan,
} from "@/lib/subscriptions/access-gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

async function loadAuthorizedSession(id: string, email: string) {
  const row = await getSession(id);
  if (!row) return { error: NextResponse.json({ error: "not found" }, { status: 404 }) };
  if (row.authorEmail !== email) {
    return { error: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  }
  if (!row.structuredReport) {
    return { error: NextResponse.json({ error: "report not ready" }, { status: 409 }) };
  }
  return { row };
}

/** GET /api/inspection/reports/[id]/pdf — 인쇄용 HTML URL 반환 */
export async function GET(_req: Request, ctx: Ctx) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const { id } = await ctx.params;
  const loaded = await loadAuthorizedSession(id, session.user.email);
  if ("error" in loaded && loaded.error) return loaded.error;

  const base = process.env.NEXT_PUBLIC_BASE_URL ?? "";
  return NextResponse.json({
    printUrl: `${base}/inspection/reports/${id}/print`,
    downloadUrl: `${base}/api/inspection/reports/${id}/pdf`,
    status: "ready",
  });
}

/** POST /api/inspection/reports/[id]/pdf — 서버 PDF 바이트 반환 */
export async function POST(_req: Request, ctx: Ctx) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const profile = await fetchAppUserByEmail(session.user.email);
  const gatePlan = normalizePlanToGate(profile.plan);
  if (!hasAccess(gatePlan, requirePlan("pdf_export"))) {
    return NextResponse.json(
      { error: "PDF 내보내기는 PRO 이상 플랜에서 이용 가능합니다." },
      { status: 403 },
    );
  }

  const { id } = await ctx.params;
  const loaded = await loadAuthorizedSession(id, session.user.email);
  if ("error" in loaded && loaded.error) return loaded.error;
  const row = loaded.row!;

  const branding = pdfBrandingForPlan(profile.plan, session.user.name ?? undefined);
  const bytes = await buildInspectionReportPdf({
    title: row.aptName ?? row.region,
    region: row.region,
    startedAt: row.startedAt,
    report: row.structuredReport!,
    branding,
  });

  const safeName = (row.aptName ?? row.region).replace(/[^\w가-힣-]+/g, "_").slice(0, 40);
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="nuguzip-${safeName}-${id.slice(0, 8)}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
