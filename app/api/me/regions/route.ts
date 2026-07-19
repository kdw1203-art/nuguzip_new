import { NextResponse } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { getServiceSupabase } from "@/lib/supabase/service";
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

  const { data } = await sb
    .from("app_users")
    .select("watch_regions")
    .eq("email", session.user.email.trim().toLowerCase())
    .maybeSingle();

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
