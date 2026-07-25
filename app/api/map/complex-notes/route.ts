/**
 * GET /api/map/complex-notes?name=단지명
 *
 * 지도 단지 패널 "노트" 탭 — 그 단지의 실제 공개 임장노트 목록.
 * inspection_notes 에서 apt_name 을 정규화(공백·후행 "아파트" 제거) 매칭한다.
 * 세션이 있으면 내 노트(비공개 포함)도 함께 세어 mineCount 로 내려준다 —
 * 지도 목록의 "임장한 단지" 표시와 같은 기준.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/auth";
import { applyRateLimit, READ_RATE_LIMIT } from "@/lib/rate-limit";
import { getServiceSupabase } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface ComplexNoteItem {
  id: string;
  title: string;
  visitDate: string | null;
  region: string | null;
  mine: boolean;
}

/** 단지명 정규화 — 공백 제거 + 후행 "아파트" 제거 (complex-store 와 동일 기준) */
function normalizeName(s: string): string {
  return s.replace(/\s+/g, "").replace(/아파트$/, "");
}

export async function GET(req: NextRequest) {
  const limited = await applyRateLimit(req, READ_RATE_LIMIT);
  if (limited) return limited;

  const url = new URL(req.url);
  const name = url.searchParams.get("name")?.trim() ?? "";
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  const core = normalizeName(name).replace(/[%_]/g, "");
  if (core.length < 2) {
    return NextResponse.json({ notes: [], mineCount: 0 });
  }

  const sb = getServiceSupabase();
  if (!sb) return NextResponse.json({ notes: [], mineCount: 0 });

  const session = await auth().catch(() => null);
  const myEmail = session?.user?.email?.toLowerCase() ?? null;

  try {
    // 공개 노트 + (세션 있으면) 내 노트 — apt_name ilike 로 DB단 필터 후 정규화 재검증
    let q = sb
      .from("inspection_notes")
      .select("id, title, apt_name, region, visit_date, is_public, author_email")
      .ilike("apt_name", `%${core}%`)
      .order("created_at", { ascending: false })
      .limit(30);
    if (myEmail) {
      q = q.or(`is_public.eq.true,author_email.eq.${myEmail.replace(/[,()]/g, "")}`);
    } else {
      q = q.eq("is_public", true);
    }
    const { data, error } = await q;
    if (error) throw error;

    const target = core;
    const rows = ((data ?? []) as Array<Record<string, unknown>>).filter((r) => {
      const apt = normalizeName(String(r.apt_name ?? ""));
      return apt.length > 0 && (apt.includes(target) || target.includes(apt));
    });

    const notes: ComplexNoteItem[] = rows.slice(0, 10).map((r) => ({
      id: String(r.id),
      title: String(r.title ?? "임장노트"),
      visitDate: r.visit_date ? String(r.visit_date).slice(0, 10) : null,
      region: r.region ? String(r.region) : null,
      mine: myEmail != null && String(r.author_email ?? "").toLowerCase() === myEmail,
    }));
    const mineCount = rows.filter(
      (r) => myEmail != null && String(r.author_email ?? "").toLowerCase() === myEmail,
    ).length;

    return NextResponse.json({ notes, mineCount });
  } catch {
    return NextResponse.json({ error: "notes lookup failed" }, { status: 500 });
  }
}
