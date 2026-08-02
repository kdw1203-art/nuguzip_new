import { NextResponse } from "next/server";
import { logger } from "@/lib/log";
import { safeAuth } from "@/lib/safe-auth";
import { getServiceSupabase } from "@/lib/supabase/service";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await safeAuth();
  const email = session?.user?.email?.trim().toLowerCase();
  if (!email) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { message?: string };
  const message = String(body.message ?? "").trim().slice(0, 1000);

  const sb = getServiceSupabase();
  if (!sb) return NextResponse.json({ ok: true, stored: false });

  const { error } = await sb.from("market_request_proposals").insert({
    request_id: id,
    proposer_email: email,
    message: message || "전문가 제안 요청",
    status: "pending",
  });
  if (error) {
    logger.error("[api] DB 오류", error.message);
    return NextResponse.json({ error: "서버 오류 — 잠시 후 다시 시도해 주세요." }, { status: 500 });
  }
  return NextResponse.json({ ok: true }, { status: 201 });
}

