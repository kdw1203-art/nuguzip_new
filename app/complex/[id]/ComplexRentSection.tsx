import {
  getComplexRentHistoryByNames,
  type ComplexRentHistory,
} from "@/lib/market/complex-rent";

/* [#94 잔여] 단지 전월세 이력 — 지역 페이지 전월세 탭(1회차)의 단지 버전.
   market_transactions(rent) 를 (region_name, complex_name) 등치로 읽어
   월별 전세 보증금 중앙값 · 월세(보증금/월세) 중앙값 · 건수를 표로 보여 준다.
   0건이면 섹션 미표시, 조회 실패도 미표시(없음을 지어내지 않고, 실패 문구로
   페이지를 채우지도 않는다 — 곁다리 섹션의 관례: UpcomingSupply 와 동일). */

function fmtYm(ym: string): string {
  return ym.length === 6 ? `${ym.slice(0, 4)}.${ym.slice(4)}` : ym;
}

function fmtEok(krw: number | null): string {
  if (krw === null || !Number.isFinite(krw) || krw <= 0) return "—";
  const eok = krw / 100_000_000;
  if (eok >= 1) return `${eok.toFixed(1).replace(/\.0$/, "")}억`;
  return `${Math.round(krw / 10_000).toLocaleString("ko-KR")}만`;
}

function fmtManwon(krw: number | null): string {
  if (krw === null || !Number.isFinite(krw) || krw <= 0) return "—";
  return `${Math.round(krw / 10_000).toLocaleString("ko-KR")}만`;
}

export async function ComplexRentSection({
  region,
  name,
}: {
  region: string;
  name: string;
}) {
  let hist: ComplexRentHistory | null = null;
  try {
    hist = await getComplexRentHistoryByNames(region, name);
  } catch {
    return null; // 곁다리 섹션 — 못 읽으면 접는다 (본문 실거래와 달리 페이지 정체성이 아님)
  }
  if (!hist || hist.months.length === 0) return null;

  const shown = hist.months.slice(0, 12);
  const jeonseTotal = hist.months.reduce((s, m) => s + m.jeonseCount, 0);
  const wolseTotal = hist.months.reduce((s, m) => s + m.wolseCount, 0);

  return (
    <section className="rise-in-5 mt-6">
      <h2 className="mb-2 px-1 text-[15px] font-extrabold text-ink">
        전월세 실거래 이력{" "}
        <span className="text-[12px] font-medium text-text-3">
          {hist.periodLabel} · 전세 {jeonseTotal.toLocaleString("ko-KR")}건 · 월세{" "}
          {wolseTotal.toLocaleString("ko-KR")}건
          {hist.truncated ? " · 표본 상한 도달" : ""}
        </span>
      </h2>
      <div className="card overflow-x-auto rounded-2xl px-4 py-2">
        <table className="w-full min-w-[520px] text-[13px]">
          <thead>
            <tr className="border-b border-line text-left text-[11px] text-text-3">
              <th className="py-2 pr-3 font-semibold">계약월</th>
              <th className="py-2 pr-3 text-right font-semibold">전세 중앙값</th>
              <th className="py-2 pr-3 text-right font-semibold">전세 건수</th>
              <th className="py-2 pr-3 text-right font-semibold">월세 (보증금/월세)</th>
              <th className="py-2 text-right font-semibold">월세 건수</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((m) => (
              <tr key={m.month} className="border-b border-[#f0f3f8] last:border-0">
                <td className="py-2.5 pr-3 font-bold text-ink tabular-nums">
                  {fmtYm(m.month)}
                </td>
                <td className="py-2.5 pr-3 text-right font-extrabold text-ink tabular-nums">
                  {fmtEok(m.jeonseMedianDepositKrw)}
                </td>
                <td className="py-2.5 pr-3 text-right text-text-2 tabular-nums">
                  {m.jeonseCount > 0 ? m.jeonseCount : "—"}
                </td>
                <td className="py-2.5 pr-3 text-right font-bold text-ink tabular-nums">
                  {m.wolseCount > 0
                    ? `${fmtEok(m.wolseMedianDepositKrw)} / ${fmtManwon(m.wolseMedianMonthlyKrw)}`
                    : "—"}
                </td>
                <td className="py-2.5 text-right text-text-2 tabular-nums">
                  {m.wolseCount > 0 ? m.wolseCount : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="t-caption mt-1.5 px-1 text-text-3">
        국토교통부 전월세 신고 기준. 최근 1~2개월은 신고 지연으로 실제보다 적게 잡힐 수
        있고, 신고분에는 갱신·신규 계약이 섞여 있어 체감 시세와 다를 수 있습니다. 중앙값은
        면적을 가중하지 않은 값입니다.
      </p>
    </section>
  );
}
