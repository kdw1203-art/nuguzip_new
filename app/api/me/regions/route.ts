import { NextResponse } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { getServiceSupabase } from "@/lib/supabase/service";
import { dbUnavailable } from "@/lib/api/db-unavailable";
import type { UserRegion } from "@/lib/me/user-regions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeRegions(raw: unknown): UserRegion[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r) => {
      const o = r as Record<string, unknown>;
      return {
        city: String(o.city ?? "").trim(),
        district: String(o.district ?? "").trim(),
        label: o.label ? String(o.label) : undefined,
        isPrimary: Boolean(o.isPrimary),
      };
    })
    .filter((r) => r.city || r.district)
    .slice(0, 5);
}

export async function GET() {
  const session = await safeAuth();
  if (!session?.user?.email) {
    return NextResponse.json({ regions: [] });
  }
  const sb = getServiceSupabase();
  if (!sb) return NextResponse.json({ regions: [], stored: false });

  const { data, error } = await sb
    .from("app_users")
    .select("watch_regions")
    .eq("email", session.user.email.trim().toLowerCase())
    .maybeSingle();

  /* 못 읽은 것을 `{regions: [], stored: true}` 로 답하면 "관심 지역을 등록한 적이
     없다"는 단정이 된다. 게다가 fetchUserRegions 가 그 빈 배열을 그대로
     localStorage 에 덮어써(writeUserRegionsLocal) 기기에 남아 있던 목록까지 지운다.
     못 읽었으면 503 으로 말한다 — 클라이언트는 로컬 캐시를 유지한다. */
  if (error) {
    return dbUnavailable("me-regions", error);
  }

  return NextResponse.json({
    regions: normalizeRegions(data?.watch_regions),
    stored: true,
  });
}

export async function PUT(req: Request) {
  const session = await safeAuth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as { regions?: unknown };
  const regions = normalizeRegions(body.regions);
  const sb = getServiceSupabase();
  if (!sb) {
    return NextResponse.json({ regions, stored: false });
  }

  const { error } = await sb
    .from("app_users")
    .update({ watch_regions: regions })
    .eq("email", session.user.email.trim().toLowerCase());

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ regions, stored: true });
}
