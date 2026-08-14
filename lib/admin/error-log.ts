import "server-only";
import { getServiceSupabase } from "@/lib/supabase/service";

/**
 * 운영 에러 로그 조회 — /admin/ops 에서 최근 프로덕션 에러를 본다.
 *
 * lib/monitoring/capture 가 ops.error_log 에 fingerprint 로 묶어 upsert 한 것을
 * 최근 last_seen 순으로 읽는다. 조회 실패는 "에러 없음"으로 위장하지 않는다 —
 * ok:false 로 구분해 화면이 조회 실패와 실제 무에러를 다르게 보여주게 한다.
 */

export type ErrorLogRow = {
  fingerprint: string;
  level: "error" | "message";
  source: string | null;
  message: string;
  path: string | null;
  count: number;
  firstSeen: string;
  lastSeen: string;
};

export async function loadRecentErrors(
  limit = 20,
): Promise<{ ok: boolean; rows: ErrorLogRow[]; total24h: number }> {
  const sb = getServiceSupabase();
  if (!sb) return { ok: false, rows: [], total24h: 0 };
  try {
    // ops 스키마는 PostgREST 미노출 — public RPC 래퍼로만 접근한다.
    const [recent, count24h] = await Promise.all([
      sb.rpc("admin_recent_errors", { p_limit: limit }),
      sb.rpc("admin_error_count_24h"),
    ]);
    if (recent.error) return { ok: false, rows: [], total24h: 0 };
    const rows: ErrorLogRow[] = ((recent.data as Record<string, unknown>[] | null) ?? []).map(
      (r) => ({
        fingerprint: String(r.fingerprint),
        level: (r.level as "error" | "message") ?? "error",
        source: (r.source as string | null) ?? null,
        message: String(r.message ?? ""),
        path: (r.path as string | null) ?? null,
        count: Number(r.count ?? 1),
        firstSeen: String(r.first_seen ?? ""),
        lastSeen: String(r.last_seen ?? ""),
      }),
    );
    const total24h = count24h.error ? 0 : Number(count24h.data ?? 0);
    return { ok: true, rows, total24h };
  } catch {
    return { ok: false, rows: [], total24h: 0 };
  }
}
