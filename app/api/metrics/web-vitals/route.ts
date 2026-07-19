import { NextResponse, type NextRequest } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_METRICS = new Set(["LCP", "INP", "CLS", "FCP", "TTFB", "FID"]);

function isMissingTableError(message: string | undefined): boolean {
  const m = (message ?? "").toLowerCase();
  return m.includes("schema cache") || m.includes("web_vitals");
}

type VitalsPayload = {
  metric?: string;
  value?: number | string;
  rating?: string;
  path?: string;
  navType?: string;
};

export async function POST(req: NextRequest): Promise<Response> {
  let body: VitalsPayload;
  try {
    body = (await req.json()) as VitalsPayload;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const metric = String(body.metric ?? "").toUpperCase();
  if (!VALID_METRICS.has(metric)) {
    return NextResponse.json({ ok: false, error: "invalid metric" }, { status: 400 });
  }
  const value = Number(body.value);
  if (!Number.isFinite(value)) {
    return NextResponse.json({ ok: false, error: "invalid value" }, { status: 400 });
  }

  const sb = getServiceSupabase();
  if (!sb) {
    // 개발 환경 fallback — 로그만 남김
    logger.info("[web-vitals:stub]", metric, Math.round(value * 100) / 100, body.path ?? "");
    return NextResponse.json({ ok: true, stored: false });
  }

  const { error } = await sb.from("web_vitals").insert({
    metric,
    value,
    rating: typeof body.rating === "string" ? body.rating.slice(0, 16) : null,
    path: typeof body.path === "string" ? body.path.slice(0, 256) : null,
    nav_type: typeof body.navType === "string" ? body.navType.slice(0, 32) : null,
    user_agent: (req.headers.get("user-agent") ?? "").slice(0, 256) || null,
  });
  if (error) {
    // 초기 운영에서 테이블이 아직 없으면 수집만 생략하고 정상 응답
    if (isMissingTableError(error.message)) {
      return NextResponse.json({ ok: true, stored: false, reason: "table_missing" });
    }
    logger.error("[web-vitals]", error.message);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, stored: true });
}
