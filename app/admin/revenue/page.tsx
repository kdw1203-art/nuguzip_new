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
import { loadIndexCoverage } from "@/lib/admin/seo-metrics";
import { getServiceSupabase } from "@/lib/supabase/service";

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

/* ── [#145] 애드센스 신청 게이트 ─────────────────────────────────────────────
   docs/adsense-timing-decision.md 의 두 트리거(일 100세션×14일 · 색인 1,000p)를
   한 화면에서 추적한다. 세션은 서버에서 직접 잴 수 없어(Vercel Analytics)
   platform_activity_events 일별 건수를 "프록시"로 보여주고, 최종 판정은 Vercel
   실측이라고 명시한다 — 프록시로 충족처럼 보여도 단독으로 신청하지 않는다. */

const ADSENSE_SESSION_DAILY = 100; // 일 평균 세션 기준
const ADSENSE_SESSION_DAYS = 14; //  연속 일수
const ADSENSE_INDEXED_PAGES = 1000; // 색인 등록 페이지 기준

interface AdsenseGate {
  /** 최근 14일 일별 이벤트 건수 (오래된 날 → 최신). null = 조회 실패 */
  dailyEvents: number[] | null;
  eventDailyAvg: number | null;
  daysOver100: number;
  /** 최신 색인 스냅샷 — null 이면 GSC 미연결(오너 패킷 ②) 또는 조회 실패 */
  indexed: number | null;
  submitted: number | null;
  indexWeek: string | null;
  indexState: "ok" | "not_configured" | "failed" | "empty";
}

async function loadAdsenseGate(): Promise<AdsenseGate> {
  const empty: AdsenseGate = {
    dailyEvents: null,
    eventDailyAvg: null,
    daysOver100: 0,
    indexed: null,
    submitted: null,
    indexWeek: null,
    indexState: "failed",
  };
  const sb = getServiceSupabase();

  /* ① 트래픽 프록시 — 14일 이벤트를 KST 일 단위로 버킷 */
  let dailyEvents: number[] | null = null;
  if (sb) {
    const since = new Date();
    since.setDate(since.getDate() - ADSENSE_SESSION_DAYS);
    since.setHours(0, 0, 0, 0);
    const { data, error } = await sb
      .from("platform_activity_events")
      .select("created_at")
      .gte("created_at", since.toISOString())
      .limit(20000);
    if (!error && Array.isArray(data)) {
      const byDay = new Map<string, number>();
      for (const r of data as Array<{ created_at?: string }>) {
        const t = r.created_at ? new Date(r.created_at) : null;
        if (!t || Number.isNaN(t.getTime())) continue;
        const day = new Intl.DateTimeFormat("sv-SE", {
          timeZone: "Asia/Seoul",
        }).format(t);
        byDay.set(day, (byDay.get(day) ?? 0) + 1);
      }
      const days: number[] = [];
      const cursor = new Date(since);
      for (let i = 0; i < ADSENSE_SESSION_DAYS; i++) {
        const key = new Intl.DateTimeFormat("sv-SE", {
          timeZone: "Asia/Seoul",
        }).format(cursor);
        days.push(byDay.get(key) ?? 0);
        cursor.setDate(cursor.getDate() + 1);
      }
      dailyEvents = days;
    }
  }
  const eventDailyAvg =
    dailyEvents && dailyEvents.length > 0
      ? Math.round(dailyEvents.reduce((s, v) => s + v, 0) / dailyEvents.length)
      : null;
  const daysOver100 = dailyEvents
    ? dailyEvents.filter((v) => v >= ADSENSE_SESSION_DAILY).length
    : 0;

  /* ② 색인 — GSC 주간 스냅샷 최신 1건 */
  let indexed: number | null = null;
  let submitted: number | null = null;
  let indexWeek: string | null = null;
  let indexState: AdsenseGate["indexState"] = "failed";
  try {
    const cov = await loadIndexCoverage(1);
    if (cov.state === "not_configured") indexState = "not_configured";
    else if (cov.state === "failed") indexState = "failed";
    else if (cov.rows.length === 0) indexState = "empty";
    else {
      indexState = "ok";
      indexed = cov.rows[0].indexed;
      submitted = cov.rows[0].submitted;
      indexWeek = cov.rows[0].collectedWeek;
    }
  } catch {
    indexState = "failed";
  }

  return {
    ...empty,
    dailyEvents,
    eventDailyAvg,
    daysOver100,
    indexed,
    submitted,
    indexWeek,
    indexState,
  };
}

export default async function AdminRevenuePage() {
  /* plan-expiry 스윕의 최근 실행 기록 — 일회성 결제 강등(churn)을 수익 화면에서
     바로 본다. 실패는 null(칸 미표시)로 두고 0건과 구분한다. */
  const [kpi, expiryLog, preorder, adsense] = await Promise.all([
    loadAdminKpi(),
    listIngestLog(60).then(
      (rows) => rows.find((r) => r.source === "plan-expiry") ?? null,
      () => null,
    ),
    /* 고도화 31 — 결제 오픈 전 수요(오픈 알림 신청). 실패는 null → "—". */
    loadPreorderInterest().catch(() => null),
    /* [#145] 애드센스 신청 게이트 실측 */
    loadAdsenseGate(),
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
            <div className="text-[12px] text-[#9aa6b8]">{k.label}</div>
            <div className="mt-1 text-[19px] font-extrabold tabular-nums text-white">
              {k.value}
            </div>
            {k.sub && <div className="mt-0.5 text-[12px] text-[#9aa6b8]">{k.sub}</div>}
          </div>
        ))}
      </div>

      {/* 구독 플랜 분해 (실 카운트) */}
      <div className="rise-in-2 mt-4 flex flex-col gap-2">
        <div className="text-[15px] font-extrabold text-white">구독 플랜 분해</div>
        {/* [939 · G012] overflow-hidden 은 모바일에서 넘친 열을 잘라 버린다 —
            표는 제 폭을 지키고 카드 안에서 가로 스크롤로 다 보이게 한다. */}
        <div className={`${darkCard} overflow-x-auto`}>
          <table className="w-full min-w-[520px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-[rgba(255,255,255,.08)] text-[12px] text-[#9aa6b8]">
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
            <Link href="/admin/data" className="text-[12px] font-bold text-ai-accent no-underline">
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

      {/* [#145] 애드센스 신청 게이트 — docs/adsense-timing-decision.md 의 두 조건 추적 */}
      <div className="rise-in-2 mt-4 rounded-[14px] border border-[rgba(255,255,255,.08)] bg-[rgba(255,255,255,.03)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-[13px] font-extrabold text-white">
            애드센스 신청 게이트{" "}
            <span className="text-[12px] font-medium text-[#9aa6b8]">
              둘 다 충족되는 첫 주에 신청
            </span>
          </div>
          <Link
            href="/admin/seo"
            className="text-[12px] font-bold text-ai-accent no-underline"
          >
            색인 현황 →
          </Link>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {/* 조건 1 — 트래픽 */}
          <div className="rounded-[12px] border border-[rgba(255,255,255,.07)] bg-[rgba(255,255,255,.03)] p-3.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[12px] font-bold text-[#9aa6b8]">
                조건 1 · 일 {ADSENSE_SESSION_DAILY}세션 × {ADSENSE_SESSION_DAYS}일 연속
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${
                  adsense.dailyEvents && adsense.daysOver100 >= ADSENSE_SESSION_DAYS
                    ? "bg-[rgba(74,222,128,.15)] text-ai-success"
                    : "bg-[rgba(255,255,255,.08)] text-[#c9d2e0]"
                }`}
              >
                {adsense.dailyEvents == null
                  ? "측정 불가"
                  : adsense.daysOver100 >= ADSENSE_SESSION_DAYS
                    ? "프록시 충족"
                    : "미충족"}
              </span>
            </div>
            <div className="mt-1.5 text-[19px] font-extrabold tabular-nums text-white">
              {adsense.eventDailyAvg != null
                ? `일평균 ${adsense.eventDailyAvg.toLocaleString("ko-KR")}건`
                : "—"}
            </div>
            <p className="mt-1 text-[12px] leading-relaxed text-[#9aa6b8]">
              최근 {ADSENSE_SESSION_DAYS}일 활동 이벤트 기준 프록시 · 기준 넘긴 날{" "}
              {adsense.daysOver100}/{ADSENSE_SESSION_DAYS}일. 최종 판정은 Vercel
              Analytics 실측(봇 제외)으로 — 프록시 단독으로 신청하지 않습니다.
            </p>
          </div>

          {/* 조건 2 — 색인 */}
          <div className="rounded-[12px] border border-[rgba(255,255,255,.07)] bg-[rgba(255,255,255,.03)] p-3.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[12px] font-bold text-[#9aa6b8]">
                조건 2 · 색인 등록 {ADSENSE_INDEXED_PAGES.toLocaleString("ko-KR")}p 이상
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${
                  adsense.indexed != null && adsense.indexed >= ADSENSE_INDEXED_PAGES
                    ? "bg-[rgba(74,222,128,.15)] text-ai-success"
                    : "bg-[rgba(255,255,255,.08)] text-[#c9d2e0]"
                }`}
              >
                {adsense.indexState === "not_configured"
                  ? "GSC 대기"
                  : adsense.indexed == null
                    ? "측정 불가"
                    : adsense.indexed >= ADSENSE_INDEXED_PAGES
                      ? "충족"
                      : "미충족"}
              </span>
            </div>
            <div className="mt-1.5 text-[19px] font-extrabold tabular-nums text-white">
              {adsense.indexed != null
                ? `${adsense.indexed.toLocaleString("ko-KR")}p 색인`
                : "—"}
            </div>
            <p className="mt-1 text-[12px] leading-relaxed text-[#9aa6b8]">
              {adsense.indexState === "not_configured"
                ? "Search Console 소유확인(오너 패킷 ②)이 끝나면 주간 스냅샷이 여기 쌓입니다."
                : adsense.indexState === "empty"
                  ? "GSC 연결됨 · 첫 주간 스냅샷 수집 대기 중."
                  : adsense.indexed != null
                    ? `제출 ${adsense.submitted?.toLocaleString("ko-KR") ?? "—"}p · ${adsense.indexWeek ?? ""} 주간 스냅샷 기준.`
                    : "색인 스냅샷을 읽지 못했습니다 — /admin/seo 에서 상태를 확인하세요."}
            </p>
          </div>
        </div>

        <p className="mt-2.5 text-[12px] leading-relaxed text-[#9aa6b8]">
          신청 당일 순서와 반려 리스크는 docs/adsense-timing-decision.md ·
          adsense-readiness.md 기준. 심사 중 빈 광고 슬롯 금지(하우스 광고 유지).
        </p>
      </div>

      {/* [#140] 데이터 투자 게이트 — 경매 유료 API 재판정 (docs/court-auction-source-research.md) */}
      <div className="rise-in-2 mt-4 rounded-[14px] border border-[rgba(255,255,255,.08)] bg-[rgba(255,255,255,.03)] p-4">
        <div className="text-[13px] font-extrabold text-white">
          데이터 투자 게이트 · 경매 유료 API{" "}
          <span className="text-[12px] font-medium text-[#9aa6b8]">
            충족 시 하이픈 TR슬림(월 10만원) 재검토
          </span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-2.5 py-1 text-[12px] font-extrabold ${
              kpiReady && paid >= 10
                ? "bg-[rgba(74,222,128,.15)] text-ai-success"
                : "bg-[rgba(255,255,255,.08)] text-[#c9d2e0]"
            }`}
          >
            G1 유료 구독 {kpiReady ? paid.toLocaleString("ko-KR") : "—"}/10건
          </span>
          <span className="rounded-full bg-[rgba(255,255,255,.08)] px-2.5 py-1 text-[12px] font-extrabold text-[#c9d2e0]">
            G2 월 3,000세션 — Vercel 실측 확인
          </span>
        </div>
        <p className="mt-2 text-[12px] leading-relaxed text-[#9aa6b8]">
          둘 중 하나 충족 시 재검토(테스트베드 → 표본 30건 검증 → 오너 예산 승인 순).
          오너가 사법정보공유포털에서 무료 경매 API를 확인하면 게이트와 무관하게 즉시
          연동으로 전환합니다 — docs/court-auction-source-research.md #140 절.
        </p>
      </div>

      {/* 정직한 준비 중 — 실 데이터 소스 없는 항목 */}
      <div className="rise-in-2 mt-4 rounded-[14px] border border-[rgba(255,255,255,.08)] bg-[rgba(255,255,255,.03)] p-4">
        <div className="text-[13px] font-extrabold text-white">
          결제 실패 · 환불 분쟁 큐{" "}
          <span className="text-[12px] font-medium text-[#9aa6b8]">준비 중</span>
        </div>
        <p className="mt-1 text-[12px] leading-relaxed text-[#9aa6b8]">
          결제·정산 파이프라인(PG) 연동 후 실 데이터로 집계합니다. 현재는 추정·조작
          수치를 노출하지 않아요. MRR은 실제 유료 플랜 카운트로만 계산한 추정치입니다.
        </p>
      </div>
    </>
  );
}
