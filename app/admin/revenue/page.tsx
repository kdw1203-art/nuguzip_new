/* 관리자 수익 대시보드 — 실집계.
   구독 MRR(실 플랜 카운트)·유료 전환·30일 결제(payments)·전문가 수 등 실데이터만 노출.
   결제 실패/환불 분쟁은 정산 연동 전까지 '준비 중'으로 정직하게 표기. */

import { listIngestLog } from "@/lib/market/store";
import Link from "next/link";
import { loadAdminKpi, loadPreorderInterest } from "@/lib/admin/stats";
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
  /* plan-expiry 스윕의 최근 실행 기록 — 일회성 결제 강등(churn)을 수익 화면에서
     바로 본다. 실패는 null(칸 미표시)로 두고 0건과 구분한다. */
  const [kpi, expiryLog, preorder] = await Promise.all([
    loadAdminKpi(),
    listIngestLog(60).then(
      (rows) => rows.find((r) => r.source === "plan-expiry") ?? null,
      () => null,
    ),
    /* 고도화 31 — 결제 오픈 전 수요(오픈 알림 신청). 실패는 null → "—". */
    loadPreorderInterest().catch(() => null),
  ]);
  const mrr = estimateSubscriptionMrrKrw(kpi.planCounts);
  const paid = paidSubscriptionCount(kpi.planCounts);
  const rows = buildSubscriptionAdminRows(kpi.planCounts);

  /* DB 미연결이면 0 이 아니라 "—" — 0건은 사실, 미연결은 모름 (대시보드 kpiReady 와 동일). */
  const kpiReady = kpi.supabaseConfigured;
  const num = (v: number) => (kpiReady ? v.toLocaleString("ko-KR") : "—");
  const money = (v: number) => (kpiReady ? won(v) : "—");
  const kpis: { label: string; value: string; sub?: string }[] = [
    { label: "MRR (구독 추정)", value: money(mrr), sub: "유료 플랜 × 요금" },
    { label: "유료 구독", value: num(paid), sub: kpiReady ? `전환율 ${pct(paid, kpi.totalUsers)}` : "DB 미연결" },
    { label: "전체 사용자", value: num(kpi.totalUsers), sub: kpiReady ? `활성(7일) ${num(kpi.activeUsers7d)}` : "DB 미연결" },
    { label: "전문가 수", value: num(kpi.totalExperts), sub: "인증 완료" },
    { label: "30일 결제 건수", value: num(kpi.paymentsCompleted30d), sub: "payments 완료" },
    { label: "30일 결제 매출", value: money(kpi.paymentsRevenue30dKrw), sub: "실 결제 합계" },
    {
      label: "사전 등록 수요",
      value: preorder ? preorder.total.toLocaleString("ko-KR") : "—",
      sub: preorder
        ? `식별 신청자 ${preorder.users.toLocaleString("ko-KR")}명 · 결제 오픈 판단 근거`
        : "조회 실패 또는 DB 미연결",
    },
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
                  <td className="px-4 py-2.5 text-right tabular-nums text-ai-accent">
                    {won(r.mrrPortion)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 최근 플랜 만료 강등 — plan-expiry 스윕이 ingest-log 에 남긴 실기록 */}
      {expiryLog && (
        <div className="rise-in-2 mt-4 rounded-[14px] border border-[rgba(255,255,255,.08)] bg-[rgba(255,255,255,.03)] p-4">
          <div className="flex items-center justify-between">
            <div className="text-[13px] font-extrabold text-white">최근 플랜 만료 스윕</div>
            <Link href="/admin/data" className="text-[11px] font-bold text-ai-accent no-underline">
              전체 실행 기록 →
            </Link>
          </div>
          <p className="mt-1 text-[12px] leading-relaxed text-[#9aa6b8]">
            {expiryLog.message ?? `강등 ${expiryLog.rows}명`} ·{" "}
            {new Date(expiryLog.createdAt).toLocaleString("ko-KR")} ·{" "}
            {expiryLog.status === "ok" ? "정상" : `상태 ${expiryLog.status}`}
          </p>
        </div>
      )}

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
