import type { Metadata } from "next";
import { getServiceSupabase } from "@/lib/supabase/service";
import { FUNNEL_EVENT } from "@/lib/platform-funnel-events";
import { logger } from "@/lib/log";

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
  failed: string[];
}> {
  const sb = getServiceSupabase();
  const failed: string[] = [];
  if (!sb) return { summary: null, daily: [], routes: [], usage: [], failed: ["전체(DB 미설정)"] };

  const [summaryR, dailyR, routesR, usageR] = await Promise.all([
    sb.from("page_view_summary").select("*").maybeSingle(),
    sb.from("page_view_daily").select("*").order("day", { ascending: false }).limit(14),
    sb.from("page_view_route_30d").select("*").order("views", { ascending: false }).limit(15),
    sb.from("platform_event_usage_30d").select("*").order("events", { ascending: false }).limit(20),
  ]);

  if (summaryR.error) {
    failed.push("접속자 요약");
    logger.error("[admin/traffic] summary 조회 실패:", summaryR.error.message);
  }
  if (dailyR.error) failed.push("일별 추이");
  if (routesR.error) failed.push("페이지별 집계");
  if (usageR.error) failed.push("기능 사용");

  return {
    summary: (summaryR.data as Summary | null) ?? null,
    daily: ((dailyR.data as DailyRow[] | null) ?? []).slice().reverse(),
    routes: (routesR.data as RouteRow[] | null) ?? [],
    usage: (usageR.data as UsageRow[] | null) ?? [],
    failed,
  };
}

export default async function AdminTrafficPage() {
  const { summary, daily, routes, usage, failed } = await loadAll();
  const collectedSince = summary?.first_event_at
    ? new Date(summary.first_event_at).toLocaleDateString("ko-KR")
    : null;
  const maxViews = Math.max(1, ...daily.map((d) => d.views));

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
    </div>
  );
}
