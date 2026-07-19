import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { buildBriefingScript, synthesizeBriefingMp3 } from "@/lib/ai/tts-briefing";
import type { StructuredReport } from "@/lib/inspection/ontology";

/** POST /api/inspection/tts — 임장 결과 TTS 브리핑 MP3 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const propertyLabel = String(body.propertyLabel ?? "임장 대상");
  const report = body.report as StructuredReport | undefined;

  let script = String(body.script ?? "").trim();
  if (!script && report?.topSummary) {
    script = buildBriefingScript(propertyLabel, report);
  }
  if (!script) {
    return NextResponse.json({ error: "script or report required" }, { status: 400 });
  }

  const mp3 = await synthesizeBriefingMp3(script);
  if (!mp3) {
    return NextResponse.json({ error: "tts_unavailable" }, { status: 503 });
  }

  return new NextResponse(mp3, {
    status: 200,
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
