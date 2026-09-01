import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { applyRateLimit, WRITE_RATE_LIMIT } from "@/lib/rate-limit";
import { transcribeAudioUrl } from "@/lib/ai/transcribe";
import { recordFunnelEvent, FUNNEL_EVENT } from "@/lib/platform-funnel-events";
import { logger } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * [945 · 실사용50 #16] POST /api/ai/transcribe — 음성 메모 → 텍스트.
 *
 * lib/ai/transcribe 는 933부터 있었지만 어떤 라우트도 부르지 않았다 —
 * 현장에서 말로 남긴 첫인상이 글이 되지 못한 채 오디오로만 잠겨 있었다.
 *
 * 입력: { url } — /api/upload 가 돌려준 우리 Supabase 스토리지 URL만
 *       (transcribeAudioUrl 이 오리진을 강제 — SSRF 차단은 lib 쪽 규약).
 * 출력: { ok, text, source } — 키 미설정이면 ok:false reason:"unavailable"
 *       (화면은 "지금은 전사를 지원하지 않아요"로 그린다. 오류가 아니라 상태).
 *
 * 한도: 별도 월 한도 없이 로그인 + WRITE rate limit. STT 단가는 초안 LLM보다
 * 낮고, 입력 자체가 이 서비스에 업로드된 ≤60초 녹음뿐이라 남용 면이 좁다.
 */
export async function POST(req: NextRequest) {
  const limited = await applyRateLimit(req, WRITE_RATE_LIMIT);
  if (limited) return limited;

  const session = await auth();
  const email = session?.user?.email;
  if (!email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { url?: string };
  const url = String(body.url ?? "").trim();
  if (!url) {
    return NextResponse.json({ error: "url(녹음 파일 주소)이 필요합니다." }, { status: 400 });
  }

  try {
    const r = await transcribeAudioUrl(url, { language: "ko" });

    void recordFunnelEvent(req, {
      eventName: FUNNEL_EVENT.AI_TOOL_RUN,
      userEmail: email,
      path: "/api/ai/transcribe",
      metadata: { tool: "transcribe", source: r.source, ok: Boolean(r.text) },
    }).catch(() => {});

    if (r.source === "invalid_url") {
      return NextResponse.json({ error: "이 서비스에 업로드된 녹음만 전사할 수 있어요." }, { status: 400 });
    }
    if (r.source === "no_api_key") {
      return NextResponse.json({ ok: false, reason: "unavailable" });
    }
    if (!r.text) {
      return NextResponse.json({
        ok: false,
        reason: "empty",
        error: "전사에 실패했어요. 녹음이 너무 짧거나 잡음이 많을 수 있어요.",
      });
    }
    return NextResponse.json({ ok: true, text: r.text, source: r.source });
  } catch (e) {
    logger.error("[ai/transcribe] 실패", e);
    return NextResponse.json(
      { error: "전사 처리 중 오류가 났어요. 잠시 후 다시 시도해 주세요." },
      { status: 500 },
    );
  }
}
