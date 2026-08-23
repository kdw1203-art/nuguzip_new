import Link from "next/link";
import { redirect } from "next/navigation";
import { PageShell } from "@/app/components/PageShell";
import { safeAuth } from "@/lib/safe-auth";
import { listRuns } from "@/lib/ai/presets-store";
import { TOOL_IDENTITIES } from "@/lib/ai/tool-identity";
import { isAiAnalysisToolId, type AiAnalysisToolId } from "@/lib/ai/ai-tools";

/* [AI-34] 내 분석 기록 — 저장만 되고 보이지 않던 히스토리의 표면화.
   재실행은 같은 도구 페이지로 보낸다(입력은 새 데이터로 다시 로드 — AI-02 원칙:
   과거 스냅샷 열람은 공유 페이지가, 재실행은 현재 데이터가 담당). */

export const dynamic = "force-dynamic";
export const metadata = { title: "내 AI 분석 기록", robots: { index: false } };

export default async function MyAnalysesPage() {
  const session = await safeAuth();
  const email = session?.user?.email;
  if (!email) redirect("/login?callbackUrl=/my/analyses");

  let runs: Awaited<ReturnType<typeof listRuns>> = [];
  let failed = false;
  try {
    runs = await listRuns(email, 40);
  } catch {
    failed = true;
  }

  return (
    <PageShell breadcrumb="내 AI 분석 기록">
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-3">
        <div className="rise-in flex items-baseline justify-between">
          <h1 className="text-[21px] font-extrabold text-ink">내 AI 분석 기록</h1>
          <Link href="/analysis" className="text-[12.5px] font-bold text-primary no-underline">
            분석 도구 허브 ›
          </Link>
        </div>

        {failed ? (
          <div className="card rounded-[16px] px-5 py-8 text-center text-[13px] font-bold text-text-3">
            기록을 불러오지 못했어요 — 없는 게 아니라 조회가 실패했습니다. 잠시 후 다시 시도해 주세요.
          </div>
        ) : runs.length === 0 ? (
          <div className="card rounded-[16px] px-5 py-8 text-center">
            <p className="text-[13.5px] font-bold text-text-2">아직 실행한 분석이 없어요.</p>
            <Link href="/analysis" className="btn-primary mt-3 inline-block rounded-[12px] px-4 py-2 text-[13px] font-extrabold no-underline">
              첫 분석 실행하기 ›
            </Link>
          </div>
        ) : (
          <div className="rise-in-1 flex flex-col gap-2">
            {runs.map((r) => {
              const tid = isAiAnalysisToolId(r.tool) ? (r.tool as AiAnalysisToolId) : null;
              const title = tid ? TOOL_IDENTITIES[tid].title : r.tool;
              return (
                <div key={r.id} className="card flex flex-col gap-1 rounded-[14px] px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[13px] font-extrabold text-ink">{title}</span>
                    <span className="text-[11px] text-text-3">
                      {new Date(r.createdAt).toLocaleString("ko-KR")}
                      {r.source ? ` · ${r.source === "internal" || r.source === "stub" ? "규칙" : "AI 서술"}` : ""}
                    </span>
                  </div>
                  {r.structuredSummary?.headline && (
                    <p className="text-[12.5px] leading-[1.6] text-text-2">
                      {r.structuredSummary.headline}
                    </p>
                  )}
                  <div className="flex gap-2 pt-1">
                    <Link href={`/analysis/ai/r/${r.id}`} className="text-[12px] font-bold text-primary no-underline">
                      결과 스냅샷 보기 ›
                    </Link>
                    {tid && (
                      <Link href={`/analysis/ai/${tid}`} className="text-[12px] font-bold text-text-3 no-underline">
                        같은 도구 다시 실행 ›
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </PageShell>
  );
}
