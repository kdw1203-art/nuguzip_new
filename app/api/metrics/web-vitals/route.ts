import { NextResponse, type NextRequest } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/log";
import { isMissingTableError, isTransientSchemaCacheError } from "@/lib/supabase/pg-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_METRICS = new Set(["LCP", "INP", "CLS", "FCP", "TTFB", "FID"]);

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
    if (isMissingTableError(error)) {
      return NextResponse.json({ ok: true, stored: false, reason: "table_missing" });
    }
    /* PGRST002 는 "테이블이 없다"가 아니라 "지금 DB 가 밀린다"이다. 예전 판정은
       메시지에 "schema cache" 가 들어 있다는 이유로 이걸 table_missing 으로
       돌려줬는데, 그러면 하루 열 몇 건의 일시적 장애가 "그 테이블은 원래 없다"는
       기록으로 남는다. 수집을 건너뛰는 건 같지만, 이유는 사실대로 적는다. */
    if (isTransientSchemaCacheError(error)) {
      return NextResponse.json(
        { ok: false, stored: false, reason: "db_busy" },
        { status: 503, headers: { "Retry-After": "30" } },
      );
    }
    /* 게이트웨이가 밀리면 error.message 가 HTML 오류 페이지 한 장(<!DOCTYPE html>…)
       통째로 들어온다. 그대로 흘리면 오류 대시보드가 그 본문으로 덮여 정작 봐야 할
       오류가 안 보인다 — 앞부분만 남긴다. 상태 코드는 그대로 500 이다(수집이
       실패한 건 사실이므로 성공으로 위장하지 않는다). */
    const brief = error.message.replace(/\s+/g, " ").slice(0, 200);
    logger.error("[web-vitals]", brief);
    return NextResponse.json({ ok: false, error: brief }, { status: 500 });
  }
  return NextResponse.json({ ok: true, stored: true });
}
