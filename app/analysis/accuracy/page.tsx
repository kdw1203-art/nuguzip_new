import Link from "next/link";
import { PageShell } from "@/app/components/PageShell";
import { buildPageMetadata } from "@/lib/seo/page-metadata";
import { runPredictionBacktest, BACKTEST } from "@/lib/ai/backtest";

/* [AI-20] 예측 적중률 공개 — 점 예측 대신 구간, 그리고 성적표 공개.
   "예측이 얼마나 맞았는지 스스로 공개하는 서비스"가 이 페이지의 존재 이유다.
   좋게 보이도록 지역·기간을 고르지 않는다 — 표본 조건(월 30건+)만 걸고 전부 계산. */

export const revalidate = 3600;

export const metadata = buildPageMetadata({
  title: "시세 예측 적중률 — 우리 성적표 공개",
  description:
    "누구집 시세 예측(3개월 모멘텀 외삽)의 과거 적중률을 공개합니다. 예측 ±5% 안에 실제 평당가가 들어온 비율과 평균 오차 — 실측 그대로.",
  path: "/analysis/accuracy",
});

export default async function AccuracyPage() {
  const bt = await runPredictionBacktest();

  return (
    <PageShell breadcrumb="예측 적중률">
      <div className="mx-auto flex w-full max-w-[880px] flex-col gap-4">
        <div className="rise-in">
          <h1 className="t-title text-ink">시세 예측, 얼마나 맞았나</h1>
          <p className="mt-1.5 max-w-[62ch] t-body text-text-2">
            ‘이 단지 시세 예측’이 쓰는 것과 같은 규칙(직전 3개월 모멘텀 외삽)으로 과거{" "}
            {BACKTEST.lookbackMonths}개월을 되짚어, 예측이 실제 평당가의 ±
            {BACKTEST.hitBandPct}% 안에 들어온 비율을 공개합니다. 월 거래{" "}
            {BACKTEST.minMonthlyTx}건 이상인 지역·월만 계산하며, 잘 나온 구간을
            골라내지 않습니다.
          </p>
        </div>

        {bt.total === 0 ? (
          <div className="card rounded-[16px] px-5 py-8 text-center t-body font-bold text-text-3">
            아직 계산 가능한 표본이 없어요 — 데이터가 쌓이면 이 자리에 성적표가 공개됩니다.
          </div>
        ) : (
          <>
            <div className="rise-in-1 grid grid-cols-3 gap-2">
              <div className="card rounded-[14px] p-4">
                <div className="t-sub font-bold text-text-3">±{BACKTEST.hitBandPct}% 적중률</div>
                <div className="t-title tabular-nums text-ink">
                  {bt.hitRatePct}%
                </div>
                <div className="t-caption text-text-3">{bt.hits}/{bt.total} 지역·월</div>
              </div>
              <div className="card rounded-[14px] p-4">
                <div className="t-sub font-bold text-text-3">평균 절대 오차</div>
                <div className="t-title tabular-nums text-ink">
                  {bt.meanAbsErrorPct}%
                </div>
                <div className="t-caption text-text-3">예측 대비 실제 편차</div>
              </div>
              <div className="card rounded-[14px] p-4">
                <div className="t-sub font-bold text-text-3">검증 구간</div>
                <div className="t-title tabular-nums text-ink">
                  {bt.monthsCovered.length}개월
                </div>
                <div className="t-caption text-text-3">
                  {bt.monthsCovered[0]?.slice(0, 4)}.{bt.monthsCovered[0]?.slice(4)} ~
                </div>
              </div>
            </div>

            <div className="rise-in-2 card overflow-hidden rounded-[16px]">
              <div className="overflow-x-auto">
                <table className="w-full text-left t-body">
                  <thead>
                    <tr className="border-b border-line t-sub text-text-3">
                      <th className="px-4 py-2.5 font-semibold">지역</th>
                      <th className="px-4 py-2.5 font-semibold">대상 월</th>
                      <th className="px-4 py-2.5 text-right font-semibold">예측(평당)</th>
                      <th className="px-4 py-2.5 text-right font-semibold">실제(평당)</th>
                      <th className="px-4 py-2.5 text-right font-semibold">오차</th>
                      <th className="px-4 py-2.5 text-right font-semibold">판정</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bt.cells.slice(0, 60).map((c) => (
                      <tr key={`${c.regionName}-${c.month}`} className="border-b border-line/60 last:border-0">
                        <td className="px-4 py-2 font-bold text-ink">{c.regionName}</td>
                        <td className="px-4 py-2 tabular-nums text-text-2">
                          {c.month.slice(0, 4)}.{c.month.slice(4)}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums text-text-2">
                          {Math.round(c.predictedPerPyeong / 10000).toLocaleString("ko-KR")}만
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums text-text-2">
                          {Math.round(c.actualPerPyeong / 10000).toLocaleString("ko-KR")}만
                        </td>
                        <td className={`px-4 py-2 text-right tabular-nums font-bold ${Math.abs(c.errorPct) <= BACKTEST.hitBandPct ? "text-success" : "text-danger"}`}>
                          {c.errorPct > 0 ? "+" : ""}
                          {c.errorPct}%
                        </td>
                        <td className="px-4 py-2 text-right">
                          {c.hit ? (
                            <span className="rounded-full bg-success-soft px-2 py-0.5 t-caption font-extrabold text-success">적중</span>
                          ) : (
                            <span className="rounded-full bg-bg px-2 py-0.5 t-caption font-extrabold text-text-3">벗어남</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {bt.cells.length > 60 && (
                <div className="px-4 py-2.5 t-sub text-text-3">
                  최근 60행 표시 · 전체 {bt.total}건은 요약 수치에 모두 반영돼 있습니다.
                </div>
              )}
            </div>
          </>
        )}

        <div className="rounded-[12px] bg-bg px-4 py-3 t-sub text-text-3">
          이 성적표는 조회 시점의 실거래 집계로 재계산됩니다. 과거 적중률은 미래
          수익을 보장하지 않으며, 예측 도구도 이 한계를 화면에 함께 표시합니다.{" "}
          <Link href="/analysis/ai/ai-prediction" className="font-bold text-primary no-underline">
            이 단지 시세 예측 실행 ›
          </Link>
        </div>
      </div>
    </PageShell>
  );
}
