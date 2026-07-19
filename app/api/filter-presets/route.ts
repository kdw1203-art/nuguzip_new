import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type FilterPreset = {
  id: string;
  userEmail: string;
  name: string;
  payload: Record<string, unknown>;
  createdAt: string;
};

/** 데모·로컬용 인메모리 저장 (운영 시 DB/Supabase 로 교체). */
const mem: FilterPreset[] = [];

export async function GET(req: NextRequest) {
  const userEmail = req.nextUrl.searchParams.get("userEmail") ?? "";
  return NextResponse.json(mem.filter((x) => x.userEmail === userEmail));
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const item: FilterPreset = {
    id: crypto.randomUUID(),
    userEmail: String(body.userEmail ?? ""),
    name: String(body.name ?? "내 프리셋"),
    payload: (body.payload as Record<string, unknown>) ?? {},
    createdAt: new Date().toISOString(),
  };
  mem.unshift(item);
  return NextResponse.json(item, { status: 201 });
}
