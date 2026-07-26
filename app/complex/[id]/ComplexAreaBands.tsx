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

export async function ComplexAreaBands({ complexId }: { complexId: string }) {
  const bands = await getAreaBands(complexId).then(
    (data) => ({ ok: true as const, data }),
    (e: unknown) => {
      logger.error("[complex] 면적대별 시세 조회 실패", e);
      return { ok: false as const };
    },
  );
  if (!bands.ok) {
    return (
      <section className="rise-in-5 mt-6">
        <h2 className="mb-2 px-1 text-[15px] font-extrabold text-ink">면적대별 시세</h2>
        <p className="card rounded-2xl p-5 text-[13px] text-text-3">
          지금은 면적대별 시세를 불러오지 못했어요. 거래가 없는 게 아니라 조회에 실패한
          것이라, 잠시 후 새로고침하면 보일 수 있어요.
        </p>
      </section>
    );
  }
  if (bands.data.length === 0) return null;

  return (
    <section className="rise-in-5 mt-6">
      <h2 className="mb-2 px-1 text-[15px] font-extrabold text-ink">
        면적대별 시세 <span className="text-[12px] font-medium text-text-3">국토부 실거래 기준</span>
      </h2>
      <div className="card overflow-hidden rounded-2xl">
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="border-b border-line text-[11px] text-text-3">
              <th className="px-4 py-2.5 font-semibold">면적</th>
              <th className="px-4 py-2.5 text-right font-semibold">최근 실거래</th>
              <th className="px-4 py-2.5 text-right font-semibold">평균</th>
              <th className="px-4 py-2.5 text-right font-semibold">건수</th>
            </tr>
          </thead>
          <tbody>
            {bands.data.map((b) => (
              <tr key={b.label} className="border-b border-line last:border-0">
                <td className="px-4 py-2.5 font-bold text-ink">{b.label}</td>
                <td className="px-4 py-2.5 text-right">
                  <span className="font-extrabold text-primary">{manwon(b.latestManwon)}</span>{" "}
                  <span className="text-[10px] text-text-3">{ymLabel(b.latestYm)}</span>
                </td>
                <td className="px-4 py-2.5 text-right text-text-2">{manwon(b.avgManwon)}</td>
                <td className="px-4 py-2.5 text-right text-text-3">{b.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
