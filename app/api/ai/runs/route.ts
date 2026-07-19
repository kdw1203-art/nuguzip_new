import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { listRuns } from "@/lib/ai/presets-store";

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
  const runs = await listRuns(email, limit);
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
