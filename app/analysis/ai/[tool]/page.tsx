import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "@/app/components/PageShell";
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
    <PageShell breadcrumb={identity.title}>
      <div className="mx-auto flex w-full max-w-[880px] flex-col gap-4">
        <div className="rise-in flex flex-wrap items-end justify-between gap-3 px-1">
          <div>
            <nav className="t-sub font-semibold text-text-3">
              <Link href="/analysis" className="no-underline hover:underline">
                분석 도구
              </Link>{" "}
              › {identity.title}
            </nav>
            <h1 className="mt-1 t-title text-ink">{identity.title}</h1>
            <p className="mt-1 t-body text-text-2">{identity.tagline}</p>
          </div>
          <span className="rounded-[10px] bg-bg px-3 py-1.5 t-sub font-bold text-text-2">
            실데이터 계산 · 출처 각주
          </span>
        </div>

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
