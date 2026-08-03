import Link from "next/link";
import { getAreaBands } from "@/lib/complex/complex-store";
import { logger } from "@/lib/log";

/* D5 — 면적대별 시세표 허브 승격. market_transactions 실거래 면적 구간별 최근가·평균가.
   실거래 없으면 렌더 생략(사실 우선).

   단, "실거래가 없다"와 "지금 못 불러왔다"는 다른 사실이다. 예전엔 조회가 실패해도
   .catch(() => []) 로 빈 배열이 되어 섹션이 통째로 사라졌고, 사용자에게는 이 단지에
   신고된 거래가 없는 것처럼 보였다. 실패는 실패라고 적는다. */

function manwon(m: number): string {
  if (!Number.isFinite(m) || m <= 0) return "—";
  if (m >= 10000) return `${(m / 10000).toFixed(1).replace(/\.0$/, "")}억`;
  return `${m.toLocaleString("ko-KR")}만`;
}

function ymLabel(s: string): string {
  return s.length === 6 ? `${s.slice(0, 4)}.${s.slice(4)}` : s;
}

export async function ComplexAreaBands({
  complexId,
  compact = false,
}: {
  complexId: string;
  /** 상단 배치 시 여백·패딩을 줄여 밀도 확보 */
  compact?: boolean;
}) {
  const bands = await getAreaBands(complexId).then(
    (data) => ({ ok: true as const, data }),
    (e: unknown) => {
      logger.error("[complex] 면적대별 시세 조회 실패", e);
      return { ok: false as const };
    },
  );
  const wrap = compact ? "rise-in-1" : "rise-in-5 mt-6";
  if (!bands.ok) {
    return (
      <section className={wrap}>
        <h2 className="mb-1.5 px-0.5 text-[14px] font-extrabold text-ink">면적대별 시세</h2>
        <p className="card rounded-2xl px-4 py-3.5 text-[13px] text-text-3">
          지금은 면적대별 시세를 불러오지 못했어요. 거래가 없는 게 아니라 조회에 실패한
          것이라, 잠시 후 새로고침하면 보일 수 있어요.
        </p>
      </section>
    );
  }
  if (bands.data.length === 0) return null;

  /* 항목 17 — 평균은 표본 기간 전체 거래의 평균이다. 기간 없이 숫자만 적으면
     석 달치 평균과 삼 년치 평균이 같은 얼굴을 한다. 기준 기간을 표 아래 명기한다. */
  const firstYm = bands.data.reduce(
    (min, b) => (b.firstYm < min ? b.firstYm : min),
    bands.data[0].firstYm,
  );
  const latestYm = bands.data.reduce(
    (max, b) => (b.latestYm > max ? b.latestYm : max),
    bands.data[0].latestYm,
  );
  const totalCount = bands.data.reduce((s, b) => s + b.count, 0);
  const period =
    firstYm === latestYm ? ymLabel(latestYm) : `${ymLabel(firstYm)}~${ymLabel(latestYm)}`;

  return (
    <section className={wrap}>
      <h2 className="mb-1.5 px-0.5 text-[14px] font-extrabold text-ink">
        면적대별 시세{" "}
        <span className="text-[11px] font-medium text-text-3">
          {bands.data.length}구간 · 국토부
        </span>
      </h2>
      <div className="card overflow-hidden rounded-2xl">
        <table className="w-full text-left text-[12px] sm:text-[13px]">
          <thead>
            <tr className="border-b border-line bg-[#f7f9fd] text-[10px] text-text-3 sm:text-[11px]">
              <th className="px-3 py-2 font-semibold sm:px-4 sm:py-2.5">면적</th>
              <th className="px-3 py-2 text-right font-semibold sm:px-4 sm:py-2.5">최근</th>
              <th className="px-3 py-2 text-right font-semibold sm:px-4 sm:py-2.5">평균</th>
              <th className="px-3 py-2 text-right font-semibold sm:px-4 sm:py-2.5">건수</th>
            </tr>
          </thead>
          <tbody>
            {bands.data.map((b) => (
              <tr key={b.label} className="border-b border-line last:border-0">
                <td className="px-3 py-2 font-bold text-ink sm:px-4 sm:py-2.5">{b.label}</td>
                <td className="px-4 py-2.5 text-right">
                  <span className="font-extrabold text-primary">{manwon(b.latestManwon)}</span>{" "}
                  <span className="text-[10px] text-text-3">{ymLabel(b.latestYm)}</span>
                </td>
                <td className="px-4 py-2.5 text-right text-text-2">
                  {manwon(b.avgManwon)}
                  {/* 구간 안 분포 — 최저~최고가 같으면(거래 1건 등) 반복 표기 생략 */}
                  {b.minManwon !== b.maxManwon && (
                    <span className="block text-[10px] leading-tight text-text-3">
                      {manwon(b.minManwon)}~{manwon(b.maxManwon)}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right text-text-3">{b.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-1.5 px-1 text-[10px] leading-relaxed text-text-3">
        {/* 항목 14 — 용어 첫 등장에 용어사전 링크 */}
        <Link href="/glossary/jeonyongmyeonjeok" className="underline underline-offset-2">
          전용면적
        </Link>{" "}
        구간 · {period} 계약분 {totalCount}건 기준 ·{" "}
        <Link href="/glossary/haejegeorae" className="underline underline-offset-2">
          해제 신고
        </Link>{" "}
        제외 · 평균은 표본 기간 전체 거래의 산술평균
      </p>
    </section>
  );
}
