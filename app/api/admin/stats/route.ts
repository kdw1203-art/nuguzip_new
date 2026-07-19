/**
 * GET /api/admin/stats — 관리자 확장 집계
 *
 * `GET /api/admin`의 KPI 계약을 그대로 포함하고,
 * 운영용 보조 집계(오늘 매출/검토 대기 큐)를 추가 제공합니다.
 */
import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { loadAdminKpi } from "@/lib/admin/stats";
import { isAdminApiRequest } from "@/lib/admin/api-auth";

export const runtime = "nodejs";

export async function GET() {
  if (!(await isAdminApiRequest())) {
    return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  }

  const kpi = await loadAdminKpi();
  const sb = getServiceSupabase();
  if (!sb) {
    return NextResponse.json({
      kpi,
      totals: {
        users: kpi.totalUsers,
        posts: kpi.totalPosts,
        meetings: kpi.totalMeetings,
        experts: kpi.totalExperts,
        reports: kpi.totalReports,
        inspectionNotes: kpi.totalInspections,
        consultations: 0,
      },
      trends: {
        newUsers7d: kpi.newUsers7d,
        todayRevenue: 0,
      },
      planDistribution: Object.entries(kpi.planCounts).map(([plan, count]) => ({ plan, count })),
      pendingReview: {
        expertVerifications: 0,
        meetingRequests: 0,
        contentReports: 0,
      },
    });
  }

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

  const [
    { count: totalConsultations },
    { data: todayPayments },
    { data: pendingExperts },
    { data: pendingMeetings },
    { data: openReports },
  ] = await Promise.all([
    sb.from("expert_consultations").select("*", { count: "exact", head: true }),
    sb.from("payments").select("amount").eq("status", "paid").gte("paid_at", todayStart),
    sb.from("expert_verification_requests").select("id").eq("status", "pending"),
    sb.from("meeting_requests").select("id").eq("status", "pending"),
    sb.from("content_reports").select("id").eq("status", "open"),
  ]);

  const todayRevenue = (todayPayments ?? []).reduce(
    (s: number, p: { amount: number }) => s + (p.amount ?? 0),
    0,
  );

  return NextResponse.json({
    kpi,
    totals: {
      users: kpi.totalUsers,
      posts: kpi.totalPosts,
      meetings: kpi.totalMeetings,
      experts: kpi.totalExperts,
      reports: kpi.totalReports,
      inspectionNotes: kpi.totalInspections,
      consultations: totalConsultations ?? 0,
    },
    trends: {
      newUsers7d: kpi.newUsers7d,
      todayRevenue,
    },
    planDistribution: Object.entries(kpi.planCounts).map(([plan, count]) => ({ plan, count })),
    pendingReview: {
      expertVerifications: (pendingExperts ?? []).length,
      meetingRequests: (pendingMeetings ?? []).length,
      contentReports: (openReports ?? []).length,
    },
  });
}
