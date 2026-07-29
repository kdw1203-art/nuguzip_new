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
  unavailableReason?: string;
};

/** 왜 못 가져왔는지를 사용자가 읽을 문장으로. 모르면 뭉뚱그리지 않고 그렇게 적는다. */
function redevUnavailableLine(reason: string | undefined): string {
  if (reason === "fetch-failed") {
    return "[정비사업] 조회 실패 — 지금은 확인하지 못했습니다(사업장이 없다는 뜻이 아닙니다). 관할 구청 고시로 확인하세요";
  }
  if (reason === "not-configured" || reason === "adapter-pending") {
    return "[정비사업] 외부 데이터 미연동 — 사업 단계는 관할 구청 고시로 확인하세요";
  }
  return "[정비사업] 외부 데이터 미확인 — 사업 단계는 공식 문서로 검증 필요";
}

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

      /* fetchPublicData 는 키가 없어도, 조회에 실패해도 예외를 던지지 않는다.
         전 필드가 null 인 봉투를 mode:"mock" 으로 돌려줄 뿐이다. 그래서 아래
         catch 는 사실상 도달하지 않는 죽은 길이었고, 실제로 실행되던 코드는
         `?? 0` 이 붙은 이 줄이었다 — **모른다를 "진행 0건"이라는 확정 사실로
         바꿔서** 임장 리포트의 근거 항목에 실어 보내고 있었다.
         이제 라이브가 아니면 숫자를 쓰지 않는다. */
      if (!d || d.mode !== "live") {
        parts.push(redevUnavailableLine(d?.unavailableReason));
        checklistHints.push("정비사업 단계·고시 문서 미확인");
      } else {
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
          /* 예전엔 `d.mode ?? "live"` 였다 — mode 가 빠진 봉투를 라이브로 단정했다. */
          mode: d.mode,
          fetchedAt: env.fetchedAt,
        };
        for (const p of projects) {
          if (p.name) parts.push(`- ${p.name}${p.stage ? ` (${p.stage})` : ""}`);
        }
      }
    } catch {
      parts.push(redevUnavailableLine("fetch-failed"));
      checklistHints.push("정비사업 단계·고시 문서 미확인");
    }
  }

  return {
    summary: parts.join("\n"),
    checklistHints,
    redevelopmentBlock,
  };
}
