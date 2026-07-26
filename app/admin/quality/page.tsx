import { loadAdminKpi } from "@/lib/admin/stats";
import {
  loadExpertOpsSummary,
  loadPendingVerificationQueue,
  loadExpertPerformance,
  loadRecentFraudEvents,
} from "@/lib/admin/expert-ops-metrics";
import { VerificationQueue } from "./VerificationQueue";
import {
  loadDataQuality,
  pct,
  VERDICT_LABEL,
  VERDICT_MARK,
  VERDICT_COLOR,
  type QualityVerdict,
} from "@/lib/admin/data-quality";
import { ErrorState } from "@/app/components/ui/EmptyState";
import { logger } from "@/lib/log";

/* 사용자 세그먼트 · AI 품질 · 인증 심사 — 사실 우선: 하드코딩 목업 제거, 실 테이블 집계만.
   집계 소스가 없는 지표(휴면/이탈 코호트, 👍비율)는 허위 수치 대신 "준비 중"으로 표기.

   F4 — 데이터 품질 검사를 이 페이지 맨 위에 붙였다. 판정과 문구는 여기서 만들지 않는다.
   lib/admin/data-quality.ts 가 단일 판정층이고 이 파일은 그 결과를 그리기만 한다.
   0건으로 통과한 회귀 감시 항목을 한 줄로 접는 이유: 스무 개를 전부 초록으로 늘어놓으면
   "스무 가지 문제를 잡았다"처럼 읽히는데 사실은 하나도 안 잡힌 것이다. */

export const dynamic = "force-dynamic";

/* 결함 → 확인 필요 → 정상 순. 눈이 먼저 닿는 자리에 고칠 것을 둔다. */
const VERDICT_ORDER: Record<QualityVerdict, number> = {
  defect: 0,
  note: 1,
  normal: 2,
  pass: 3,
};

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
  /* 2026-07-26: 목록 세 개가 `.catch(() => [])` 였다. 조회가 실패해도 화면은
     "최근 감지된 이상행위가 없어요"·"집계할 상담 데이터가 아직 없어요"라고 말했다.
     이 화면 머리말은 "모든 수치는 실 테이블 집계입니다"라고 못 박고 있어서,
     실패를 0건으로 보이게 하면 그 문장이 그대로 거짓이 된다. 실패는 실패로 쓴다.
     (kpi·ops·quality 는 null 로 두고 이미 "—"·"집계 실패"로 표기 중이다.) */
  const settle = <T,>(p: Promise<T>, tag: string) =>
    p.then(
      (value) => ({ ok: true as const, value }),
      (err: unknown) => {
        logger.error(`[admin/quality] ${tag} 조회 실패`, err);
        return { ok: false as const, cause: err instanceof Error ? err.message : String(err) };
      },
    );

  const [kpi, ops, queueLoaded, perfLoaded, fraudLoaded, quality] = await Promise.all([
    loadAdminKpi().catch(() => null),
    loadExpertOpsSummary().catch(() => null),
    settle(loadPendingVerificationQueue(12), "전문가 인증 심사 큐"),
    settle(loadExpertPerformance(8), "전문가 성과"),
    settle(loadRecentFraudEvents(12), "이상행위 로그"),
    loadDataQuality().catch(() => null),
  ]);
  const queue = queueLoaded.ok ? queueLoaded.value : [];
  const perf = perfLoaded.ok ? perfLoaded.value : [];
  const fraud = fraudLoaded.ok ? fraudLoaded.value : [];

  const fraudSeverityMeta: Record<string, { label: string; cls: string }> = {
    warn: { label: "주의", cls: "bg-[#fdf3e7] text-warning" },
    review_queue: { label: "검토", cls: "bg-primary-soft text-primary" },
    block: { label: "차단", cls: "bg-[#fdecec] text-[#d64545]" },
  };

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
        데이터 품질 · 사용자 세그먼트 · AI 품질 모니터링 · 인증 심사
      </div>
      <div className="rise-in -mt-2 mb-1 text-[11px] text-[#9aa6b8]">
        모든 수치는 실 테이블 집계입니다. 집계 소스가 없는 지표는 &quot;준비 중&quot;으로 표기해요.
      </div>

      {/* F4 — 데이터 품질 검사 (public.data_quality_report 실집계) */}
      <div className={`rise-in-1 ${lightCard}`}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-sm font-extrabold text-ink">데이터 품질 검사</span>
          <span className="text-[10px] text-text-3">
            {quality
              ? `${quality.generatedAt} 기준 · 검사 시점에 DB 전량을 다시 셉니다`
              : "집계 실패"}
          </span>
        </div>

        {!quality ? (
          <div className="rounded-[14px] bg-bg px-3.5 py-6 text-center text-[11px] text-text-3">
            품질 집계를 불러오지 못했어요. 수치를 지어내지 않고 비워 둡니다.
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5 text-[10px] font-extrabold">
              {(["defect", "note", "normal", "pass"] as QualityVerdict[]).map((v) => (
                <span
                  key={v}
                  className="rounded-[8px] bg-bg px-2.5 py-1.5 tabular-nums"
                  style={{ color: VERDICT_COLOR[v] }}
                >
                  {VERDICT_MARK[v]} {v === "pass" ? "회귀 감시 통과" : VERDICT_LABEL[v]}{" "}
                  {fmt(quality.counts[v])}
                </span>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              {quality.groups.map((g) => (
                <div key={g.key} className="flex flex-col gap-2 rounded-[14px] bg-bg p-3.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs font-extrabold text-ink">
                      {g.label}{" "}
                      <span className="font-bold text-text-3">{g.table}</span>
                    </span>
                    <span className="shrink-0 text-[10px] tabular-nums text-text-3">
                      {fmt(g.rows)}행
                    </span>
                  </div>

                  {g.checks.length === 0 ? (
                    <div className="py-3 text-center text-[11px] text-text-3">
                      따로 볼 항목이 없어요.
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1.5">
                      {[...g.checks]
                        .sort((a, b) => VERDICT_ORDER[a.verdict] - VERDICT_ORDER[b.verdict])
                        .map((c) => {
                          const ratio = pct(c.count, c.base);
                          return (
                            <div
                              key={c.key}
                              className="rounded-[10px] border border-line bg-surface px-3 py-2.5"
                            >
                              <div className="flex items-baseline justify-between gap-2">
                                <span className="text-[11px] font-extrabold text-ink">
                                  <span style={{ color: VERDICT_COLOR[c.verdict] }}>
                                    {VERDICT_MARK[c.verdict]}
                                  </span>{" "}
                                  {c.label}
                                </span>
                                <span className="shrink-0 text-[11px] font-extrabold tabular-nums text-ink">
                                  {fmt(c.count)}
                                  {ratio && (
                                    <span className="ml-1 font-bold text-text-3">({ratio})</span>
                                  )}
                                </span>
                              </div>
                              <div className="mt-1 text-[10px] leading-[1.7] text-text-2">
                                {c.detail}
                              </div>
                              <div className="mt-0.5 text-[10px] leading-[1.7] text-text-3">
                                <b style={{ color: VERDICT_COLOR[c.verdict] }}>
                                  {VERDICT_LABEL[c.verdict]}
                                </b>{" "}
                                — {c.why}
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  )}

                  {g.guards.length > 0 && (
                    <div className="text-[10px] leading-[1.7] text-text-3">
                      <b className="text-[#1a7f4e]">● 회귀 감시 {g.guards.length}개 통과</b> —{" "}
                      {g.guards.join(" · ")}. 전부 0건이라 접어 뒀어요. 값이 잡히면 위 목록으로
                      올라옵니다.
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="text-[10px] leading-[1.7] text-text-3">
              &quot;정상&quot;은 0건이 아닌데도 실측으로 문제 없음을 확인한 항목입니다 — 근거를 각
              줄에 함께 적어 두었어요. 판정 기준은 lib/admin/data-quality.ts 한 곳에만 있습니다.
            </div>
          </>
        )}
      </div>

      <div className="rise-in-2 mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
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

          {queueLoaded.ok ? (
            <VerificationQueue queue={queue} />
          ) : (
            <ErrorState
              title="인증 심사 큐를 지금 불러오지 못했어요"
              desc="대기 중인 신청이 0건인 게 아니라 조회가 실패했습니다."
              cause={queueLoaded.cause}
            />
          )}

          <div className="text-[10px] text-text-3">
            전문가 신청은 이 자리에서 바로 승인·반려하며 결과는 신청자 알림·감사로그(audit_logs)에
            기록됩니다. 소유확인 건은 매물 심사에서 처리해요.
          </div>
        </div>
      </div>

      {/* J7 전문가 성과 랭킹 · J8 이상행위 로그 (실집계, 없으면 안내) */}
      <div className="rise-in-3 mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className={lightCard}>
          <div className="text-sm font-extrabold text-ink">전문가 성과 랭킹</div>
          {!perfLoaded.ok ? (
            <ErrorState
              title="전문가 성과를 지금 불러오지 못했어요"
              desc="데이터가 없는 게 아니라 집계 조회가 실패했습니다."
              cause={perfLoaded.cause}
            />
          ) : perf.length === 0 ? (
            <div className="rounded-[14px] bg-bg px-3.5 py-6 text-center text-[11px] text-text-3">
              집계할 상담 데이터가 아직 없어요.
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {perf.map((p, i) => (
                <div
                  key={p.expertId}
                  className="flex items-center justify-between gap-2 rounded-[10px] bg-bg px-3 py-2.5"
                >
                  <span className="flex items-center gap-2 truncate">
                    <b className="text-text-3">{i + 1}</b>
                    <b className="truncate text-xs text-ink">{p.name}</b>
                  </span>
                  <span className="shrink-0 text-[11px] text-text-2">
                    상담 <b className="text-ink">{fmt(p.total)}</b> · 답변율{" "}
                    <b className={p.replyRate >= 70 ? "text-[#1a7f4e]" : "text-text-2"}>
                      {p.replyRate}%
                    </b>
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="text-[10px] text-text-3">
            상담 수·답변율 기준(expert_consultations). 데이터가 쌓이면 자동 갱신돼요.
          </div>
        </div>

        <div className={lightCard}>
          <div className="text-sm font-extrabold text-ink">전문가 이상행위 로그</div>
          {!fraudLoaded.ok ? (
            <ErrorState
              title="이상행위 로그를 지금 불러오지 못했어요"
              desc="감지된 게 0건인 게 아니라 조회가 실패했습니다."
              cause={fraudLoaded.cause}
            />
          ) : fraud.length === 0 ? (
            <div className="rounded-[14px] bg-bg px-3.5 py-6 text-center text-[11px] text-text-3">
              최근 감지된 이상행위가 없어요.
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {fraud.map((f) => {
                const meta = fraudSeverityMeta[f.severity] ?? fraudSeverityMeta.warn;
                return (
                  <div
                    key={f.id}
                    className="flex items-center justify-between gap-2 rounded-[10px] bg-bg px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`rounded px-1.5 py-px text-[9px] font-extrabold ${meta.cls}`}
                        >
                          {meta.label}
                        </span>
                        <span className="truncate text-xs font-bold text-ink">{f.eventType}</span>
                      </div>
                      <div className="mt-0.5 truncate text-[9px] text-text-3">{f.userEmail}</div>
                    </div>
                    <span className="shrink-0 text-[9px] text-text-3">{relDate(f.createdAt)}</span>
                  </div>
                );
              })}
            </div>
          )}
          <div className="text-[10px] text-text-3">
            자동 감지(중복·이상 패턴)가 expert_fraud_events에 적재되면 여기서 모니터링합니다.
          </div>
        </div>
      </div>
    </>
  );
}
