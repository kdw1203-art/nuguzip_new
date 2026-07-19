import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getServiceSupabase } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST — 임장 캡처(음성·사진·위치·AI) 동의 기록 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const version = String(body.version ?? "2026-06-19");

  const sb = getServiceSupabase();
  if (!sb) {
    return NextResponse.json({ ok: true, stored: false });
  }

  const email = session.user.email.trim().toLowerCase();
  const { error } = await sb.from("user_consents").upsert(
    {
      user_email: email,
      field_capture_agreed: true,
      field_capture_version: version,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_email" },
  );

  if (error && !/field_capture|column/i.test(error.message)) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, stored: !error });
}
