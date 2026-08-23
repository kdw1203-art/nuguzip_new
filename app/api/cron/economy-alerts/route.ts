import { NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron/authorize";
import { getServiceSupabase } from "@/lib/supabase/service";
import { appendInboxNotification } from "@/lib/notifications/inbox";
import { logIngest, ingestErrorMessage } from "@/lib/market/store";

/* [AI-29] 경제지표 임계 알림 크론 — 일 1회(etl alerts 잡).
   v1: 기준금리(ecos:base-rate 캐시)만 본다. 임계를 넘긴 미통지 워치에
   인앱 알림 1회 → notified_at 기록(재등록 시 재무장). 같은 변동을 매일
   반복 알리지 않는다 — 알림의 신뢰가 반으로 줄기 때문. */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handle(req: Request) {
  const authorized = await authorizeCron(req);
  if (!authorized) {
    return NextResponse.json({ error: "권한이 필요합니다." }, { status: 403 });
  }
  const sb = getServiceSupabase();
  if (!sb) return NextResponse.json({ ok: false, reason: "service 미구성" }, { status: 503 });

  try {
    const { data: cacheRow } = await sb
      .from("public_data_cache")
      .select("payload")
      .eq("cache_key", "ecos:base-rate")
      .maybeSingle();
    const rate = Number((cacheRow as { payload?: { value?: string } } | null)?.payload?.value);
    if (!Number.isFinite(rate)) {
      await logIngest({
        source: "economy-alerts",
        dataset: "기준금리 임계 알림",
        origin: "cron-fetch",
        rows: 0,
        status: "skipped",
        message: "기준금리 캐시 없음(ecos-sync 선행 필요)",
      });
      return NextResponse.json({ ok: true, skipped: "no-rate" });
    }

    const { data: watches, error } = await sb
      .from("economy_watches")
      .select("id,user_email,threshold,direction")
      .eq("metric", "base_rate")
      .is("notified_at", null)
      .limit(500);
    if (error) throw error;

    let notified = 0;
    for (const w of (watches ?? []) as Array<{
      id: string;
      user_email: string;
      threshold: number;
      direction: "above" | "below";
    }>) {
      const th = Number(w.threshold);
      const hit = w.direction === "above" ? rate >= th : rate <= th;
      if (!hit) continue;
      await appendInboxNotification({
        userEmail: w.user_email,
        title: `기준금리 ${rate}% — 설정한 임계(${th}% ${w.direction === "above" ? "이상" : "이하"}) 도달`,
        body: "경제지표 모니터에서 등록한 조건입니다. 시뮬레이터로 이자 부담을 다시 계산해 보세요.",
        actionUrl: "/analysis/ai/ai-economy",
      }).catch(() => {});
      await sb
        .from("economy_watches")
        .update({ notified_at: new Date().toISOString() })
        .eq("id", w.id);
      notified += 1;
    }

    await logIngest({
      source: "economy-alerts",
      dataset: "기준금리 임계 알림",
      origin: "cron-fetch",
      rows: notified,
      status: "ok",
      message: `기준금리 ${rate}% · 대상 ${watches?.length ?? 0}건 중 통지 ${notified}건`,
    });
    return NextResponse.json({ ok: true, rate, notified });
  } catch (err) {
    const message = ingestErrorMessage(err, "경제지표 알림 실패");
    await logIngest({
      source: "economy-alerts",
      dataset: "기준금리 임계 알림",
      origin: "cron-fetch",
      rows: 0,
      status: "error",
      message,
    }).catch(() => {});
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return handle(req);
}
export async function POST(req: Request) {
  return handle(req);
}
