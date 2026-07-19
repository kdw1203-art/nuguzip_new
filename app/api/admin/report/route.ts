import { NextResponse } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { estimateSubscriptionMrrKrw } from "@/lib/admin/subscription-metrics";
import { loadAdminKpi, loadRegionDistribution } from "@/lib/admin/stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 관리자 대시보드 KPI 를 CSV 로 다운로드.
 * 관리자 권한자만 접근 가능.
 */
export async function GET() {
  const session = await safeAuth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const [kpi, regions] = await Promise.all([
    loadAdminKpi(),
    loadRegionDistribution(),
  ]);

  const rows: Array<[string, string]> = [
    ["metric", "value"],
    ["totalUsers", String(kpi.totalUsers)],
    ["activeUsers7d", String(kpi.activeUsers7d)],
    ["newUsers7d", String(kpi.newUsers7d)],
    ["newUsers30d", String(kpi.newUsers30d)],
    ["newUsersToday", String(kpi.newUsersToday)],
    ["totalAdmins", String(kpi.totalAdmins)],
    ["totalPosts", String(kpi.totalPosts)],
    ["postsToday", String(kpi.postsToday)],
    ["postsThisWeek", String(kpi.postsThisWeek)],
    ["totalExperts", String(kpi.totalExperts)],
    ["totalMeetings", String(kpi.totalMeetings)],
    ["meetingsToday", String(kpi.meetingsToday)],
    ["marketOpen", String(kpi.marketOpen)],
    ["marketTotal", String(kpi.marketTotal)],
    ["totalInspections", String(kpi.totalInspections)],
    ["inspectionsThisWeek", String(kpi.inspectionsThisWeek)],
    ["aiAnalysisRuns7d", kpi.aiAnalysisRuns7d == null ? "" : String(kpi.aiAnalysisRuns7d)],
    [
      "platformActivityEvents7d",
      kpi.platformActivityEvents7d == null ? "" : String(kpi.platformActivityEvents7d),
    ],
    ["totalReportDocs", String(kpi.totalReportDocs)],
    ["reportDocsToday", String(kpi.reportDocsToday)],
    ["openReports", String(kpi.openReports)],
    ["pendingOutbox", String(kpi.pendingOutbox)],
    ["pendingExpertRequests", String(kpi.pendingExpertRequests)],
    ["pendingMeetingRequests", String(kpi.pendingMeetingRequests)],
    [
      "mrrSubscriptionKrw_estimated",
      String(estimateSubscriptionMrrKrw(kpi.planCounts)),
    ],
  ];

  for (const [plan, count] of Object.entries(kpi.planCounts)) {
    rows.push([`plan_${plan}`, String(count)]);
  }
  for (const r of regions) {
    rows.push([`region_${r.region}`, `${r.count} (${r.pct}%)`]);
  }

  const csv = rows
    .map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(","))
    .join("\n");

  // UTF-8 BOM for Excel compatibility
  const body = "\ufeff" + csv;
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
