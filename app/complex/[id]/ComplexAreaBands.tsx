import { getAreaBands } from "@/lib/complex/complex-store";

/* D5 — 면적대별 시세표 허브 승격. market_transactions 실거래 면적 구간별 최근가·평균가.
   실거래 없으면 렌더 생략(사실 우선). */

function manwon(m: number): string {
  if (!Number.isFinite(m) || m <= 0) return "—";
  if (m >= 10000) return `${(m / 10000).toFixed(1).replace(/\.0$/, "")}억`;
  return `${m.toLocaleString("ko-KR")}만`;
}

function ymLabel(s: string): string {
  return s.length === 6 ? `${s.slice(0, 4)}.${s.slice(4)}` : s;
}

export async function ComplexAreaBands({ complexId }: { complexId: string }) {
  const bands = await getAreaBands(complexId).catch(() => []);
  if (bands.length === 0) return null;

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
            {bands.map((b) => (
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
