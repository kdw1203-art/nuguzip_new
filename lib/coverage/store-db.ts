import "server-only";

import { getServiceSupabase } from "@/lib/supabase/service";
import { sanitizeDemandEmail } from "./email";

export { sanitizeDemandEmail };

/* 커버 밖 수요 수집(#413) — region_demand_requests 읽기/쓰기.
 * 같은 검색어는 (query_norm, created_day) 한 행에 count 로 접는다.
 * 실패는 던진다 — 호출부(API)가 502 로 정직하게 답한다. */


/** 수요 1건 기록 — 오늘 같은 검색어 행이 있으면 count+1, 이메일은 중복 없이 추가. */
export async function recordRegionDemand(input: {
  query: string;
  source: string;
  email: string | null;
}): Promise<void> {
  const sb = getServiceSupabase();
  if (!sb) throw new Error("서비스 클라이언트 없음");
  const query = input.query.trim().slice(0, 80);
  if (!query) throw new Error("빈 검색어");
  const norm = query.toLowerCase();
  const source = input.source.trim().slice(0, 24) || "search";

  const { data: existing, error: selErr } = await sb
    .from("region_demand_requests")
    .select("id, count, emails")
    .eq("query_norm", norm)
    .eq("created_day", new Date().toISOString().slice(0, 10))
    .maybeSingle();
  if (selErr) throw new Error(`수요 조회 실패: ${selErr.message}`);

  if (existing) {
    const emails: string[] = Array.isArray(existing.emails) ? existing.emails : [];
    const nextEmails =
      input.email && !emails.includes(input.email) && emails.length < 20
        ? [...emails, input.email]
        : emails;
    const { error } = await sb
      .from("region_demand_requests")
      .update({
        count: (existing.count ?? 1) + 1,
        emails: nextEmails,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    if (error) throw new Error(`수요 갱신 실패: ${error.message}`);
    return;
  }

  const { error } = await sb.from("region_demand_requests").insert({
    query,
    source,
    emails: input.email ? [input.email] : [],
  });
  if (error) {
    /* 유니크 충돌(동시 첫 기록) = 이미 누가 만들었다 — 멱등 성공으로 본다 */
    if (/duplicate key|unique/i.test(error.message)) return;
    throw new Error(`수요 기록 실패: ${error.message}`);
  }
}

export interface RegionDemandRow {
  query: string;
  totalCount: number;
  emailCount: number;
  lastAt: string;
}

/** 최근 N일 수요 상위 목록 — 관리자·주간 브리핑용 (query_norm 으로 합산). */
export async function listTopRegionDemands(
  days = 30,
  limit = 20,
): Promise<RegionDemandRow[]> {
  const sb = getServiceSupabase();
  if (!sb) throw new Error("서비스 클라이언트 없음");
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data, error } = await sb
    .from("region_demand_requests")
    .select("query, query_norm, count, emails, updated_at")
    .gte("created_at", since)
    .order("updated_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(`수요 목록 조회 실패: ${error.message}`);

  const agg = new Map<string, RegionDemandRow>();
  for (const r of data ?? []) {
    const key = String(r.query_norm ?? "").trim();
    if (!key) continue;
    const prev = agg.get(key);
    const emailCount = Array.isArray(r.emails) ? r.emails.length : 0;
    const at = String(r.updated_at ?? "");
    if (prev) {
      prev.totalCount += Number(r.count ?? 1);
      prev.emailCount += emailCount;
      if (at > prev.lastAt) prev.lastAt = at;
    } else {
      agg.set(key, {
        query: String(r.query ?? key),
        totalCount: Number(r.count ?? 1),
        emailCount,
        lastAt: at,
      });
    }
  }
  return [...agg.values()]
    .sort((a, b) => b.totalCount - a.totalCount || b.lastAt.localeCompare(a.lastAt))
    .slice(0, limit);
}
