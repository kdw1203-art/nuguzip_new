import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { getServiceSupabase } from "@/lib/supabase/service";
import { applyRateLimit, WRITE_RATE_LIMIT } from "@/lib/rate-limit";
import { dbUnavailable } from "@/lib/api/db-unavailable";

/* [AI-29] 경제지표 임계 알림 등록 — v1 지표는 기준금리(base_rate)만.
   "보러 오는 모니터"를 "와야 할 때 부르는 모니터"로. 검사는 일일 크론
   (/api/cron/economy-alerts)이 하고, 알림은 인앱 알림함으로 간다. */

const METRICS = new Set(["base_rate"]);

export async function GET() {
  const session = await safeAuth();
  const email = session?.user?.email;
  if (!email) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const sb = getServiceSupabase();
  if (!sb) return dbUnavailable("economy-watch", new Error("service 미구성"));
  const { data, error } = await sb
    .from("economy_watches")
    .select("id,metric,threshold,direction,notified_at,created_at")
    .eq("user_email", email)
    .order("created_at", { ascending: false });
  if (error) return dbUnavailable("economy-watch", error);
  return NextResponse.json({ items: data ?? [] });
}

export async function POST(req: NextRequest) {
  const limited = await applyRateLimit(req, WRITE_RATE_LIMIT);
  if (limited) return limited;
  const session = await safeAuth();
  const email = session?.user?.email;
  if (!email) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    metric?: unknown;
    threshold?: unknown;
    direction?: unknown;
  } | null;
  const metric = String(body?.metric ?? "base_rate");
  const threshold = Number(body?.threshold);
  const direction = body?.direction === "below" ? "below" : "above";
  if (!METRICS.has(metric)) {
    return NextResponse.json({ error: "지원하지 않는 지표예요." }, { status: 400 });
  }
  if (!Number.isFinite(threshold) || threshold <= 0 || threshold > 20) {
    return NextResponse.json({ error: "임계값은 0~20 사이 %로 넣어 주세요." }, { status: 400 });
  }
  const sb = getServiceSupabase();
  if (!sb) return dbUnavailable("economy-watch", new Error("service 미구성"));
  const { error } = await sb.from("economy_watches").upsert(
    {
      user_email: email,
      metric,
      threshold,
      direction,
      notified_at: null, // 재등록 = 재무장
    },
    { onConflict: "user_email,metric,direction" },
  );
  if (error) return dbUnavailable("economy-watch", error);
  return NextResponse.json({
    ok: true,
    note: `기준금리가 ${threshold}% ${direction === "above" ? "이상으로 오르면" : "이하로 내리면"} 알림함으로 알려드려요.`,
  });
}

export async function DELETE(req: NextRequest) {
  const session = await safeAuth();
  const email = session?.user?.email;
  if (!email) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id가 필요합니다." }, { status: 400 });
  const sb = getServiceSupabase();
  if (!sb) return dbUnavailable("economy-watch", new Error("service 미구성"));
  const { error } = await sb
    .from("economy_watches")
    .delete()
    .eq("id", id)
    .eq("user_email", email);
  if (error) return dbUnavailable("economy-watch", error);
  return NextResponse.json({ ok: true });
}
