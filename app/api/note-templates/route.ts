import { NextResponse } from "next/server";
import { listTemplates } from "@/lib/note-templates/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/note-templates?category=기본 → { items: NoteTemplate[] } */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category") ?? undefined;
  const items = await listTemplates(category ?? undefined);
  return NextResponse.json({ items });
}
