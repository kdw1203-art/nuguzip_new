import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "@/app/components/PageShell";
import { ToolGlyph, WORKBENCH_GLYPH } from "../../ToolGlyph";
import { AI_TOOL_IDS, isAiAnalysisToolId, type AiAnalysisToolId } from "@/lib/ai/ai-tools";
import { TOOL_IDENTITIES } from "@/lib/ai/tool-identity";
import { WorkbenchClient } from "./WorkbenchClient";

/* [AI-31·32] 통합 AI 워크벤치 — 12종 도구의 단일 실행 표면.
   3스텝 표준: ① 단지/지역 선택 → ② 실데이터 자동 로드(+보정) → ③ 실행·결과.
   결과에는 근거 각주(AI-01)·신선도(AI-17)·불확실성(AI-03)·반대 시나리오(AI-04)·
   다음 행동 3버튼(AI-38)·피드백(AI-46)·쿼터(AI-42)가 항상 붙는다. */

export const revalidate = 3600;

export function generateStaticParams() {
  return AI_TOOL_IDS.map((tool) => ({ tool }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ tool: string }>;
}): Promise<Metadata> {
  const { tool } = await params;
  if (!isAiAnalysisToolId(tool)) return { title: "AI 분석 도구" };
  const id = TOOL_IDENTITIES[tool as AiAnalysisToolId];
  return {
    title: `${id.title} — AI 분석 도구`,
    description: `${id.tagline}. 국토교통부 실거래·전월세 신고·입주 예정·이웃 임장노트 실데이터로 계산하고, 모든 수치에 출처를 표기합니다.`,
    alternates: { canonical: `/analysis/ai/${tool}` },
  };
}

export default async function AiToolPage({
  params,
}: {
  params: Promise<{ tool: string }>;
}) {
  const { tool } = await params;
  if (!isAiAnalysisToolId(tool)) notFound();
  const tid = tool as AiAnalysisToolId;
  const identity = TOOL_IDENTITIES[tid];

  return (
    <PageShell breadcrumb={`AI 분석 › ${identity.title}`}>
      <div className="mx-auto flex w-full max-w-[880px] flex-col gap-4">
        {/* [958] 도구 머리 — 네이비 면 + 결과물 글리프 + "넣는 것 → 계산 → 나오는 것".
            예전엔 제목·한 줄 설명뿐이라 12개 도구가 무엇이 다른지, 결과가 AI 인지
            규칙인지 실행 전에는 알 수 없었다. 실행 전에 말한다. */}
        <section className="hub-hero rise-in flex flex-col gap-4 p-5 md:p-6">
          <div className="flex items-start gap-4">
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-brand-hanji text-brand-hanji-ink">
              <ToolGlyph id={WORKBENCH_GLYPH[tid] ?? "radar"} size={44} />
            </span>
            <div className="min-w-0 flex-1">
              <nav className="t-caption font-extrabold tracking-wider text-on-dark-muted">
                <Link href="/analysis" className="no-underline hover:underline">
                  AI 분석
                </Link>{" "}
                › 단지 하나를 깊게
              </nav>
              <h1 className="mt-1 t-title text-on-dark">{identity.title}</h1>
              <p className="mt-1 t-body text-on-dark-muted">{identity.tagline}</p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2 border-t border-on-dark-faint pt-4 sm:grid-cols-3">
            <div className="rounded-xl bg-on-dark-faint px-3 py-2.5">
              <div className="t-caption font-extrabold text-on-dark-muted">넣는 것</div>
              <div className="t-sub text-on-dark">단지 1곳{identity.useCase ? ` · ${identity.useCase}` : ""}</div>
            </div>
            <div className="rounded-xl bg-on-dark-faint px-3 py-2.5">
              <div className="t-caption font-extrabold text-on-dark-muted">계산</div>
              <div className="t-sub text-on-dark">실거래·전월세·공급·뉴스 실데이터 규칙 계산 · AI 서술은 선택</div>
            </div>
            <div className="rounded-xl bg-on-dark-faint px-3 py-2.5">
              <div className="t-caption font-extrabold text-on-dark-muted">나오는 것</div>
              <div className="t-sub text-on-dark">
                {identity.metricLabel && identity.metricLabel !== "결과"
                  ? `${identity.metricLabel}${identity.metricUnit ? `(${identity.metricUnit})` : ""} + 근거 각주`
                  : "요약 · 근거 각주"}
              </div>
            </div>
          </div>
        </section>

        <WorkbenchClient tool={tid} useCase={identity.useCase} tips={identity.tips} />

        {/* 면책 — check-ai-compliance.mjs 가 이 마커의 존재를 검사한다 */}
        <p
          data-ai-compliance="notice"
          className="rounded-[10px] bg-bg px-4 py-3 t-sub text-text-3"
        >
          이 도구의 수치는 공공 데이터 기반의 규칙 계산이며(서술형 해석이 붙는 경우
          문장 단위로 [AI 서술] 라벨 표기), 투자 권유·수익 보장·법률·세무 자문이
          아닙니다. 표본이 적거나 오래된 축은 그 사실을 함께 표기합니다. 최종 판단과
          책임은 이용자 본인에게 있습니다.
        </p>
      </div>
    </PageShell>
  );
}
