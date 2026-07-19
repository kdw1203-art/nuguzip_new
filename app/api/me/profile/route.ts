import { NextResponse } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { appendOnboardingStep } from "@/lib/onboarding/append-step";
import { loadMeProfile, normalizePersona } from "@/lib/me/profile";
import { getServiceSupabase } from "@/lib/supabase/service";

export const runtime = "nodejs";

/** GET /api/me/profile — 현재 사용자 프로필 조회 */
export async function GET() {
  const session = await safeAuth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const profile = await loadMeProfile(session.user.email, {
    name: session.user.name,
    plan: (session.user as { plan?: string }).plan,
    role: (session.user as { role?: string }).role,
  });

  return NextResponse.json({ profile });
}

/** PATCH /api/me/profile — 프로필 업데이트 (이름, 자기소개 등) */
export async function PATCH(req: Request) {
  const session = await safeAuth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "JSON이 필요합니다." }, { status: 400 });
  }

  const email = session.user.email;
  const updates: Record<string, unknown> = {};

  if (typeof body.name === "string") {
    const name = body.name.trim();
    if (name.length < 1 || name.length > 50) {
      return NextResponse.json({ error: "이름은 1~50자 이내로 입력해 주세요." }, { status: 400 });
    }
    updates.name = name;
  }

  if (typeof body.bio === "string") {
    updates.bio = body.bio.trim().slice(0, 500);
  }

  if (typeof body.phone === "string") {
    updates.phone = body.phone.trim().slice(0, 20);
  }

  if (typeof body.location === "string") {
    updates.location = body.location.trim().slice(0, 100);
  }

  if (typeof body.avatarUrl === "string") {
    const url = body.avatarUrl.trim();
    if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:image/")) {
      updates.avatar_url = url;
    }
  }

  if (body.persona !== undefined) {
    const p = normalizePersona(
      body.persona === null || body.persona === "" ? null : String(body.persona),
    );
    updates.persona = p;
  }
  if (body.primaryRegion !== undefined) {
    const r = String(body.primaryRegion ?? "").trim().slice(0, 80);
    updates.primary_region = r || null;
  }
  if (body.intentHorizon !== undefined) {
    const h = String(body.intentHorizon ?? "").trim().slice(0, 32);
    updates.intent_horizon = h || null;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "변경할 내용이 없습니다." }, { status: 400 });
  }

  const regionSaved =
    body.primaryRegion !== undefined &&
    String(updates.primary_region ?? "").trim().length > 0;

  const sb = getServiceSupabase();
  if (!sb) {
    // Supabase 미설정 — 세션 기반 프로필 반환
    const profile = await loadMeProfile(email, {
      name: String(updates.name ?? session.user.name ?? ""),
      plan: (session.user as { plan?: string }).plan,
      role: (session.user as { role?: string }).role,
    });
    return NextResponse.json({ profile, warning: "DB 미연결: 변경사항이 저장되지 않습니다." });
  }

  const dbUpdates: Record<string, unknown> = {
    ...updates,
    updated_at: new Date().toISOString(),
  };

  const { error } = await sb
    .from("app_users")
    .update(dbUpdates)
    .eq("email", email.trim().toLowerCase());

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (regionSaved) {
    void appendOnboardingStep(email, "explore");
  }

  const profile = await loadMeProfile(email, {
    name: String(updates.name ?? session.user.name ?? ""),
    plan: (session.user as { plan?: string }).plan,
    role: (session.user as { role?: string }).role,
  });

  return NextResponse.json({ profile });
}
