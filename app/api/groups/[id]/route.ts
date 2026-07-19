import { NextResponse } from "next/server";
import { getMeeting } from "@/lib/meetings/store-db";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const group = await getMeeting(id);
  if (!group) {
    return NextResponse.json({ error: "모임을 찾을 수 없습니다." }, { status: 404 });
  }
  return NextResponse.json({ group });
}
