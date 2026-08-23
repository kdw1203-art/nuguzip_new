import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getServiceSupabase } from "@/lib/supabase/service";

/* [#130] 지도 "내 노트" 레이어 — 로그인 사용자의 노트 중 좌표(metadata.lat/lng)가
   있는 것만 마커로. 본인 데이터만 반환(세션 이메일 필터) — 공개 여부 무관하게
   본인에게는 전부 보인다(내 임장 지도). */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const sb = getServiceSupabase();
  if (!sb) return NextResponse.json({ error: "저장소 미구성" }, { status: 503 });

  const { data, error } = await sb
    .from("inspection_notes")
    .select("id, title, apt_name, visit_date, metadata, score_location, score_school, score_transport, score_facility, score_future")
    .eq("author_email", session.user.email)
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) {
    return NextResponse.json({ error: "노트 조회 실패" }, { status: 503 });
  }

  const items = (data ?? [])
    .map((r) => {
      const meta = (r.metadata ?? {}) as { lat?: unknown; lng?: unknown };
      const lat = Number(meta.lat);
      const lng = Number(meta.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      const scores = [
        r.score_location,
        r.score_school,
        r.score_transport,
        r.score_facility,
        r.score_future,
      ]
        .map(Number)
        .filter((v) => Number.isFinite(v) && v > 0);
      const avg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
      return {
        id: String(r.id),
        lat,
        lng,
        title: String(r.apt_name || r.title || "임장노트"),
        visitDate: r.visit_date ? String(r.visit_date) : null,
        avgScore: avg === null ? null : Math.round(avg * 10) / 10,
      };
    })
    .filter(Boolean);

  return NextResponse.json({ items }, { headers: { "Cache-Control": "no-store" } });
}
