/* 관리자 수익 대시보드 — 실집계.
   구독 MRR(실 플랜 카운트)·유료 전환·30일 결제(payments)·전문가 수 등 실데이터만 노출.
   결제 실패/환불 분쟁은 정산 연동 전까지 '준비 중'으로 정직하게 표기. */

import { loadAdminKpi } from "@/lib/admin/stats";
import {
  estimateSubscriptionMrrKrw,
  paidSubscriptionCount,
  buildSubscriptionAdminRows,
} from "@/lib/admin/subscription-metrics";

export const dynamic = "force-dynamic";

const darkCard =
  "rounded-[14px] border border-[rgba(255,255,255,.08)] bg-[rgba(255,255,255,.05)]";

/** 원(KRW) → "2,140만" / "2.6억" / "0원" */
function won(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0원";
  if (n >= 1e8) {
    const eok = n / 1e8;
    return `${(eok >= 100 ? Math.round(eok) : Math.round(eok * 10) / 10).toLocaleString("ko-KR")}억`;
  }
  if (n >= 1e4) return `${Math.round(n / 1e4).toLocaleString("ko-KR")}만`;
  return `${Math.round(n).toLocaleString("ko-KR")}원`;
}

function pct(part: number, whole: number): string {
  if (whole <= 0) return "—";
  return `${((part / whole) * 100).toFixed(1)}%`;
}

export default async function AdminRevenuePage() {
  const kpi = await loadAdminKpi();
  const mrr = estimateSubscriptionMrrKrw(kpi.planCounts);
  const paid = paidSubscriptionCount(kpi.planCounts);
  const rows = buildSubscriptionAdminRows(kpi.planCounts);

  const kpis: { label: string; value: string; sub?: string }[] = [
    { label: "MRR (구독 추정)", value: won(mrr), sub: "유료 플랜 × 요금" },
    { label: "유료 구독", value: paid.toLocaleString("ko-KR"), sub: `전환율 ${pct(paid, kpi.totalUsers)}` },
    { label: "전체 사용자", value: kpi.totalUsers.toLocaleString("ko-KR"), sub: `활성(7일) ${kpi.activeUsers7d.toLocaleString("ko-KR")}` },
    { label: "전문가 수", value: kpi.totalExperts.toLocaleString("ko-KR"), sub: "인증 완료" },
    { label: "30일 결제 건수", value: kpi.paymentsCompleted30d.toLocaleString("ko-KR"), sub: "payments 완료" },
    { label: "30일 결제 매출", value: won(kpi.paymentsRevenue30dKrw), sub: "실 결제 합계" },
  ];

  return (
    <>
      {/* 헤더 */}
      <div className="rise-in flex flex-wrap items-center justify-between gap-3">
        <div className="text-[19px] font-extrabold text-white">
          수익 대시보드{" "}
          <span className="text-xs font-medium text-[#9aa6b8]">실집계 · 운영·재무</span>
        </div>
        <span className="rounded-[10px] bg-[rgba(255,255,255,.07)] px-3.5 py-[7px] text-xs font-semibold text-[#c9d2e0]">
          {kpi.stripeConfigured ? "결제 연동됨" : "결제 미연동"}
        </span>
      </div>

      {/* KPI (실데이터) */}
      <div className="rise-in-1 grid grid-cols-2 gap-3 lg:grid-cols-3">
        {kpis.map((k) => (
          <div key={k.label} className={`${darkCard} p-4`}>
            <div className="text-[11px] text-[#9aa6b8]">{k.label}</div>
            <div className="mt-1 text-[20px] font-extrabold tabular-nums text-white">
              {k.value}
            </div>
            {k.sub && <div className="mt-0.5 text-[11px] text-[#9aa6b8]">{k.sub}</div>}
          </div>
        ))}
      </div>

      {/* 구독 플랜 분해 (실 카운트) */}
      <div className="rise-in-2 mt-4 flex flex-col gap-2">
        <div className="text-[15px] font-extrabold text-white">구독 플랜 분해</div>
        <div className={`${darkCard} overflow-hidden`}>
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-[rgba(255,255,255,.08)] text-[11px] text-[#9aa6b8]">
                <th className="px-4 py-2.5 font-semibold">플랜</th>
                <th className="px-4 py-2.5 font-semibold">인원</th>
                <th className="px-4 py-2.5 font-semibold">요금</th>
                <th className="px-4 py-2.5 text-right font-semibold">MRR 기여</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-[rgba(255,255,255,.05)] last:border-0">
                  <td className="px-4 py-2.5 font-bold text-white">{r.label}</td>
                  <td className="px-4 py-2.5 tabular-nums text-[#c9d2e0]">
                    {r.count.toLocaleString("ko-KR")}
                  </td>
                  <td className="px-4 py-2.5 text-[#9aa6b8]">{r.priceLabel}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-[#7ea2ff]">
                    {won(r.mrrPortion)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 정직한 준비 중 — 실 데이터 소스 없는 항목 */}
      <div className="rise-in-2 mt-4 rounded-[14px] border border-[rgba(255,255,255,.08)] bg-[rgba(255,255,255,.03)] p-4">
        <div className="text-[13px] font-extrabold text-white">
          결제 실패 · 환불 분쟁 큐{" "}
          <span className="text-[11px] font-medium text-[#9aa6b8]">준비 중</span>
        </div>
        <p className="mt-1 text-[12px] leading-relaxed text-[#9aa6b8]">
          결제·정산 파이프라인(PG) 연동 후 실 데이터로 집계합니다. 현재는 추정·조작
          수치를 노출하지 않아요. MRR은 실제 유료 플랜 카운트로만 계산한 추정치입니다.
        </p>
      </div>
    </>
  );
}
