import { getServiceSupabase } from "@/lib/supabase/service";
import { FUNNEL_EVENT } from "@/lib/platform-funnel-events";
import { loadAdminKpi, type AdminKpi } from "@/lib/admin/stats";

export type LayerMetric = {
  key: string;
  label: string;
  value: string;
  delta?: string;
  href?: string;
};

export type OperatingLayer = {
  id: "growth" | "retention" | "commerce" | "operations";
  title: string;
  subtitle: string;
  metrics: LayerMetric[];
};

export type FunnelStep = {
  label: string;
  count: number;
  pctOfSignup: number | null;
};

export type OperatingDashboardData = {
  hero: LayerMetric[];
  layers: OperatingLayer[];
  funnel: FunnelStep[];
  moderationSummary: {
    openReports: number;
    pendingExperts: number;
    pendingMeetings: number;
    approvalRatePct: number | null;
  };
};

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return startOfDay(d);
}

function formatKRW(n: number): string {
  if (n >= 1_0000) return `₩${(n / 1_0000).toFixed(1)}만`;
  return `₩${n.toLocaleString("ko-KR")}`;
}

async function countEvents(
  sb: NonNullable<ReturnType<typeof getServiceSupabase>>,
  names: string[],
  sinceIso: string,
): Promise<number> {
  const { count, error } = await sb
    .from("platform_activity_events")
    .select("*", { count: "exact", head: true })
    .in("event_name", names)
    .gte("created_at", sinceIso);
  if (error || typeof count !== "number") return 0;
  return count;
}

async function countDistinctActiveUsers(
  sb: NonNullable<ReturnType<typeof getServiceSupabase>>,
  sinceIso: string,
): Promise<number> {
  const { data, error } = await sb
    .from("platform_activity_events")
    .select("user_email")
    .gte("created_at", sinceIso)
    .not("user_email", "is", null)
    .limit(8000);
  if (error || !Array.isArray(data)) return 0;
  const uniq = new Set<string>();
  for (const row of data as Array<{ user_email?: string | null }>) {
    const e = row.user_email?.trim().toLowerCase();
    if (e) uniq.add(e);
  }
  return uniq.size;
}

async function countTableSince(
  sb: NonNullable<ReturnType<typeof getServiceSupabase>>,
  table: string,
  sinceIso: string,
): Promise<number | null> {
  const { count, error } = await sb
    .from(table)
    .select("*", { count: "exact", head: true })
    .gte("created_at", sinceIso);
  if (error) return null;
  return typeof count === "number" ? count : null;
}

/**
 * 성장·리텐션·거래·운영 4레이어 + 퍼널·모더레이션 요약.
 * platform_activity_events·payments·content_reports 기반.
 */
export async function loadOperatingDashboard(
  kpi: AdminKpi,
): Promise<OperatingDashboardData> {
  const sb = getServiceSupabase();
  const today = startOfDay(new Date()).toISOString();
  const d1 = daysAgo(1).toISOString();
  const d7 = daysAgo(7).toISOString();
  const d30 = daysAgo(30).toISOString();

  let paymentsTodayKrw = 0;
  let paymentsTodayCount = 0;
  let refunds30d = 0;
  let consultSubmit30d = 0;
  let reportPurchase30d = 0;
  let firstSave7d = 0;
  let firstPost7d = 0;
  let firstInspection7d = 0;
  let firstAi7d = 0;
  let activeD1 = 0;
  let activeD7 = 0;
  let activeD30 = 0;
  let aiRepeat7d = 0;
  let reportsReviewed30d = 0;
  let reportsClosed30d = 0;

  if (sb) {
    const [
      paidTodayRes,
      refundsRes,
      consultEv,
      reportEv,
      saveEv,
      postEv,
      inspEv,
      aiEv,
      a1,
      a7,
      a30,
      aiRuns7Prior,
      reviewedRes,
      closedRes,
    ] = await Promise.all([
      sb
        .from("payments")
        .select("amount")
        .eq("status", "paid")
        .gte("paid_at", today)
        .not("paid_at", "is", null)
        .limit(2000),
      sb
        .from("payments")
        .select("*", { count: "exact", head: true })
        .eq("status", "refunded")
        .gte("cancelled_at", d30),
      countEvents(sb, [FUNNEL_EVENT.EXPERT_CONSULT_SUBMIT], d30),
      countEvents(sb, [FUNNEL_EVENT.REPORT_PURCHASE], d30),
      countEvents(sb, [FUNNEL_EVENT.WATCHLIST_ADD], d7),
      countEvents(sb, [FUNNEL_EVENT.COMMUNITY_POST_CREATE], d7),
      countEvents(
        sb,
        [FUNNEL_EVENT.INSPECTION_NOTE_CREATE, FUNNEL_EVENT.FIELD_SESSION_START],
        d7,
      ),
      countEvents(sb, [FUNNEL_EVENT.AI_TOOL_RUN], d7),
      countDistinctActiveUsers(sb, d1),
      countDistinctActiveUsers(sb, d7),
      countDistinctActiveUsers(sb, d30),
      countEvents(sb, [FUNNEL_EVENT.AI_TOOL_RUN], d7),
      sb
        .from("content_reports")
        .select("*", { count: "exact", head: true })
        .in("status", ["reviewed", "sent"])
        .gte("created_at", d30),
      sb
        .from("content_reports")
        .select("*", { count: "exact", head: true })
        .gte("created_at", d30),
    ]);

    if (Array.isArray(paidTodayRes.data)) {
      paymentsTodayCount = paidTodayRes.data.length;
      paymentsTodayKrw = paidTodayRes.data.reduce(
        (s, r) => s + Number((r as { amount?: number }).amount ?? 0),
        0,
      );
    }
    if (typeof refundsRes.count === "number") refunds30d = refundsRes.count;
    consultSubmit30d = consultEv;
    reportPurchase30d = reportEv;
    firstSave7d = saveEv;
    firstPost7d = postEv;
    firstInspection7d = inspEv;
    firstAi7d = aiEv;
    activeD1 = a1;
    activeD7 = a7;
    activeD30 = a30;
    aiRepeat7d = aiRuns7Prior;
    if (typeof reviewedRes.count === "number") reportsReviewed30d = reviewedRes.count;
    if (typeof closedRes.count === "number") reportsClosed30d = closedRes.count;

    if (firstInspection7d === 0) {
      const n = await countTableSince(sb, "inspection_notes", d7);
      if (n != null) firstInspection7d = n;
    }
    if (firstSave7d === 0 && kpi.totalBookmarks > 0) {
      const n = await countTableSince(sb, "bookmarks", d7);
      if (n != null) firstSave7d = n;
    }
  }

  /* 퍼널: 활성방문 → 노트 → AI(LLM/규칙 분리) → 지도 핸드오프 → 결제
     분모는 가입(30일) — 방문 단계는 활성 사용자(7일)로 선행 표시 */
  let aiLlm7d = 0;
  let aiRule7d = 0;
  let mapFocus7d = 0;
  if (sb) {
    const [llmEv, ruleEv, mapEv] = await Promise.all([
      countEvents(sb, [FUNNEL_EVENT.AI_LLM_COMPLETE], d7),
      countEvents(sb, [FUNNEL_EVENT.AI_RULE_FALLBACK], d7),
      countEvents(sb, [FUNNEL_EVENT.MAP_FOCUS_OPEN], d7),
    ]);
    aiLlm7d = llmEv;
    aiRule7d = ruleEv;
    mapFocus7d = mapEv;
  }

  const signup30d = Math.max(1, kpi.newUsers30d);
  const funnel: FunnelStep[] = [
    {
      label: "활성 방문(7일)",
      count: activeD7,
      pctOfSignup: Math.round((activeD7 / signup30d) * 1000) / 10,
    },
    {
      label: "임장노트(7일)",
      count: firstInspection7d,
      pctOfSignup: Math.round((firstInspection7d / signup30d) * 1000) / 10,
    },
    {
      label: "AI·LLM(7일)",
      count: aiLlm7d,
      pctOfSignup: Math.round((aiLlm7d / signup30d) * 1000) / 10,
    },
    {
      label: "AI·규칙(7일)",
      count: aiRule7d,
      pctOfSignup: Math.round((aiRule7d / signup30d) * 1000) / 10,
    },
    {
      label: "지도 핸드오프(7일)",
      count: mapFocus7d,
      pctOfSignup: Math.round((mapFocus7d / signup30d) * 1000) / 10,
    },
    {
      label: "결제(30일)",
      count: kpi.paymentsCompleted30d,
      pctOfSignup: Math.round((kpi.paymentsCompleted30d / signup30d) * 1000) / 10,
    },
  ];

  const approvalRatePct =
    reportsClosed30d > 0
      ? Math.round((reportsReviewed30d / reportsClosed30d) * 1000) / 10
      : null;

  const retentionPct7 =
    kpi.totalUsers > 0
      ? Math.round((activeD7 / kpi.totalUsers) * 1000) / 10
      : 0;

  /* ── 2026-07-26: 여기 href 를 실존하는 관리자 화면으로 맞춤 ─────────────────
   * 적혀 있던 /admin/users·/admin/analytics·/admin/reports·/admin/finance·
   * /admin/acquisition·/admin/posts·/admin/expert-ops·/admin/experts·
   * /admin/meetings 는 app/admin 아래에 하나도 없다. 즉 /admin/ops 대시보드에서
   * 지표 카드를 누르면 전부 404 였다. 실제로 있는 화면은 AdminNav 의 10개다:
   *   /admin(대시보드) /revenue /moderation /quality /experiments /ops
   *   /market /banners /data /seo  (+ 네비에 없는 /admin/listings)
   * 그래서 지표별로 "그 숫자를 실제로 볼 수 있는 화면"에 연결한다.
   *   가입·콘텐츠 집계 → /admin (가입 추이·최근 가입 회원·콘텐츠 집계가 여기)
   *   신고             → /admin/moderation (신고 큐)
   *   결제·구독·리포트 판매 → /admin/revenue (구독 플랜 분해)
   *   전문가 인증 심사 → /admin/quality (VerificationQueue)
   *   전문가 의뢰      → /admin/market (실 의뢰 집계)
   * "모임 승인 대기"만 href 를 뺐다 — 모임 승인 화면이 아직 없다.
   *   없는 화면을 그럴듯한 링크로 가리는 것보다 링크가 없는 게 사실에 맞다.
   * ──────────────────────────────────────────────────────────────────────── */
  const hero: LayerMetric[] = [
    {
      key: "signup_today",
      label: "오늘 가입",
      value: kpi.newUsersToday.toLocaleString("ko-KR"),
      delta: `7일 ${kpi.newUsers7d.toLocaleString("ko-KR")}명`,
      href: "/admin",
    },
    {
      key: "first_inspection",
      label: "첫 임장(7일)",
      value: firstInspection7d.toLocaleString("ko-KR"),
      delta: `노트 총 ${kpi.totalInspections.toLocaleString("ko-KR")}`,
      href: "/admin",
    },
    {
      key: "reports_open",
      label: "신고 대기",
      value: kpi.openReports.toLocaleString("ko-KR"),
      delta: `전체 ${kpi.totalReports.toLocaleString("ko-KR")}건`,
      href: "/admin/moderation",
    },
    {
      key: "payments_today",
      label: "오늘 결제",
      value:
        paymentsTodayCount > 0
          ? formatKRW(paymentsTodayKrw)
          : formatKRW(kpi.paymentsRevenue30dKrw),
      delta:
        paymentsTodayCount > 0
          ? `${paymentsTodayCount}건`
          : `30일 ${kpi.paymentsCompleted30d}건`,
      href: "/admin/revenue",
    },
  ];

  const layers: OperatingLayer[] = [
    {
      id: "growth",
      title: "성장",
      subtitle: "가입 → 첫 가치 행동",
      metrics: [
        {
          key: "signup_7d",
          label: "7일 가입",
          value: kpi.newUsers7d.toLocaleString("ko-KR"),
          href: "/admin",
        },
        {
          key: "first_save",
          label: "첫 저장(7일)",
          value: firstSave7d.toLocaleString("ko-KR"),
        },
        {
          key: "first_insp",
          label: "첫 임장(7일)",
          value: firstInspection7d.toLocaleString("ko-KR"),
        },
        {
          key: "first_ai",
          label: "첫 AI(7일)",
          value: (firstAi7d || kpi.aiAnalysisRuns7d || 0).toLocaleString("ko-KR"),
        },
        {
          key: "first_post",
          label: "첫 글쓰기(7일)",
          value: firstPost7d.toLocaleString("ko-KR"),
          href: "/admin",
        },
      ],
    },
    {
      id: "retention",
      title: "리텐션",
      subtitle: "재방문·재실행",
      metrics: [
        {
          key: "d1",
          label: "1일 활성(이벤트)",
          value: activeD1.toLocaleString("ko-KR"),
        },
        {
          key: "d7",
          label: "7일 활성",
          value: activeD7.toLocaleString("ko-KR"),
          delta: `전체 대비 ${retentionPct7}%`,
        },
        {
          key: "d30",
          label: "30일 활성",
          value: activeD30.toLocaleString("ko-KR"),
        },
        {
          key: "ai_repeat",
          label: "AI 재실행(7일)",
          value: aiRepeat7d.toLocaleString("ko-KR"),
        },
        {
          key: "posts_week",
          label: "주간 게시",
          value: kpi.postsThisWeek.toLocaleString("ko-KR"),
        },
      ],
    },
    {
      id: "commerce",
      title: "거래",
      subtitle: "멤버십·전문가·리포트",
      metrics: [
        {
          key: "pay_30d",
          label: "결제(30일)",
          value: `${kpi.paymentsCompleted30d.toLocaleString("ko-KR")}건`,
          delta: formatKRW(kpi.paymentsRevenue30dKrw),
          href: "/admin/revenue",
        },
        {
          key: "refund_30d",
          label: "환불(30일)",
          value: refunds30d.toLocaleString("ko-KR"),
        },
        {
          key: "consult",
          label: "전문가 상담 요청",
          value: consultSubmit30d.toLocaleString("ko-KR"),
          href: "/admin/market",
        },
        {
          key: "report_sale",
          label: "리포트 구매",
          value: reportPurchase30d.toLocaleString("ko-KR"),
          href: "/admin/revenue",
        },
        {
          key: "paid_subs",
          label: "PRO+ 구독",
          value: (
            (kpi.planCounts.pro ?? 0) + (kpi.planCounts.expert ?? 0)
          ).toLocaleString("ko-KR"),
          href: "/admin/revenue",
        },
      ],
    },
    {
      id: "operations",
      title: "운영",
      subtitle: "커뮤니티·전문가·모임 실사용",
      metrics: [
        {
          key: "reports",
          label: "신고 대기",
          value: kpi.openReports.toLocaleString("ko-KR"),
          href: "/admin/moderation",
        },
        {
          key: "experts",
          label: "전문가 인증 대기",
          value: kpi.pendingExpertRequests.toLocaleString("ko-KR"),
          href: "/admin/quality",
        },
        {
          key: "meetings",
          label: "모임 승인 대기",
          value: kpi.pendingMeetingRequests.toLocaleString("ko-KR"),
        },
        {
          key: "approval",
          label: "신고 처리율(30일)",
          value: approvalRatePct != null ? `${approvalRatePct}%` : "—",
        },
        {
          key: "community",
          label: "커뮤니티 글",
          value: kpi.totalPosts.toLocaleString("ko-KR"),
          delta: `+${kpi.postsToday} 오늘`,
          href: "/admin",
        },
      ],
    },
  ];

  return {
    hero,
    layers,
    funnel,
    moderationSummary: {
      openReports: kpi.openReports,
      pendingExperts: kpi.pendingExpertRequests,
      pendingMeetings: kpi.pendingMeetingRequests,
      approvalRatePct,
    },
  };
}

/**
 * /admin/ops 전환 퍼널 위젯 전용 경량 헬퍼.
 * loadAdminKpi → loadOperatingDashboard 를 묶어 실집계 FunnelStep[] 만 반환한다.
 * (활성방문 → 노트 → AI·LLM/규칙 → 지도 핸드오프 → 결제, pctOfSignup 포함)
 * 조회 실패 시 빈 배열([]) — 페이지 쪽에서 "데이터 없음" 빈 상태로 렌더한다.
 */
export async function getOperatingMetrics(): Promise<FunnelStep[]> {
  try {
    const kpi = await loadAdminKpi();
    const data = await loadOperatingDashboard(kpi);
    return data.funnel;
  } catch {
    return [];
  }
}
