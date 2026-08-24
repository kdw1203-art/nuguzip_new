/* [OPT-43] 클라이언트 에러 계측 — Sentry(오너 ④) 이전에도 "얼마나 깨지는지"는 센다.
   window error/unhandledrejection 을 platform_activity_events(event=client_error)로.
   도배 방지: IP당 분당 10건. 메시지·스택 머리만 저장(개인정보·토큰 유입 방지 절단). */
import { NextResponse, type NextRequest } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { getClientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<Response> {
  const rl = rateLimit(`client-error:${getClientIp(req)}`, { limit: 10, windowMs: 60_000 });
  if (!rl.ok) return tooManyRequests(rl.retryAfterSec);
  let body: { message?: string; stack?: string; path?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const sb = getServiceSupabase();
  if (sb) {
    await sb.from("platform_activity_events").insert({
      platform: "web",
      event_name: "client_error",
      user_email: null,
      source: null,
      campaign: null,
      path: typeof body.path === "string" ? body.path.slice(0, 300) : null,
      metadata: {
        message: typeof body.message === "string" ? body.message.slice(0, 300) : null,
        stackHead: typeof body.stack === "string" ? body.stack.slice(0, 400) : null,
      },
    });
  }
  return NextResponse.json({ ok: true });
}
