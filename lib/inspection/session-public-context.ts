import { fetchPublicData } from "@/lib/public-data";
import { getInspectionPublicContext, parseDistrict } from "@/lib/inspection/public-data-context";
import { lensFromSession, lensToInspectionIntent } from "@/lib/inspection/field-labels";
import type { InspectionSession } from "@/lib/inspection/session-store";

type RedevPayload = {
  district?: string;
  activeProjects?: number;
  plannedProjects?: number;
  estimatedUnits?: number;
  nearestCompletionYear?: number;
  projects?: Array<{ name?: string; stage?: string; type?: string }>;
  mode?: string;
};

export async function fetchSessionPublicSummary(session: InspectionSession): Promise<{
  summary: string;
  checklistHints: string[];
  redevelopmentBlock?: Record<string, unknown>;
}> {
  const lens = lensFromSession(session);
  const district = parseDistrict(session.region);
  if (!district) {
    return { summary: "", checklistHints: [] };
  }

  const intent = lensToInspectionIntent(lens);
  const ctx = await getInspectionPublicContext({
    district,
    aptName: session.aptName ?? undefined,
    intent,
  });

  const parts: string[] = [];
  const checklistHints = [...(ctx?.checklistHints ?? [])];

  if (ctx?.marketHint) parts.push(`[시세] ${ctx.marketHint}`);
  if (ctx?.weatherHint) parts.push(`[날씨] ${ctx.weatherHint}`);
  if (ctx?.airQualityHint) parts.push(`[대기] ${ctx.airQualityHint}`);
  for (const p of ctx?.plans.slice(0, 4) ?? []) {
    if (p.summary) parts.push(`[${p.title}] ${p.summary.slice(0, 120)}`);
  }

  let redevelopmentBlock: Record<string, unknown> | undefined;

  if (lens === "redevelopment") {
    try {
      const cityMatch = session.region.match(/([가-힣]+(?:특별시|광역시|도))/);
      const city = cityMatch?.[1] ?? "서울특별시";
      const env = await fetchPublicData<RedevPayload>("redevelopment", {
        city,
        district,
      });
      const d = env.data;
      if (d) {
        parts.push(
          `[정비사업] ${district} 진행 ${d.activeProjects ?? 0}건 · 계획 ${d.plannedProjects ?? 0}건 · 추정 세대 ${d.estimatedUnits ?? "?"} · 최근 준공 ${d.nearestCompletionYear ?? "?"}`,
        );
        checklistHints.push(
          "정비사업 — 조합설립·정비계획 고시·관리처분 단계 문서 확인",
          "현장 게시물·추진위·조합 공고 확인",
        );
        const projects = (d.projects ?? []).slice(0, 5);
        redevelopmentBlock = {
          district,
          activeProjects: d.activeProjects,
          plannedProjects: d.plannedProjects,
          estimatedUnits: d.estimatedUnits,
          nearestCompletionYear: d.nearestCompletionYear,
          projects: projects.map((p) => ({
            name: p.name,
            stage: p.stage,
            type: p.type,
          })),
          mode: d.mode ?? "live",
          fetchedAt: env.fetchedAt,
        };
        for (const p of projects) {
          if (p.name) parts.push(`- ${p.name}${p.stage ? ` (${p.stage})` : ""}`);
        }
      }
    } catch {
      parts.push("[정비사업] 외부 데이터 미확인 — 사업 단계는 공식 문서로 검증 필요");
      checklistHints.push("정비사업 단계·고시 문서 미확인");
    }
  }

  return {
    summary: parts.join("\n"),
    checklistHints,
    redevelopmentBlock,
  };
}
