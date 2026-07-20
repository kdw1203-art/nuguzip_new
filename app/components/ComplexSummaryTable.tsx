import Link from "next/link";
import {
  buildComplexTxSlug,
  type ComplexSummary,
} from "@/lib/market/complex-transactions";

/* 단지별 실거래 요약 테이블 — /region/[id] · /complex/browse 공용 (서버 컴포넌트).
   국토부 실거래가 기반, 매물 호가 아님. */

/** 원(KRW) → "28.6억" / "9,800만" */
function formatKrwShort(krw: number | null | undefined): string {
  if (krw === null || krw === undefined || !Number.isFinite(krw) || krw <= 0) return "—";
  if (krw >= 1e8) {
    const eok = krw / 1e8;
    return `${(eok >= 100 ? Math.round(eok) : Math.round(eok * 10) / 10).toLocaleString("ko-KR")}억`;
  }
  return `${Math.round(krw / 1e4).toLocaleString("ko-KR")}만`;
}

/** "202607" → "26.07" */
function shortYm(ym: string): string {
  return ym.length === 6 ? `${ym.slice(2, 4)}.${ym.slice(4)}` : ym;
}

export function ComplexSummaryTable({
  summaries,
  regionId,
}: {
  summaries: ComplexSummary[];
  regionId: string;
}) {
  if (summaries.length === 0) {
    return (
      <p className="py-6 text-center text-[13px] text-text-3">
        이 지역의 단지별 실거래 데이터를 준비 중입니다.
      </p>
    );
  }
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-[560px] text-left text-[13px]">
        <thead>
          <tr className="border-b border-border text-[11px] text-text-3">
            <th className="py-2 font-medium">단지</th>
            <th className="py-2 text-right font-medium">최근 실거래가</th>
            <th className="py-2 text-right font-medium">평균 평단가</th>
            <th className="py-2 text-right font-medium">12개월 거래</th>
          </tr>
        </thead>
        <tbody>
          {summaries.map((s) => (
            <tr key={s.complexName} className="border-b border-border last:border-b-0">
              <td className="max-w-[240px] py-2.5 pr-3">
                <Link
                  href={`/complex/tx/${buildComplexTxSlug(s.complexName, regionId)}`}
                  className="block"
                >
                  <span className="block truncate font-bold text-ink underline-offset-2 hover:underline">
                    {s.complexName}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-text-3">
                    {s.representativeAreaM2 !== null ? `대표 ${s.representativeAreaM2}㎡` : ""}
                    {s.buildYear ? ` · ${s.buildYear}년` : ""}
                  </span>
                </Link>
              </td>
              <td className="py-2.5 text-right">
                <span className="font-extrabold text-ink">
                  {formatKrwShort(s.latestAmountKrw)}
                </span>
                <span className="ml-1 text-[11px] text-text-3">
                  {shortYm(s.latestYm)}
                  {s.latestAreaM2 !== null ? ` · ${s.latestAreaM2.toFixed(0)}㎡` : ""}
                </span>
              </td>
              <td className="py-2.5 text-right text-text-2">
                {s.avgPricePerPyeongKrw !== null
                  ? `${formatKrwShort(s.avgPricePerPyeongKrw)}/평`
                  : "—"}
              </td>
              <td className="py-2.5 text-right text-text-2">{s.txCount12m}건</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
