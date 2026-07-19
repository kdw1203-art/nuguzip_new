import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAiAnalysisToolId, type AiAnalysisToolId } from "@/lib/ai/ai-tools";
import { createPreset, listPresets } from "@/lib/ai/presets-store";
import { logger } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const tool = searchParams.get("tool");
  const tid = tool && isAiAnalysisToolId(tool) ? (tool as AiAnalysisToolId) : undefined;
  const presets = await listPresets(email, tid);
  return NextResponse.json({ presets });
}

export async function POST(req: Request) {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "JSON 본문이 필요합니다." }, { status: 400 });
  }
  const tool = body.tool;
  if (!isAiAnalysisToolId(tool as string)) {
    return NextResponse.json({ error: "유효하지 않은 도구입니다." }, { status: 400 });
  }
  const title = String(body.title ?? "").slice(0, 200);
  const objective =
    body.objective && typeof body.objective === "object" && !Array.isArray(body.objective)
      ? (body.objective as Record<string, unknown>)
      : {};
  const subjectiveMemo = String(body.subjectiveMemo ?? "").slice(0, 16_000);
  try {
    const preset = await createPreset({
      authorEmail: email,
      tool: tool as AiAnalysisToolId,
      title,
      objective,
      subjectiveMemo,
    });
    return NextResponse.json({ preset });
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("DUPLICATE_PRESET:")) {
      return NextResponse.json(
        {
          error: "같은 조건의 프리셋이 이미 있습니다.",
          duplicateId: e.message.replace("DUPLICATE_PRESET:", ""),
        },
        { status: 409 },
      );
    }
    logger.error("[ai/presets POST]", e);
    return NextResponse.json({ error: "저장에 실패했습니다." }, { status: 500 });
  }
}
