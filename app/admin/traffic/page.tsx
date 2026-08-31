import type { Metadata } from "next";
import { getServiceSupabase } from "@/lib/supabase/service";
import { FUNNEL_EVENT } from "@/lib/platform-funnel-events";
import {
  classifyVital,
  formatVital,
  loadVitalsLast7d,
  type VitalStat,
} from "@/lib/admin/stats";
import { logger } from "@/lib/log";
import {
  listTopRegionDemands,
  type RegionDemandRow,
} from "@/lib/coverage/store-db";

export const metadata: Metadata = {
  title: "트래픽 | 누구집 관리자",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/* ============================================================
   관리자 · 트래픽 대시보드 — 접속자·체류시간·페이지·기능 사용.

   데이터 층위(전부 실측 · 셋 다 다른 모집단이라 화면에 명기):
   1) 접속자·페이지·체류 — 1st-party page_view_events.
      **분석 동의(analytics=true) 사용자 표본**이다. 동의 배너에서 "필수만
      허용"을 누른 방문은 여기 없다 — 전체 방문의 하한선으로 읽어야 한다.
   2) 기능 사용 — platform_activity_events(서버 확정 기록). 동의와 무관하게
      서버가 남기는 행위 로그라 1)보다 모집단이 넓다.
   조회 실패는 실패라고 표기하고, 수집 시작 시점(first_event_at)을 밝힌다 —
   "누적"이 서비스 전체 역사가 아니라 수집 개시 이후라는 사실이 중요하다.
   ============================================================ */

type Summary = {
  sessions_today: number;
  views_today: number;
  sessions_7d: number;
  sessions_30d: number;
  sessions_total: number;
  views_total: number;
  first_event_at: string | null;
};
type DailyRow = { day: string; views: number; sessions: number };
type RouteRow = {
  route: string;
  views: number;
  sessions: number;
  duration_samples: number;
  avg_duration_ms: number | null;
};
type UsageRow = { event_name: string; events: number; users: number };
type ReferrerRow = { source: string; landings: number; sessions: number };
type UtmRow = {
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  landings: number;
  sessions: number;
};
/* 모바일29 — viewport_group_change(kind=initial, 세션 시작 그룹) 30일 집계 */
type ViewportRow = { viewport_group: string; sessions: number };
/* 웹30 — 30일 재방문(visitor_key 기준, 2일 이상 방문) */
type RetentionRow = { visitors: number; returning_visitors: number };
/* 웹18 — 주간 p75 (web_vitals_weekly 뷰, percentile_cont DB 계산) */
type VitalsWeeklyRow = { week_start: string; metric: string; samples: number; p75: number };

/** 이벤트명 → 한글 라벨 (등록부에 없는 값은 원문 그대로 — 지어내지 않는다) */
const EVENT_LABEL: Record<string, string> = {
  [FUNNEL_EVENT.INSPECTION_NOTE_CREATE]: "임장노트 작성",
  [FUNNEL_EVENT.WATCHLIST_ADD]: "관심 단지 추가",
  [FUNNEL_EVENT.WATCHLIST_REMOVE]: "관심 단지 해제",
  [FUNNEL_EVENT.COMMUNITY_POST_CREATE]: "동네이야기 글 작성",
  [FUNNEL_EVENT.COMMUNITY_COMMENT_ADD]: "댓글 작성",
  [FUNNEL_EVENT.CHAT_ROOM_OPEN]: "채팅방 입장",
  [FUNNEL_EVENT.CHAT_MESSAGE_SEND]: "채팅 메시지 전송",
  [FUNNEL_EVENT.AI_TOOL_RUN]: "AI 도구 실행",
  [FUNNEL_EVENT.AI_LLM_COMPLETE]: "AI(LLM) 정리 완료",
  [FUNNEL_EVENT.AI_RULE_FALLBACK]: "AI 규칙 폴백",
  [FUNNEL_EVENT.AI_FEEDBACK]: "AI 피드백",
  [FUNNEL_EVENT.MAP_FOCUS_OPEN]: "지도 단지 포커스",
  [FUNNEL_EVENT.HOME_AI_CTA_CLICK]: "홈 AI CTA 클릭",
  [FUNNEL_EVENT.HUB_TO_AI_ANALYSIS]: "단지→AI 분석 이동",
  [FUNNEL_EVENT.SHARE_LINK_COPY]: "공유 링크 복사",
  [FUNNEL_EVENT.EXPERT_CONSULT_SUBMIT]: "전문가 상담 신청",
  [FUNNEL_EVENT.CONTENT_REPORT_SUBMIT]: "콘텐츠 신고",
  [FUNNEL_EVENT.ONBOARDING_STEP_VIEW]: "온보딩 단계 조회",
  [FUNNEL_EVENT.ONBOARDING_STEP_COMPLETE]: "온보딩 단계 완료",
  [FUNNEL_EVENT.ONBOARDING_ALL_COMPLETE]: "온보딩 완주",
  [FUNNEL_EVENT.PWA_INSTALL_PROMPT]: "PWA 설치 프롬프트",
  [FUNNEL_EVENT.PUSH_SUBSCRIBE]: "푸시 구독",
  [FUNNEL_EVENT.AUTH_LOGIN_OK]: "로그인 성공",
  [FUNNEL_EVENT.AUTH_LOGIN_FAIL]: "로그인 실패",
  [FUNNEL_EVENT.REPORT_PURCHASE]: "리포트 구매",
  viewport_group_change: "뷰포트 그룹 변경(계측)",
  pwa_install_prompt_view: "PWA 프롬프트 노출",
  signup_step_1: "가입 1단계",
  onboarding_tour_skip: "온보딩 투어 건너뜀",
  onboarding_tour_complete: "온보딩 투어 완료",
};

function fmtDuration(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms) || ms <= 0) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}초`;
  return `${Math.floor(s / 60)}분 ${s % 60}초`;
}

function fmtDay(day: string): string {
  const m = day.match(/^\d{4}-(\d{2})-(\d{2})/);
  return m ? `${Number(m[1])}.${m[2]}` : day;
}

async function loadAll(): Promise<{
  summary: Summary | null;
  daily: DailyRow[];
  routes: RouteRow[];
  usage: UsageRow[];
  referrers: ReferrerRow[];
  utms: UtmRow[];
  viewports: ViewportRow[];
  retention: RetentionRow | null;
  vitals7d: VitalStat[];
  vitalsWeekly: VitalsWeeklyRow[];
  failed: string[];
}> {
  const sb = getServiceSupabase();
  const failed: string[] = [];
  if (!sb)
    return {
      summary: null,
      daily: [],
      routes: [],
      usage: [],
      referrers: [],
      utms: [],
      viewports: [],
      retention: null,
      vitals7d: [],
      vitalsWeekly: [],
      failed: ["전체(DB 미설정)"],
    };

  /* 최적화 29 — "조회 9개를 하나로 합칠까"를 재 보고 **합치지 않기로** 했다(확인).
     2026-08-04 실측 근거:
       · 9개 모두 집계 뷰이고, 바닥에 깔린 원본은 page_view_events(112 kB) 와
         platform_activity_events(3,616 kB) 둘뿐이다. 전부 30일 창으로 자르고,
         occurred_at DESC · (route, occurred_at DESC) · visitor_key 부분 인덱스가
         이미 걸려 있다(page_view_retention_30d 실측 0.4ms).
       · 9개는 이 Promise.all 안에서 동시에 나가므로 벽시계는 9개의 합이 아니라
         가장 느린 하나다.
       · 합치려면 뷰 9개를 감싸는 RPC 를 새로 만들어야 하는데, 그건 스키마
         드리프트 지점을 하나 늘리고(뷰가 바뀌면 RPC 도 같이) 실패의 입자를
         굵게 만든다 — 지금은 한 뷰가 죽어도 나머지 8개는 그려지고 `failed` 에만
         이름이 남는다. 관리자 한 사람이 보는 화면에서 그 거래는 손해다.
     다시 볼 조건: page_view_events 가 커져 30일 창이 수십만 행이 되거나,
     이 페이지가 관리자 외에 노출될 때. */
  const [summaryR, dailyR, routesR, usageR, refR, utmR, vpR, retR, vitals7d, vwR] =
    await Promise.all([
    sb.from("page_view_summary").select("*").maybeSingle(),
    sb.from("page_view_daily").select("*").order("day", { ascending: false }).limit(14),
    sb.from("page_view_route_30d").select("*").order("views", { ascending: false }).limit(15),
    sb.from("platform_event_usage_30d").select("*").order("events", { ascending: false }).limit(20),
    sb.from("page_view_referrer_30d").select("*").order("sessions", { ascending: false }).limit(15),
    sb.from("page_view_utm_30d").select("*").order("sessions", { ascending: false }).limit(15),
    sb.from("platform_viewport_group_30d").select("*").order("sessions", { ascending: false }),
    sb.from("page_view_retention_30d").select("*").maybeSingle(),
    /* 웹18 — loadVitalsLast7d 는 이월 44 때 만들어졌지만 소비처가 없던
       로더였다(화면 없는 로더 = 없는 기능). 여기서 처음 배선한다. */
    loadVitalsLast7d().catch((e: unknown) => {
      logger.error("[admin/traffic] 웹바이탈 7일 조회 실패:", e);
      return [] as VitalStat[];
    }),
    sb.from("web_vitals_weekly").select("*").order("week_start", { ascending: true }),
  ]);

  if (summaryR.error) {
    failed.push("접속자 요약");
    logger.error("[admin/traffic] summary 조회 실패:", summaryR.error.message);
  }
  if (dailyR.error) failed.push("일별 추이");
  if (routesR.error) failed.push("페이지별 집계");
  if (usageR.error) failed.push("기능 사용");
  if (refR.error) failed.push("유입 출처");
  if (utmR.error) failed.push("UTM 캠페인");
  if (vpR.error) failed.push("기기 비율");
  if (retR.error) failed.push("재방문");
  if (vwR.error) failed.push("웹바이탈 주간");

  return {
    summary: (summaryR.data as Summary | null) ?? null,
    daily: ((dailyR.data as DailyRow[] | null) ?? []).slice().reverse(),
    routes: (routesR.data as RouteRow[] | null) ?? [],
    usage: (usageR.data as UsageRow[] | null) ?? [],
    referrers: (refR.data as ReferrerRow[] | null) ?? [],
    utms: (utmR.data as UtmRow[] | null) ?? [],
    viewports: (vpR.data as ViewportRow[] | null) ?? [],
    retention: (retR.data as RetentionRow | null) ?? null,
    vitals7d,
    vitalsWeekly: (vwR.data as VitalsWeeklyRow[] | null) ?? [],
    failed,
  };
}

export default async function AdminTrafficPage() {
  const {
    summary,
    daily,
    routes,
    usage,
    referrers,
    utms,
    viewports,
    retention,
    vitals7d,
    vitalsWeekly,
    failed,
  } = await loadAll();
  /* #413 커버리지 수요 — 실패를 0건으로 위장하지 않는다 */
  let demands: RegionDemandRow[] = [];
  let demandsFailed = false;
  try {
    demands = await listTopRegionDemands(30, 15);
  } catch {
    demandsFailed = true;
  }
  const collectedSince = summary?.first_event_at
    ? new Date(summary.first_event_at).toLocaleDateString("ko-KR")
    : null;
  const maxViews = Math.max(1, ...daily.map((d) => d.views));

  /* [G006 2026-08-31] 주간 목표선·추세 — 숫자는 많은데 "좋아지고 있나"가 없었다.
     daily 14일에서 이번 주(최근 7일)·지난 주(그 전 7일)를 접어 비교한다.
     목표는 상수다: 실측 기준 주간 PV 152 에서 시작하는 현실적 계단(300).
     목표를 넘기 시작하면 이 상수를 올린다 — 조정 이력은 커밋으로 남는다. */
  const WEEKLY_PV_TARGET = 300;
  const thisWeekPv = daily.slice(-7).reduce((a, d) => a + d.views, 0);
  const prevWeekPv = daily.slice(-14, -7).reduce((a, d) => a + d.views, 0);
  const weekDeltaPct =
    prevWeekPv > 0 ? Math.round(((thisWeekPv - prevWeekPv) / prevWeekPv) * 100) : null;

  const kpis = summary
    ? [
        { label: "오늘 방문자", value: summary.sessions_today, sub: `페이지뷰 ${summary.views_today.toLocaleString("ko-KR")}` },
        { label: "최근 7일 방문자", value: summary.sessions_7d, sub: "순 세션 기준" },
        { label: "최근 30일 방문자", value: summary.sessions_30d, sub: "순 세션 기준" },
        { label: "누적 방문자", value: summary.sessions_total, sub: `수집 시작 ${collectedSince ?? "—"} 이후` },
      ]
    : [];

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[20px] font-extrabold text-ink">트래픽</h1>
        <p className="mt-1 text-[13px] leading-[1.6] text-text-2">
          접속자·체류는 <b className="text-ink">분석 동의 사용자 표본</b>이다(동의
          배너에서 &ldquo;필수만 허용&rdquo;을 누른 방문은 집계에 없음 — 전체
          방문의 하한선). 기능 사용은 서버 확정 기록이라 모집단이 더 넓다.
          {collectedSince && ` 페이지뷰 수집 시작: ${collectedSince}.`}
        </p>
      </div>

      {failed.length > 0 && (
        <p className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-[12px] font-bold text-danger">
          {failed.join(" · ")} 조회에 실패했어요 — 데이터가 없는 게 아니라 못 읽은
          것입니다. 새로고침해 주세요.
        </p>
      )}

      {/* [G006] 주간 목표 대비 — 이 페이지의 첫 문장은 "이번 주 어땠나"여야 한다 */}
      {daily.length > 0 && (
        <section className="card rounded-2xl px-5 py-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <div className="text-[11px] text-text-3">이번 주 페이지뷰 (최근 7일 · 목표 {WEEKLY_PV_TARGET.toLocaleString("ko-KR")})</div>
              <div className="t-num mt-1 text-[24px] font-extrabold text-ink">
                {thisWeekPv.toLocaleString("ko-KR")}
                <span className="ml-2 text-[13px] font-bold text-text-3">
                  / {WEEKLY_PV_TARGET.toLocaleString("ko-KR")}
                </span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-[11px] text-text-3">지난 주 대비</div>
              <div className={`t-num mt-1 text-[19px] font-extrabold ${weekDeltaPct === null ? "text-text-3" : weekDeltaPct >= 0 ? "text-success" : "text-danger"}`}>
                {weekDeltaPct === null ? "—" : `${weekDeltaPct >= 0 ? "▲" : "▼"} ${Math.abs(weekDeltaPct)}%`}
              </div>
              <div className="mt-0.5 text-[11px] text-text-3">지난 주 {prevWeekPv.toLocaleString("ko-KR")}뷰</div>
            </div>
          </div>
          {/* 목표 진행 막대 — 초과해도 100%로 클램프 */}
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-bg">
            <div
              className={`h-full rounded-full ${thisWeekPv >= WEEKLY_PV_TARGET ? "bg-success" : "bg-primary"}`}
              style={{ width: `${Math.min(100, Math.round((thisWeekPv / WEEKLY_PV_TARGET) * 100))}%` }}
            />
          </div>
        </section>
      )}

      {/* 접속자 KPI */}
      {summary && (
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {kpis.map((k) => (
            <div key={k.label} className="card rounded-2xl px-5 py-4">
              <div className="text-[11px] text-text-3">{k.label}</div>
              <div className="t-num mt-1 text-[24px] font-extrabold text-ink">
                {k.value.toLocaleString("ko-KR")}
              </div>
              <div className="mt-0.5 text-[11px] text-text-3">{k.sub}</div>
            </div>
          ))}
        </section>
      )}

      {/* 일별 추이 */}
      <section className="card rounded-2xl p-5">
        <h2 className="text-[15px] font-extrabold text-ink">
          일별 추이{" "}
          <span className="text-[11px] font-medium text-text-3">
            최근 14일 · KST 기준 · 막대=페이지뷰, 숫자=방문자
          </span>
        </h2>
        {daily.length === 0 ? (
          <p className="mt-3 text-[13px] text-text-3">
            아직 수집된 페이지뷰가 없어요. 분석 동의 방문이 생기면 이 자리에
            일별 추이가 쌓입니다.
          </p>
        ) : (
          <div className="mt-4 flex items-end gap-1.5 overflow-x-auto pb-1">
            {daily.map((d) => (
              <div key={d.day} className="flex min-w-[44px] flex-1 flex-col items-center gap-1">
                <span className="text-[10px] font-bold text-text-2">
                  {d.sessions.toLocaleString("ko-KR")}
                </span>
                <div
                  className="w-full rounded-t-md bg-primary/70"
                  style={{ height: `${Math.max(4, Math.round((d.views / maxViews) * 96))}px` }}
                  title={`${d.day} · 페이지뷰 ${d.views}`}
                />
                <span className="text-[10px] text-text-3">{fmtDay(d.day)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 페이지별 조회·체류 */}
      <section className="card rounded-2xl p-5">
        <h2 className="text-[15px] font-extrabold text-ink">
          페이지별 조회·체류{" "}
          <span className="text-[11px] font-medium text-text-3">최근 30일 · 상위 15개 라우트</span>
        </h2>
        {routes.length === 0 ? (
          <p className="mt-3 text-[13px] text-text-3">아직 집계할 페이지뷰가 없어요.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-[12px]">
              <thead>
                <tr className="border-b border-line text-[11px] text-text-3">
                  <th className="py-2 pr-3 font-semibold">라우트</th>
                  <th className="py-2 pr-3 text-right font-semibold">조회</th>
                  <th className="py-2 pr-3 text-right font-semibold">방문자</th>
                  <th className="py-2 pr-3 text-right font-semibold">평균 체류</th>
                  <th className="py-2 text-right font-semibold">체류 표본</th>
                </tr>
              </thead>
              <tbody>
                {routes.map((r) => (
                  <tr key={r.route} className="border-b border-line last:border-0">
                    <td className="max-w-[220px] truncate py-2 pr-3 font-mono text-[11px] font-bold text-ink">
                      {r.route}
                    </td>
                    <td className="t-num py-2 pr-3 text-right text-text-1">
                      {r.views.toLocaleString("ko-KR")}
                    </td>
                    <td className="t-num py-2 pr-3 text-right text-text-2">
                      {r.sessions.toLocaleString("ko-KR")}
                    </td>
                    <td className="py-2 pr-3 text-right font-bold text-ink">
                      {r.duration_samples > 0 ? fmtDuration(r.avg_duration_ms) : "—"}
                    </td>
                    <td className="t-num py-2 text-right text-text-3">
                      {r.duration_samples.toLocaleString("ko-KR")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-[11px] text-text-3">
              평균 체류는 이탈 비콘이 도착한 조회(표본)만으로 계산 — 표본 0이면
              평균을 만들지 않는다. 탭 전환·닫기 시점까지의 노출 시간 기준, 1시간 상한.
            </p>
          </div>
        )}
      </section>

      {/* 모바일29 — 기기 비율. 세션 시작 시점 뷰포트 그룹(initial)만 센다.
          페이지뷰(동의 표본)와 모집단이 달라 한 표에 섞지 않고 따로 둔다. */}
      {viewports.length > 0 && (
        <section className="card rounded-2xl p-5">
          <h2 className="text-[15px] font-extrabold text-ink">
            기기 비율{" "}
            <span className="text-[11px] font-medium text-text-3">
              최근 30일 · 세션 시작 시점 화면 폭 기준(viewport_group_change 계측)
            </span>
          </h2>
          {(() => {
            const total = viewports.reduce((s, v) => s + v.sessions, 0);
            const LABEL: Record<string, string> = {
              desktop: "데스크탑",
              tablet: "태블릿",
              mobile: "모바일",
            };
            return (
              <div className="mt-3 flex flex-col gap-2">
                {viewports.map((v) => {
                  const pct = total > 0 ? (v.sessions / total) * 100 : 0;
                  return (
                    <div key={v.viewport_group} className="flex items-center gap-3 text-[13px]">
                      <span className="w-[64px] shrink-0 font-bold text-ink">
                        {LABEL[v.viewport_group] ?? v.viewport_group}
                      </span>
                      <span className="h-[8px] flex-1 overflow-hidden rounded-full bg-[#eef2f8]">
                        <span
                          className="block h-full rounded-full bg-primary/60"
                          style={{ width: `${Math.max(1, Math.round(pct))}%` }}
                        />
                      </span>
                      <span className="w-[110px] shrink-0 text-right text-[12px] text-text-2">
                        {pct.toFixed(1)}% · {v.sessions.toLocaleString("ko-KR")}세션
                      </span>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </section>
      )}

      {/* 웹30 — 재방문. visitor_key(2026-08-04 도입) 표본만 — 소급 불가. */}
      {retention && retention.visitors > 0 && (
        <section className="card rounded-2xl p-5">
          <h2 className="text-[15px] font-extrabold text-ink">
            재방문{" "}
            <span className="text-[11px] font-medium text-text-3">
              최근 30일 · 서로 다른 2일 이상 방문한 방문자 비율
            </span>
          </h2>
          <p className="mt-2 text-[24px] font-extrabold text-ink">
            {((retention.returning_visitors / retention.visitors) * 100).toFixed(1)}%
            <span className="ml-2 text-[13px] font-semibold text-text-2">
              {retention.returning_visitors.toLocaleString("ko-KR")} /{" "}
              {retention.visitors.toLocaleString("ko-KR")}명
            </span>
          </p>
          <p className="mt-1.5 text-[11px] leading-[1.6] text-text-3">
            같은 브라우저 기준(방문자 키 — 기기·브라우저를 바꾸면 새 방문자로
            셉니다). 키는 2026-08-04 도입 — 그 이전 방문은 소급되지 않고, 분석
            동의 표본만 집계됩니다.
          </p>
        </section>
      )}

      {/* 웹18 — 성능(웹바이탈). 7일 p75 스냅샷 + LCP·CLS 주간 추이. */}
      {vitals7d.some((v) => v.samples > 0) && (
        <section className="card rounded-2xl p-5">
          <h2 className="text-[15px] font-extrabold text-ink">
            성능 (웹바이탈){" "}
            <span className="text-[11px] font-medium text-text-3">
              실사용자 측정(RUM) · p75 · 최근 7일
            </span>
          </h2>
          <div className="mt-3 flex flex-wrap gap-2.5">
            {vitals7d
              .filter((v) => v.samples > 0)
              .map((v) => {
                const cls =
                  v.p75 == null
                    ? "text-text-3"
                    : classifyVital(v.metric, v.p75) === "good"
                      ? "text-success"
                      : classifyVital(v.metric, v.p75) === "ni"
                        ? "text-warning"
                        : "text-danger";
                return (
                  <div
                    key={v.metric}
                    className="rounded-[12px] border border-line bg-bg px-3.5 py-2.5"
                  >
                    <div className="text-[10px] font-bold text-text-3">{v.metric}</div>
                    <div className={`text-[16px] font-extrabold ${cls}`}>
                      {formatVital(v.metric, v.p75)}
                    </div>
                    <div className="text-[10px] text-text-3">{v.samples}표본</div>
                  </div>
                );
              })}
          </div>
          {/* LCP·CLS 주간 추이 — 표본 20 미만인 주는 p75 신뢰도가 낮아 옅게 */}
          {(["LCP", "CLS"] as const).map((metric) => {
            const rows = vitalsWeekly.filter((r) => r.metric === metric && r.samples > 0);
            if (rows.length < 2) return null;
            const max = Math.max(...rows.map((r) => r.p75));
            return (
              <div key={metric} className="mt-4">
                <div className="mb-1.5 text-[12px] font-extrabold text-text-2">
                  {metric} p75 주간 추이{" "}
                  <span className="font-medium text-text-3">최근 12주</span>
                </div>
                <div className="flex items-end gap-1.5">
                  {rows.map((r) => {
                    const c = classifyVital(metric, r.p75);
                    const color =
                      c === "good" ? "bg-success" : c === "ni" ? "bg-warning" : "bg-danger";
                    const thin = r.samples < 20;
                    return (
                      <div key={r.week_start} className="flex flex-1 flex-col items-center gap-1">
                        <span className="text-[9px] tabular-nums text-text-3">
                          {formatVital(metric, r.p75)}
                        </span>
                        <div className="flex h-[52px] w-full items-end">
                          <div
                            className={`w-full rounded-t ${color} ${thin ? "opacity-40" : "opacity-80"}`}
                            style={{
                              height: `${Math.max(6, Math.round((r.p75 / max) * 100))}%`,
                            }}
                            title={`${r.week_start} 주 · ${formatVital(metric, r.p75)} · ${r.samples}표본`}
                          />
                        </div>
                        <span className="text-[9px] text-text-3">
                          {r.week_start.slice(5).replace("-", ".")}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          <p className="mt-2 text-[11px] leading-[1.6] text-text-3">
            색: 웹 표준 임계값 기준(좋음 · 개선 필요 · 나쁨 — LCP 2.5s/4s ·
            CLS 0.1/0.25). 옅은 막대는 표본 20개 미만이라 p75 신뢰도가 낮은
            주입니다. 수집이 없던 주는 칸 자체가 없습니다.
          </p>
        </section>
      )}

      {/* 유입 경로 — 어디서·어떤 링크로 왔는가 (랜딩 기준) */}
      <section className="card rounded-2xl p-5">
        <h2 className="text-[15px] font-extrabold text-ink">
          유입 출처{" "}
          <span className="text-[11px] font-medium text-text-3">
            최근 30일 · 세션 첫 방문(랜딩) 기준 · 리퍼러는 호스트만 저장(검색어 등
            전체 URL 미저장)
          </span>
        </h2>
        {referrers.length === 0 ? (
          <p className="mt-3 text-[13px] text-text-3">
            아직 유입 기록이 없어요. 유입 수집은 2026-08-03 저녁부터 시작됐어요 —
            이전 방문의 출처는 소급되지 않습니다.
          </p>
        ) : (
          <div className="mt-3 flex flex-col gap-1.5">
            {(() => {
              const max = Math.max(1, ...referrers.map((r) => r.sessions));
              return referrers.map((r) => (
                <div key={r.source} className="flex items-center gap-3 text-[12px]">
                  <span className="w-[180px] shrink-0 truncate font-bold text-ink">
                    {r.source}
                  </span>
                  <div className="h-[10px] flex-1 overflow-hidden rounded-md bg-[#f2f4f8]">
                    <div
                      className="h-full rounded-md bg-primary/70"
                      style={{ width: `${Math.max(3, Math.round((r.sessions / max) * 100))}%` }}
                    />
                  </div>
                  <span className="t-num w-[90px] shrink-0 text-right text-text-2">
                    {r.sessions.toLocaleString("ko-KR")} 세션
                  </span>
                </div>
              ));
            })()}
          </div>
        )}
        <p className="mt-3 text-[11px] text-text-3">
          &ldquo;(직접/앱)&rdquo;은 주소창 입력·북마크·앱, 그리고 리퍼러를 보내지
          않는 브라우저를 합친 값이다 — 이 셋은 기술적으로 구분할 수 없다.
        </p>

        {/* UTM 캠페인 — 우리가 발행한 링크 파라미터 기준 */}
        <h3 className="mt-5 text-[13px] font-extrabold text-ink">
          캠페인 링크(UTM){" "}
          <span className="text-[11px] font-medium text-text-3">
            utm_source·medium·campaign 이 붙은 랜딩만
          </span>
        </h3>
        {utms.length === 0 ? (
          <p className="mt-2 text-[12px] text-text-3">
            UTM 파라미터가 붙은 유입이 아직 없어요. 홍보 링크에{" "}
            <code className="rounded bg-[#f2f4f8] px-1 py-0.5 text-[11px]">
              ?utm_source=instagram&amp;utm_campaign=open
            </code>{" "}
            형식을 붙이면 여기서 링크별 성과가 집계됩니다.
          </p>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-[12px]">
              <thead>
                <tr className="border-b border-line text-[11px] text-text-3">
                  <th className="py-2 pr-3 font-semibold">source</th>
                  <th className="py-2 pr-3 font-semibold">medium</th>
                  <th className="py-2 pr-3 font-semibold">campaign</th>
                  <th className="py-2 text-right font-semibold">세션</th>
                </tr>
              </thead>
              <tbody>
                {utms.map((u, i) => (
                  <tr key={i} className="border-b border-line last:border-0">
                    <td className="py-2 pr-3 font-bold text-ink">{u.utm_source}</td>
                    <td className="py-2 pr-3 text-text-2">{u.utm_medium || "—"}</td>
                    <td className="py-2 pr-3 text-text-2">{u.utm_campaign || "—"}</td>
                    <td className="t-num py-2 text-right text-text-1">
                      {u.sessions.toLocaleString("ko-KR")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 기능 사용 */}
      <section className="card rounded-2xl p-5">
        <h2 className="text-[15px] font-extrabold text-ink">
          기능 사용{" "}
          <span className="text-[11px] font-medium text-text-3">
            최근 30일 · 서버 확정 이벤트 · 상위 20개
          </span>
        </h2>
        {usage.length === 0 ? (
          <p className="mt-3 text-[13px] text-text-3">최근 30일 기록된 이벤트가 없어요.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[440px] text-left text-[12px]">
              <thead>
                <tr className="border-b border-line text-[11px] text-text-3">
                  <th className="py-2 pr-3 font-semibold">기능</th>
                  <th className="py-2 pr-3 text-right font-semibold">횟수</th>
                  <th className="py-2 text-right font-semibold">사용자</th>
                </tr>
              </thead>
              <tbody>
                {usage.map((u) => (
                  <tr key={u.event_name} className="border-b border-line last:border-0">
                    <td className="py-2 pr-3">
                      <span className="font-bold text-ink">
                        {EVENT_LABEL[u.event_name] ?? u.event_name}
                      </span>
                      {EVENT_LABEL[u.event_name] && (
                        <span className="ml-1.5 font-mono text-[10px] text-text-3">
                          {u.event_name}
                        </span>
                      )}
                    </td>
                    <td className="t-num py-2 pr-3 text-right text-text-1">
                      {u.events.toLocaleString("ko-KR")}
                    </td>
                    <td className="t-num py-2 text-right text-text-2">
                      {u.users > 0 ? u.users.toLocaleString("ko-KR") : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-[11px] text-text-3">
              사용자 수는 로그인 상태로 기록된 이벤트만 셀 수 있다 — &ldquo;—&rdquo;는
              비로그인 이벤트라는 뜻이지 0명이라는 뜻이 아니다.
            </p>
          </div>
        )}
      </section>

      {/* #413 — 커버리지 수요: 검색 무결과에서 수집한 "열리면 알려주세요".
          지역 확장 우선순위의 근거 데이터다. 조회 실패와 0건을 가른다. */}
      <section className="card rounded-2xl p-5">
        <h2 className="text-[15px] font-extrabold text-ink">
          커버리지 수요 (최근 30일)
        </h2>
        <p className="mt-0.5 text-[11px] text-text-3">
          검색 무결과 화면의 &ldquo;열리면 알려주세요&rdquo; 요청 — 요청 많은
          검색어부터 데이터 확장 우선순위에 반영
        </p>
        {demandsFailed ? (
          <p className="mt-3 text-[12px] text-text-3">
            수요 목록을 지금 불러오지 못했어요(0건이 아니라 조회 실패).
          </p>
        ) : demands.length === 0 ? (
          <p className="mt-3 text-[12px] text-text-3">
            아직 수집된 수요가 없어요 — 검색 무결과 화면에서 쌓입니다.
          </p>
        ) : (
          <table className="mt-3 w-full text-left text-[12px]">
            <thead>
              <tr className="border-b border-line text-[11px] text-text-3">
                <th className="py-1.5 font-bold">검색어</th>
                <th className="py-1.5 text-right font-bold">요청</th>
                <th className="py-1.5 text-right font-bold">알림 이메일</th>
                <th className="py-1.5 text-right font-bold">최근</th>
              </tr>
            </thead>
            <tbody>
              {demands.map((d) => (
                <tr key={d.query} className="border-b border-[#f0f3f8]">
                  <td className="max-w-[220px] truncate py-2 font-bold text-ink">
                    {d.query}
                  </td>
                  <td className="py-2 text-right tabular-nums text-text-1">
                    {d.totalCount.toLocaleString("ko-KR")}
                  </td>
                  <td className="py-2 text-right tabular-nums text-text-2">
                    {d.emailCount > 0 ? d.emailCount.toLocaleString("ko-KR") : "—"}
                  </td>
                  <td className="py-2 text-right text-[11px] text-text-3">
                    {d.lastAt ? new Date(d.lastAt).toLocaleDateString("ko-KR") : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
