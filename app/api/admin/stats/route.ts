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

/** 오늘 결제 합계용 조회 상한 — 닿으면 과소 집계이므로 경고를 남긴다(#32) */
const TODAY_PAYMENTS_LIMIT = 5000;

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

  /* #32 — 건수는 행을 받아 .length 로 세지 않는다. PostgREST 는 상한(max-rows)이
     걸리면 조용히 잘린 배열을 주므로 대기 건수가 상한에서 멈춘 것처럼 보인다.
     head:true + count:"exact" 는 행을 전혀 옮기지 않고 정확한 수를 돌려준다. */
  const [
    { count: totalConsultations },
    { data: todayPayments },
    { count: pendingExperts },
    { count: pendingMeetings },
    { count: openReports },
  ] = await Promise.all([
    sb.from("expert_consultations").select("*", { count: "exact", head: true }),
    sb
      .from("payments")
      .select("amount")
      .eq("status", "paid")
      .gte("paid_at", todayStart)
      .limit(TODAY_PAYMENTS_LIMIT),
    sb
      .from("expert_verification_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    sb.from("meeting_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
    sb.from("content_reports").select("id", { count: "exact", head: true }).eq("status", "open"),
  ]);

  const payments = todayPayments ?? [];
  const todayRevenue = payments.reduce(
    (s: number, p: { amount: number }) => s + (p.amount ?? 0),
    0,
  );
  /* 합계는 상한에 닿는 순간 "적게 번 것"으로 보인다 — 조용히 넘기지 않고
     남긴다. 하루 결제가 이 상한에 닿으면 집계를 SQL 합계로 옮겨야 한다. */
  const todayRevenueTruncated = payments.length >= TODAY_PAYMENTS_LIMIT;
  if (todayRevenueTruncated) {
    console.warn(
      `[admin/stats] 오늘 결제가 조회 상한(${TODAY_PAYMENTS_LIMIT}행)에 도달 — todayRevenue 가 과소 집계입니다.`,
    );
  }

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
      /* 과소 집계 여부를 값 옆에 같이 준다 — 화면이 숫자를 그냥 믿지 않도록 */
      todayRevenueTruncated,
    },
    planDistribution: Object.entries(kpi.planCounts).map(([plan, count]) => ({ plan, count })),
    pendingReview: {
      expertVerifications: pendingExperts ?? 0,
      meetingRequests: pendingMeetings ?? 0,
      contentReports: openReports ?? 0,
    },
  });
}
