/**
 * GET/PATCH /api/me/consents — 마케팅·위치정보 동의 조회/철회
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getServiceSupabase } from "@/lib/supabase/service";
import { dbUnavailable } from "@/lib/api/db-unavailable";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ConsentBody = {
  marketing?: boolean;
  location?: boolean;
};

async function loadConsents(email: string) {
  const sb = getServiceSupabase();
  if (!sb) return null;

  const { data: row } = await sb
    .from("user_consents")
    .select("marketing_agreed, location_agreed, updated_at")
    .eq("user_email", email)
    .maybeSingle();

  const { data: user } = await sb
    .from("app_users")
    .select("marketing_agreed, location_agreed")
    .eq("email", email)
    .maybeSingle();

  return {
    marketing: Boolean(row?.marketing_agreed ?? user?.marketing_agreed ?? false),
    location: Boolean(row?.location_agreed ?? user?.location_agreed ?? false),
    updatedAt: row?.updated_at ? String(row.updated_at) : null,
  };
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  try {
    const consents = await loadConsents(session.user.email.trim().toLowerCase());
    if (!consents) {
      return NextResponse.json({ error: "서비스를 이용할 수 없습니다." }, { status: 503 });
    }
    return NextResponse.json({ ok: true, consents });
  } catch (err) {
    return dbUnavailable("동의 조회 실패", err, "동의 상태를 불러올 수 없습니다.");
  }
}

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const email = session.user.email.trim().toLowerCase();
  const body = (await req.json().catch(() => ({}))) as ConsentBody;
  const patch: ConsentBody = {};
  if (typeof body.marketing === "boolean") patch.marketing = body.marketing;
  if (typeof body.location === "boolean") patch.location = body.location;
  if (patch.marketing === undefined && patch.location === undefined) {
    return NextResponse.json({ error: "변경할 동의 항목이 없습니다." }, { status: 400 });
  }

  const sb = getServiceSupabase();
  if (!sb) {
    return NextResponse.json({ error: "서비스를 이용할 수 없습니다." }, { status: 503 });
  }

  const now = new Date().toISOString();
  const consentUpsert: Record<string, unknown> = {
    user_email: email,
    updated_at: now,
  };
  const userPatch: Record<string, unknown> = {
    consent_updated_at: now,
  };
  if (typeof patch.marketing === "boolean") {
    consentUpsert.marketing_agreed = patch.marketing;
    userPatch.marketing_agreed = patch.marketing;
  }
  if (typeof patch.location === "boolean") {
    consentUpsert.location_agreed = patch.location;
    userPatch.location_agreed = patch.location;
  }

  const { error: cErr } = await sb
    .from("user_consents")
    .upsert(consentUpsert, { onConflict: "user_email" });
  if (cErr) {
    return NextResponse.json({ error: cErr.message }, { status: 500 });
  }

  await sb.from("app_users").update(userPatch).eq("email", email);

  const consents = await loadConsents(email);
  return NextResponse.json({ ok: true, consents });
}
