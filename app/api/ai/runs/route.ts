import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { listRuns } from "@/lib/ai/presets-store";

import { dbUnavailable } from "@/lib/api/db-unavailable";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const url = new URL(req.url);
  const limit = Math.min(60, Math.max(1, Number(url.searchParams.get("limit") ?? 60) || 60));
  /* []를 내보내면 "분석 기록이 없어요"가 뜬다 — 돈 내고 돌린 분석이
     사라져 보인다. 못 읽었으면 503 으로 말한다. */
  let runs: Awaited<ReturnType<typeof listRuns>>;
  try {
    runs = await listRuns(email, limit);
  } catch (e) {
    return dbUnavailable("ai-runs", e);
  }
  return NextResponse.json({
    runs: runs.map((r) => ({
      id: r.id,
      tool: r.tool,
      presetId: r.presetId,
      createdAt: r.createdAt,
      modelId: r.modelId,
      source: r.source,
      platform: r.platform,
      structuredSummary: r.structuredSummary,
      excerpt: r.markdown.replace(/\s+/g, " ").slice(0, 200),
      markdown: r.markdown,
      publicContextSnapshot: r.publicContextSnapshot,
    })),
  });
}
