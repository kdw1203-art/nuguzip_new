import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/log";

/* [#107] 위젯 임베드 비콘 — iframe 안 스크립트가 document.referrer(=임베드한
   부모 페이지)를 보낸다. host 단위 일집계만 저장(개인 식별 없음), URL 은 표본
   1개만 보관. 실패는 204 로 삼킨다 — 남의 블로그 콘솔에 우리 에러를 띄우지 않는다. */

export const runtime = "nodejs";

function hostOf(u: string): string | null {
  try {
    const h = new URL(u).hostname.toLowerCase();
    if (!h || h === "nuguzip.com" || h.endsWith(".nuguzip.com")) return null; // 자체 페이지 제외
    return h.slice(0, 100);
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { ref?: string; kind?: string };
    const host = hostOf(String(body.ref ?? ""));
    const kind = body.kind === "region" ? "region" : "complex";
    if (!host) return new NextResponse(null, { status: 204 });
    const sb = getServiceSupabase();
    if (!sb) return new NextResponse(null, { status: 204 });
    const day = new Date().toISOString().slice(0, 10);
    // upsert 증가 — 경합은 드물고(블로그 뷰), 정확한 카운트보다 존재 신호가 목적
    const { data } = await sb
      .from("widget_embed_hits")
      .select("hits")
      .eq("host", host)
      .eq("day", day)
      .eq("kind", kind)
      .maybeSingle();
    await sb.from("widget_embed_hits").upsert(
      {
        host,
        day,
        kind,
        hits: (Number(data?.hits) || 0) + 1,
        sample_url: String(body.ref ?? "").slice(0, 300),
      },
      { onConflict: "host,day,kind" },
    );
  } catch (e) {
    logger.warn("[embed-beacon] 기록 실패", e);
  }
  return new NextResponse(null, { status: 204 });
}
