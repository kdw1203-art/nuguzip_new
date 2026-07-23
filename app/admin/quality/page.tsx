import Link from "next/link";
import { loadAdminKpi } from "@/lib/admin/stats";
import {
  loadExpertOpsSummary,
  loadPendingVerificationQueue,
} from "@/lib/admin/expert-ops-metrics";

/* 사용자 세그먼트 · AI 품질 · 인증 심사 — 사실 우선: 하드코딩 목업 제거, 실 테이블 집계만.
   집계 소스가 없는 지표(휴면/이탈 코호트, 👍비율)는 허위 수치 대신 "준비 중"으로 표기. */

export const dynamic = "force-dynamic";

const lightCard =
  "flex flex-col gap-3 rounded-[20px] border border-line bg-surface p-5";

function fmt(n: number): string {
  return n.toLocaleString("ko-KR");
}

function relDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

export default async function AdminQualityPage() {
  const [kpi, ops, queue] = await Promise.all([
    loadAdminKpi().catch(() => null),
    loadExpertOpsSummary().catch(() => null),
    loadPendingVerificationQueue(12).catch(() => []),
  ]);

  // 사실 기반 세그먼트 — 정의 가능한 실측치만 (휴면/이탈 코호트는 행동 정의 필요 → 준비 중)
  const paidSubscribers = kpi
    ? Object.entries(kpi.planCounts)
        .filter(([tier]) => tier && tier !== "free" && tier !== "basic")
        .reduce((s, [, c]) => s + (c || 0), 0)
    : 0;

  const segments = [
    { dot: "#1a7f4e", label: "전체 가입", sub: "profiles", value: kpi ? fmt(kpi.totalUsers) : "—" },
    {
      dot: "#3182f6",
      label: "최근 7일 활동 작성자",
      sub: "글·노트 작성 유니크",
      value: kpi ? fmt(kpi.activeUsers7d) : "—",
    },
    { dot: "#e8a13a", label: "오늘 신규 가입", sub: "24시간", value: kpi ? fmt(kpi.newUsersToday) : "—" },
    { dot: "#7c3aed", label: "유료 구독", sub: "무료 제외 tier", value: kpi ? fmt(paidSubscribers) : "—" },
  ];

  return (
    <>
      <div className="rise-in text-[19px] font-extrabold text-white">
        사용자 세그먼트 · AI 품질 모니터링 · 인증 심사
      </div>
      <div className="rise-in -mt-2 mb-1 text-[11px] text-[#9aa6b8]">
        모든 수치는 실 테이블 집계입니다. 집계 소스가 없는 지표는 &quot;준비 중&quot;으로 표기해요.
      </div>

      <div className="rise-in-1 grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* 사용자 세그먼트 (실데이터) */}
        <div className={lightCard}>
          <div className="text-sm font-extrabold text-ink">사용자 세그먼트</div>
          <div className="flex flex-col gap-1.5 text-[11px]">
            {segments.map((s) => (
              <div
                key={s.label}
                className="flex items-center justify-between rounded-[10px] bg-bg px-3 py-2.5"
              >
                <span>
                  <b style={{ color: s.dot }}>●</b> <b className="text-ink">{s.label}</b>{" "}
                  <span className="text-text-3">({s.sub})</span>
                </span>
                <span className="font-extrabold tabular-nums text-ink">{s.value}</span>
              </div>
            ))}
          </div>
          <div className="text-[10px] text-text-3">
            휴면·이탈 위험 코호트는 행동 이벤트 정의가 확정되면 추가됩니다 (허위 수치 미표기).
          </div>
        </div>

        {/* AI 품질 모니터링 (실데이터 + 정직한 준비중) */}
        <div className={lightCard}>
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-extrabold text-ink">AI 품질 모니터링</span>
            <span className="text-[10px] text-text-3">최근 7일</span>
          </div>
          <div className="flex gap-2">
            <div className="flex-1 rounded-xl bg-bg p-3 text-center">
              <div className="text-xl font-extrabold tabular-nums text-ink">
                {kpi?.aiAnalysisRuns7d != null ? fmt(kpi.aiAnalysisRuns7d) : "—"}
              </div>
              <div className="text-[9px] text-text-3">AI 분석 실행</div>
            </div>
            <div className="flex-1 rounded-xl bg-bg p-3 text-center">
              <div className="text-xl font-extrabold tabular-nums text-ink">
                {kpi?.platformActivityEvents7d != null ? fmt(kpi.platformActivityEvents7d) : "—"}
              </div>
              <div className="text-[9px] text-text-3">플랫폼 활동 이벤트</div>
            </div>
          </div>
          <div className="rounded-[9px] bg-bg px-[11px] py-2 text-[10px] text-text-1">
            👍/👎 만족도 비율과 오답 리뷰 집계는 피드백 적재 파이프라인 연동 후 제공됩니다. 지금은
            실행량만 실측으로 표시해요.
          </div>
        </div>

        {/* 인증 심사 (실 대기열) */}
        <div className={lightCard}>
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-extrabold text-ink">전문가·중개사 인증 심사</span>
            <span className="text-[10px] text-text-3">
              대기 {ops ? fmt(ops.pendingVerifications) : "—"}건
            </span>
          </div>

          {queue.length === 0 ? (
            <div className="rounded-[14px] bg-bg px-3.5 py-6 text-center text-[11px] text-text-3">
              현재 심사 대기 중인 신청이 없어요.
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {queue.map((q) => (
                <div
                  key={`${q.kind}-${q.id}`}
                  className="flex items-center justify-between gap-2 rounded-[10px] bg-bg px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`rounded px-1.5 py-px text-[9px] font-extrabold ${
                          q.kind === "expert"
                            ? "bg-primary-soft text-primary"
                            : "bg-[#fdf3e7] text-[#c07a3a]"
                        }`}
                      >
                        {q.kind === "expert" ? "전문가" : "소유확인"}
                      </span>
                      <span className="truncate text-xs font-extrabold text-ink">{q.label}</span>
                    </div>
                    <div className="mt-0.5 truncate text-[9px] text-text-3">
                      {q.sub}
                      {q.createdAt ? ` · 신청 ${relDate(q.createdAt)}` : ""}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <Link
            href="/admin/moderation"
            className="rounded-[9px] bg-primary p-2 text-center text-[11px] font-bold text-white"
          >
            심사 콘솔로 이동 ›
          </Link>
          <div className="text-[10px] text-text-3">
            승인·반려 처리는 심사 콘솔에서 수행하며 admin_audit_logs에 기록됩니다.
          </div>
        </div>
      </div>
    </>
  );
}
