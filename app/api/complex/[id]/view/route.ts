/**
 * POST /api/complex/[id]/view — 단지 상세 조회수 +1.
 */
import { NextResponse } from "next/server";
import { recordComplexView } from "@/lib/listings/engagement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  await recordComplexView(id);
  return NextResponse.json({ ok: true });
}
