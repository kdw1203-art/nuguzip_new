import "server-only";
import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/log";

/**
 * 최근 본 단지(로그인 사용자) — 서버 동기화. user_recent_complexes.
 * RLS deny-all → service-role 경유. 미설정/실패 시 graceful([]/no-op).
 */
export interface RecentComplexRow {
  id: string;
  name: string;
  region: string | null;
  at: number; // epoch ms
}

const MAX = 12;

/** 방문 기록 upsert — (user_email, complex_id) PK 로 viewed_at 갱신. */
export async function recordRecentComplex(
  email: string,
  input: { id: string; name: string; region?: string | null },
): Promise<void> {
  const sb = getServiceSupabase();
  const owner = email.trim().toLowerCase();
  const id = input.id.trim();
  const name = input.name.trim();
  if (!sb || !owner || !id || !name || id.startsWith("mock")) return;
  try {
    await sb.from("user_recent_complexes").upsert(
      {
        user_email: owner,
        complex_id: id,
        name: name.slice(0, 120),
        region: input.region?.trim().slice(0, 80) || null,
        viewed_at: new Date().toISOString(),
      },
      { onConflict: "user_email,complex_id" },
    );
  } catch (e) {
    logger.warn("[recent-complexes] record", e);
  }
}

/** 최근 본 단지 1건 삭제 — 소유자 스코프. */
export async function removeRecentComplex(email: string, complexId: string): Promise<void> {
  const sb = getServiceSupabase();
  const owner = email.trim().toLowerCase();
  const id = complexId.trim();
  if (!sb || !owner || !id) return;
  try {
    await sb
      .from("user_recent_complexes")
      .delete()
      .eq("user_email", owner)
      .eq("complex_id", id);
  } catch (e) {
    logger.warn("[recent-complexes] remove", e);
  }
}

/** 최근 본 단지 목록 — viewed_at 최신순. */
export async function listRecentComplexes(
  email: string,
  limit = MAX,
): Promise<RecentComplexRow[]> {
  const sb = getServiceSupabase();
  const owner = email.trim().toLowerCase();
  if (!sb || !owner) return [];
  try {
    const { data, error } = await sb
      .from("user_recent_complexes")
      .select("complex_id, name, region, viewed_at")
      .eq("user_email", owner)
      .order("viewed_at", { ascending: false })
      .limit(Math.min(Math.max(limit, 1), MAX));
    if (error || !Array.isArray(data)) return [];
    return data.map((r) => {
      const row = r as Record<string, unknown>;
      const t = Date.parse(String(row.viewed_at ?? ""));
      return {
        id: String(row.complex_id ?? ""),
        name: String(row.name ?? ""),
        region: row.region != null ? String(row.region) : null,
        at: Number.isFinite(t) ? t : 0,
      };
    });
  } catch (e) {
    logger.warn("[recent-complexes] list", e);
    return [];
  }
}
