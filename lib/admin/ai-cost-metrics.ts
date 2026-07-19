import { getServiceSupabase } from "@/lib/supabase/service";

/** job 유형별 추정 단가(USD) — 운영 모니터링용 근사치 */
const UNIT_COST_USD: Record<string, number> = {
  stt: 0.002,
  vision: 0.012,
  report: 0.035,
  scenario: 0.02,
};

export type AiCostSummary = {
  jobs7d: number;
  jobs30d: number;
  failed7d: number;
  byType7d: Record<string, number>;
  byModel7d: Record<string, number>;
  estimatedCostUsd7d: number;
  estimatedCostUsd30d: number;
  recentJobs: Array<{
    id: string;
    jobType: string;
    status: string;
    modelVersion: string | null;
    createdAt: string;
    sessionId: string | null;
  }>;
};

function estimateCost(jobs: Array<{ job_type: string }>): number {
  return jobs.reduce((sum, j) => sum + (UNIT_COST_USD[j.job_type] ?? 0.01), 0);
}

export async function loadAiCostSummary(): Promise<AiCostSummary> {
  const empty: AiCostSummary = {
    jobs7d: 0,
    jobs30d: 0,
    failed7d: 0,
    byType7d: {},
    byModel7d: {},
    estimatedCostUsd7d: 0,
    estimatedCostUsd30d: 0,
    recentJobs: [],
  };

  const sb = getServiceSupabase();
  if (!sb) return empty;

  const now = Date.now();
  const d7 = new Date(now - 7 * 86400000).toISOString();
  const d30 = new Date(now - 30 * 86400000).toISOString();

  const [jobs7, jobs30, recent] = await Promise.all([
    sb.from("inspection_ai_jobs").select("job_type,status,model_version").gte("created_at", d7),
    sb.from("inspection_ai_jobs").select("job_type,status").gte("created_at", d30),
    sb
      .from("inspection_ai_jobs")
      .select("id,job_type,status,model_version,created_at,session_id")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const rows7 = jobs7.data ?? [];
  const rows30 = jobs30.data ?? [];

  const byType7d: Record<string, number> = {};
  const byModel7d: Record<string, number> = {};
  let failed7d = 0;

  for (const r of rows7) {
    const t = String(r.job_type);
    byType7d[t] = (byType7d[t] ?? 0) + 1;
    const m = String(r.model_version ?? "unknown");
    byModel7d[m] = (byModel7d[m] ?? 0) + 1;
    if (r.status === "failed") failed7d++;
  }

  return {
    jobs7d: rows7.length,
    jobs30d: rows30.length,
    failed7d,
    byType7d,
    byModel7d,
    estimatedCostUsd7d: Math.round(estimateCost(rows7) * 100) / 100,
    estimatedCostUsd30d: Math.round(estimateCost(rows30) * 100) / 100,
    recentJobs: (recent.data ?? []).map((r) => ({
      id: String(r.id),
      jobType: String(r.job_type),
      status: String(r.status),
      modelVersion: (r.model_version as string | null) ?? null,
      createdAt: String(r.created_at),
      sessionId: (r.session_id as string | null) ?? null,
    })),
  };
}
