import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getServiceSupabase } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * AI 분석 대시보드용 통계 API
 * - 오늘 분석 실행 횟수
 * - 전체 분석 실행 횟수
 * - 프리셋 수
 */
export async function GET() {
  const sb = getServiceSupabase();
  const session = await auth();
  const email = session?.user?.email ?? null;
  if (!sb) {
    return NextResponse.json({
      todayRuns: 0,
      totalRuns: 0,
      totalPresets: 0,
      myTotalRuns: 0,
      myTodayRuns: 0,
      topTools: [],
    });
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [todayRes, totalRes, presetsRes, myTodayRes, myTotalRes, byToolRes] = await Promise.allSettled([
    sb
      .from("ai_analysis_runs")
      .select("*", { count: "exact", head: true })
      .gte("created_at", today.toISOString()),
    sb
      .from("ai_analysis_runs")
      .select("*", { count: "exact", head: true }),
    sb
      .from("ai_analysis_presets")
      .select("*", { count: "exact", head: true }),
    email
      ? sb
          .from("ai_analysis_runs")
          .select("*", { count: "exact", head: true })
          .eq("author_email", email)
          .gte("created_at", today.toISOString())
      : Promise.resolve({ count: 0 }),
    email
      ? sb
          .from("ai_analysis_runs")
          .select("*", { count: "exact", head: true })
          .eq("author_email", email)
      : Promise.resolve({ count: 0 }),
    email
      ? sb
          .from("ai_analysis_runs")
          .select("tool")
          .eq("author_email", email)
          .order("created_at", { ascending: false })
          .limit(200)
      : Promise.resolve({ data: [] }),
  ]);

  const toolCounts = new Map<string, number>();
  if (byToolRes.status === "fulfilled") {
    const rows = (byToolRes.value as { data?: Array<{ tool?: string | null }> }).data ?? [];
    for (const row of rows) {
      const t = String(row.tool ?? "").trim();
      if (!t) continue;
      toolCounts.set(t, (toolCounts.get(t) ?? 0) + 1);
    }
  }
  const topTools = [...toolCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([tool, count]) => ({ tool, count }));

  return NextResponse.json({
    todayRuns:
      todayRes.status === "fulfilled" && typeof todayRes.value.count === "number"
        ? todayRes.value.count
        : 0,
    totalRuns:
      totalRes.status === "fulfilled" && typeof totalRes.value.count === "number"
        ? totalRes.value.count
        : 0,
    totalPresets:
      presetsRes.status === "fulfilled" && typeof presetsRes.value.count === "number"
        ? presetsRes.value.count
        : 0,
    myTodayRuns:
      myTodayRes.status === "fulfilled" &&
      typeof (myTodayRes.value as { count?: number }).count === "number"
        ? (myTodayRes.value as { count: number }).count
        : 0,
    myTotalRuns:
      myTotalRes.status === "fulfilled" &&
      typeof (myTotalRes.value as { count?: number }).count === "number"
        ? (myTotalRes.value as { count: number }).count
        : 0,
    topTools,
  });
}
