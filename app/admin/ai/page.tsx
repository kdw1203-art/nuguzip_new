import Link from "next/link";
import { getServiceSupabase } from "@/lib/supabase/service";
import { TOOL_IDENTITIES } from "@/lib/ai/tool-identity";
import { AI_TOOL_IDS, isAiAnalysisToolId, type AiAnalysisToolId } from "@/lib/ai/ai-tools";
import { AI_PROMPT_VERSION } from "@/lib/ai/system-prompt";
import { AI_DRAFT_LIMITS, AI_REPORT_LIMITS } from "@/lib/inspection/quota";

/* [AI-45~47] AI 도구 상태 대시보드 — "LLM이 죽어 규칙 폴백만 나가는" 상태가
   몇 달씩 조용히 지속되는 일을 막는다. 도구별 실행·소스 분해·피드백을 실집계로.
   0과 조회 실패를 구분한다(관리자 공통 규율). */

export const dynamic = "force-dynamic";

const darkCard =
  "rounded-[14px] border border-[rgba(255,255,255,.08)] bg-[rgba(255,255,255,.05)]";

interface ToolStat {
  tool: string;
  total30d: number;
  internal: number;
  llm: number;
  stub: number;
  lastAt: string | null;
}

/* [945 · 실사용50 #42] 무료 한도 소진율 — 월간 한도(정리 10·초안 10)는 가설이다.
   도달하는 사람이 0이면 벽이 없는 것이고, 대부분 즉시 도달하면 벽이 너무 낮다.
   4주 데이터로 무료/플러스 경계를 조정하는 근거 지표. */
type QuotaHeat = {
  users: number; // 이달 사용자 수 (해당 기능 1회 이상)
  atLimit: number; // 무료 한도 도달자 수
  max: number; // 최고 사용량
};

async function loadStats(): Promise<{
  ok: boolean;
  tools: ToolStat[];
  feedback: { up: number; down: number };
  llmMonth: number;
  runsAllTime: number;
  quotaHeat: { report: QuotaHeat; draft: QuotaHeat } | null;
}> {
  const sb = getServiceSupabase();
  const empty = {
    ok: false,
    tools: [],
    feedback: { up: 0, down: 0 },
    llmMonth: 0,
    runsAllTime: 0,
    quotaHeat: null,
  };
  if (!sb) return empty;

  const since = new Date(Date.now() - 30 * 86400_000).toISOString();
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const yyyymm = (() => {
    const d = new Date();
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
  })();

  try {
    const [runsRes, fbRes, llmRes, allRes, usageRes] = await Promise.all([
      sb
        .from("ai_analysis_runs")
        .select("tool,source,created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(5000),
      sb
        .from("platform_activity_events")
        .select("metadata")
        .eq("event_name", "ai_feedback")
        .gte("created_at", since)
        .limit(2000),
      sb
        .from("ai_analysis_runs")
        .select("*", { count: "exact", head: true })
        .in("source", ["openai", "anthropic"])
        .gte("created_at", monthStart.toISOString()),
      sb.from("ai_analysis_runs").select("*", { count: "exact", head: true }),
      sb
        .from("inspection_ai_usage")
        .select("report_count, draft_count")
        .eq("yyyymm", yyyymm)
        .limit(2000),
    ]);
    if (runsRes.error) return empty;

    const byTool = new Map<string, ToolStat>();
    for (const r of (runsRes.data ?? []) as Array<{ tool: string; source: string | null; created_at: string }>) {
      const t = byTool.get(r.tool) ?? {
        tool: r.tool,
        total30d: 0,
        internal: 0,
        llm: 0,
        stub: 0,
        lastAt: null,
      };
      t.total30d += 1;
      if (r.source === "internal") t.internal += 1;
      else if (r.source === "openai" || r.source === "anthropic") t.llm += 1;
      else t.stub += 1;
      if (!t.lastAt) t.lastAt = r.created_at;
      byTool.set(r.tool, t);
    }

    let up = 0;
    let down = 0;
    for (const row of (fbRes.data ?? []) as Array<{ metadata: { rating?: string } | null }>) {
      if (row.metadata?.rating === "up") up += 1;
      else if (row.metadata?.rating === "down") down += 1;
    }

    /* 한도 소진율 — 무료(basic) 한도 기준. 유료 사용자가 생기면 도달자 수가
       과대집계될 수 있으나(한도가 더 높으므로), 그때는 이 카드가 아니라 plan 별
       분해가 필요해진다 — 현재 유료 0명 단계의 근사로 충분하다. */
    let quotaHeat: { report: QuotaHeat; draft: QuotaHeat } | null = null;
    if (!usageRes.error) {
      const rows = (usageRes.data ?? []) as Array<{
        report_count: number | null;
        draft_count: number | null;
      }>;
      const heat = (pick: (r: (typeof rows)[number]) => number, freeLimit: number): QuotaHeat => {
        const counts = rows.map(pick).filter((n) => n > 0);
        return {
          users: counts.length,
          atLimit: counts.filter((n) => n >= freeLimit).length,
          max: counts.length > 0 ? Math.max(...counts) : 0,
        };
      };
      quotaHeat = {
        report: heat((r) => Number(r.report_count ?? 0), AI_REPORT_LIMITS.free ?? 10),
        draft: heat((r) => Number(r.draft_count ?? 0), AI_DRAFT_LIMITS.free ?? 10),
      };
    }

    return {
      ok: true,
      tools: AI_TOOL_IDS.map(
        (id) =>
          byTool.get(id) ?? { tool: id, total30d: 0, internal: 0, llm: 0, stub: 0, lastAt: null },
      ),
      feedback: { up, down },
      llmMonth: llmRes.count ?? 0,
      runsAllTime: allRes.count ?? 0,
      quotaHeat,
    };
  } catch {
    return empty;
  }
}

export default async function AdminAiPage() {
  const stats = await loadStats();
  const llmCap = Number(process.env.AI_LLM_MONTHLY_CAP ?? "500");
  const total30 = stats.tools.reduce((s, t) => s + t.total30d, 0);
  const llm30 = stats.tools.reduce((s, t) => s + t.llm, 0);
  const stub30 = stats.tools.reduce((s, t) => s + t.stub, 0);

  return (
    <>
      <div className="rise-in flex flex-wrap items-center justify-between gap-3">
        <div className="text-[19px] font-extrabold text-white">
          AI 도구{" "}
          <span className="text-xs font-medium text-[#9aa6b8]">
            실행·소스·피드백 실집계 · 프롬프트 {AI_PROMPT_VERSION}
          </span>
        </div>
        <Link
          href="/analysis"
          className="rounded-[10px] bg-[rgba(255,255,255,.07)] px-3.5 py-[7px] text-xs font-semibold text-[#c9d2e0] no-underline"
        >
          워크벤치 열기 →
        </Link>
      </div>

      {!stats.ok ? (
        <div className={`rise-in-1 mt-4 ${darkCard} p-5 text-[13px] text-[#c9d2e0]`}>
          집계를 불러오지 못했습니다 — 0이 아니라 조회 실패입니다. 잠시 후 새로고침해 주세요.
        </div>
      ) : (
        <>
          <div className="rise-in-1 mt-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
            {[
              { label: "30일 실행", value: total30.toLocaleString("ko-KR") },
              { label: "누적 실행", value: stats.runsAllTime.toLocaleString("ko-KR") },
              {
                label: "LLM 서술 30일",
                value: llm30.toLocaleString("ko-KR"),
                sub: stub30 > 0 ? `폴백 ${stub30}건` : "폴백 0건",
              },
              {
                label: "이달 LLM 예산",
                value: `${stats.llmMonth}/${llmCap}`,
                sub: "초과 시 규칙 모드 자동 전환",
              },
              {
                label: "피드백(30일)",
                value: `👍${stats.feedback.up} 👎${stats.feedback.down}`,
                sub: "도구 심화 우선순위 근거",
              },
            ].map((k) => (
              <div key={k.label} className={`${darkCard} p-4`}>
                <div className="text-[11px] text-[#9aa6b8]">{k.label}</div>
                <div className="mt-1 text-[18px] font-extrabold tabular-nums text-white">
                  {k.value}
                </div>
                {"sub" in k && k.sub && (
                  <div className="mt-0.5 text-[11px] text-[#9aa6b8]">{k.sub}</div>
                )}
              </div>
            ))}
          </div>

          {/* [945 #42] 무료 한도 소진율 — 가격 경계 조정의 근거 */}
          <div className="rise-in-2 mt-4 flex flex-col gap-2">
            <div className="text-[15px] font-extrabold text-white">
              무료 한도 소진율 (이달){" "}
              <span className="text-[11px] font-medium text-[#9aa6b8]">
                도달 0명 = 벽이 없음 · 대부분 도달 = 벽이 낮음
              </span>
            </div>
            {stats.quotaHeat ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {[
                  {
                    label: `AI 노트 정리 (무료 월 ${AI_REPORT_LIMITS.free ?? "?"}회)`,
                    h: stats.quotaHeat.report,
                    limit: AI_REPORT_LIMITS.free ?? 0,
                  },
                  {
                    label: `AI 초안·브리핑 (무료 월 ${AI_DRAFT_LIMITS.free ?? "?"}회)`,
                    h: stats.quotaHeat.draft,
                    limit: AI_DRAFT_LIMITS.free ?? 0,
                  },
                ].map((c) => (
                  <div key={c.label} className={`${darkCard} p-4`}>
                    <div className="text-[11px] text-[#9aa6b8]">{c.label}</div>
                    <div className="mt-1 text-[19px] font-extrabold tabular-nums text-white">
                      도달 {c.h.atLimit}
                      <span className="text-[13px] font-bold text-[#9aa6b8]">
                        {" "}
                        / 사용자 {c.h.users}명
                      </span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-[#9aa6b8]">
                      최고 사용 {c.h.max}회 · 유료 전환 제안은 도달자에게만 의미가 있다
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className={`${darkCard} p-4 text-[13px] text-[#9aa6b8]`}>
                사용량 표를 읽지 못했습니다 — 0명이 아니라 조회 실패입니다.
              </div>
            )}
          </div>

          <div className="rise-in-2 mt-4 flex flex-col gap-2">
            <div className="text-[15px] font-extrabold text-white">도구별 30일</div>
            <div className={`${darkCard} overflow-hidden`}>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[13px]">
                  <thead>
                    <tr className="border-b border-[rgba(255,255,255,.08)] text-[11px] text-[#9aa6b8]">
                      <th className="px-4 py-2.5 font-semibold">도구</th>
                      <th className="px-4 py-2.5 text-right font-semibold">실행</th>
                      <th className="px-4 py-2.5 text-right font-semibold">규칙</th>
                      <th className="px-4 py-2.5 text-right font-semibold">LLM</th>
                      <th className="px-4 py-2.5 text-right font-semibold">폴백</th>
                      <th className="px-4 py-2.5 text-right font-semibold">최근 실행</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.tools.map((t) => {
                      const title = isAiAnalysisToolId(t.tool)
                        ? TOOL_IDENTITIES[t.tool as AiAnalysisToolId].title
                        : t.tool;
                      return (
                        <tr
                          key={t.tool}
                          className="border-b border-[rgba(255,255,255,.05)] last:border-0"
                        >
                          <td className="px-4 py-2.5 font-bold text-white">{title}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-[#c9d2e0]">
                            {t.total30d}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-[#9aa6b8]">
                            {t.internal}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-ai-accent">
                            {t.llm}
                          </td>
                          <td
                            className={`px-4 py-2.5 text-right tabular-nums ${t.stub > 0 ? "text-[#f2c94c]" : "text-[#9aa6b8]"}`}
                          >
                            {t.stub}
                          </td>
                          <td className="px-4 py-2.5 text-right text-[11px] text-[#9aa6b8]">
                            {t.lastAt ? new Date(t.lastAt).toLocaleString("ko-KR") : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            <p className="text-[11px] leading-relaxed text-[#9aa6b8]">
              폴백(stub)이 지속되면 LLM 키 미설정 또는 예산 초과입니다 — 서버 env
              OPENAI_API_KEY/ANTHROPIC_API_KEY(오너 ⑨)와 AI_LLM_MONTHLY_CAP을 확인하세요.
              피드백 사유 원문은 활동 이벤트(ai_feedback)의 metadata.note 로 적재됩니다.
            </p>
          </div>
        </>
      )}
    </>
  );
}
