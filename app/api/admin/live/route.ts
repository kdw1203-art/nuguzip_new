/**
 * GET /api/admin/live
 * Server-Sent Events 스트림. 30초마다 실시간 KPI 스냅샷 전송.
 * 관리자 전용.
 */
import { getServiceSupabase } from "@/lib/supabase/service";
import { loadAdminKpi } from "@/lib/admin/stats";
import { isAdminApiRequest } from "@/lib/admin/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface LiveSnapshot {
  todaySignups: number;
  todayPosts: number;
  activeUsers7d: number;
  pendingReports: number;
  totalUsers: number;
  totalPosts: number;
  paymentsCompleted30d: number;
  paymentsRevenue30dKrw: number;
  ts: number;
}

async function buildSnapshot(): Promise<LiveSnapshot> {
  const sb = getServiceSupabase();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayIso = today.toISOString();

  let todaySignups = 0;
  let todayPosts = 0;
  let pendingReports = 0;

  if (sb) {
    const [signupsRes, postsRes, reportsRes] = await Promise.all([
      sb
        .from("app_users")
        .select("id", { count: "exact", head: true })
        .gte("created_at", todayIso),
      sb
        .from("posts")
        .select("id", { count: "exact", head: true })
        .gte("created_at", todayIso),
      sb
        .from("content_reports")
        .select("id", { count: "exact", head: true })
        .eq("status", "open"),
    ]);
    todaySignups = signupsRes.count ?? 0;
    todayPosts = postsRes.count ?? 0;
    pendingReports = reportsRes.count ?? 0;
  }

  const kpi = await loadAdminKpi();

  return {
    todaySignups,
    todayPosts,
    activeUsers7d: kpi.activeUsers7d,
    pendingReports,
    totalUsers: kpi.totalUsers,
    totalPosts: kpi.totalPosts,
    paymentsCompleted30d: kpi.paymentsCompleted30d,
    paymentsRevenue30dKrw: kpi.paymentsRevenue30dKrw,
    ts: Date.now(),
  };
}

export async function GET() {
  if (!(await isAdminApiRequest())) {
    return new Response("관리자 권한이 필요합니다.", { status: 403 });
  }

  const encoder = new TextEncoder();
  let closed = false;
  let pingInterval: ReturnType<typeof setInterval> | null = null;
  let dataInterval: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    async start(controller) {
      async function sendSnapshot() {
        if (closed) return;
        try {
          const snap = await buildSnapshot();
          const msg = `data: ${JSON.stringify(snap)}\n\n`;
          controller.enqueue(encoder.encode(msg));
        } catch {
          // non-critical
        }
      }

      // 즉시 첫 번째 스냅샷 전송
      await sendSnapshot();

      // 15초마다 ping (연결 유지)
      pingInterval = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          closed = true;
        }
      }, 15_000);

      // 30초마다 데이터 전송
      dataInterval = setInterval(() => {
        void sendSnapshot();
      }, 30_000);
    },
    cancel() {
      closed = true;
      if (pingInterval) clearInterval(pingInterval);
      if (dataInterval) clearInterval(dataInterval);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
