import { getServiceSupabase } from "@/lib/supabase/service";
import { readPosts } from "@/lib/posts-store";
import { readMarketRequestsFile } from "@/lib/market-store-file";

/**
 * 관리자 대시보드용 집계.
 * - Supabase 가 설정돼 있으면 app_users / posts / content_reports / notification_outbox 로부터 카운트
 * - 미설정 시 파일 기반 posts, market_requests 만 반환
 * 어떤 경우에도 throw 하지 않고 안전한 기본값을 반환합니다.
 */

export type AdminKpi = {
  totalUsers: number;
  totalAdmins: number;
  newUsers7d: number;
  newUsers30d: number;
  newUsersToday: number;
  planCounts: Record<string, number>;
  totalPosts: number;
  postsToday: number;
  postsThisWeek: number;
  openReports: number;
  totalReports: number;
  pendingOutbox: number;
  totalOutbox: number;
  marketOpen: number;
  marketTotal: number;
  pendingExpertRequests: number;
  pendingMeetingRequests: number;
  totalExperts: number;
  totalMeetings: number;
  meetingsToday: number;
  totalInspections: number;
  inspectionsThisWeek: number;
  totalReportDocs: number;
  reportDocsToday: number;
  /** 최근 7일 글 작성자 근사(이메일 또는 author_label 기준 유니크) */
  activeUsers7d: number;
  /** Supabase payments 확정 건수(30일, paid_at 기준) */
  paymentsCompleted30d: number;
  paymentsRevenue30dKrw: number;
  totalBookmarks: number;
  totalInboxNotifications: number;
  stripeConfigured: boolean;
  supabaseConfigured: boolean;
  /**
   * public.ai_analysis_runs 최근 7일 건수. 테이블·권한 없으면 null.
   */
  aiAnalysisRuns7d: number | null;
  /**
   * public.platform_activity_events 최근 7일 건수. 테이블·권한 없으면 null.
   */
  platformActivityEvents7d: number | null;
};

export type VitalKey = "LCP" | "INP" | "CLS" | "FCP" | "TTFB";
export type VitalStat = {
  metric: VitalKey;
  p75: number | null;
  samples: number;
  good: number;
  needsImprovement: number;
  poor: number;
};

/**
 * Web Vitals 임계값(웹 표준) - 측정값이 이 이하면 "좋음".
 * https://web.dev/articles/vitals
 */
const VITAL_THRESHOLDS: Record<VitalKey, { good: number; poor: number }> = {
  LCP: { good: 2500, poor: 4000 },
  INP: { good: 200, poor: 500 },
  CLS: { good: 0.1, poor: 0.25 },
  FCP: { good: 1800, poor: 3000 },
  TTFB: { good: 800, poor: 1800 },
};

export function classifyVital(metric: VitalKey, value: number): "good" | "ni" | "poor" {
  const t = VITAL_THRESHOLDS[metric];
  if (value <= t.good) return "good";
  if (value <= t.poor) return "ni";
  return "poor";
}

export function formatVital(metric: VitalKey, value: number | null): string {
  if (value == null) return "—";
  if (metric === "CLS") return value.toFixed(3);
  if (value >= 1000) return `${(value / 1000).toFixed(2)}s`;
  return `${Math.round(value)}ms`;
}

export async function loadVitalsLast7d(): Promise<VitalStat[]> {
  const sb = getServiceSupabase();
  const metrics: VitalKey[] = ["LCP", "INP", "CLS", "FCP", "TTFB"];
  const empty: VitalStat[] = metrics.map((m) => ({
    metric: m,
    p75: null,
    samples: 0,
    good: 0,
    needsImprovement: 0,
    poor: 0,
  }));
  if (!sb) return empty;

  const since = new Date();
  since.setDate(since.getDate() - 7);
  const { data, error } = await sb
    .from("web_vitals")
    .select("metric, value")
    .gte("created_at", since.toISOString())
    .limit(5000);
  if (error || !Array.isArray(data)) return empty;

  const buckets = new Map<VitalKey, number[]>();
  for (const m of metrics) buckets.set(m, []);
  for (const row of data as Array<{ metric: string; value: number }>) {
    const key = row.metric as VitalKey;
    const bucket = buckets.get(key);
    if (bucket && Number.isFinite(row.value)) {
      bucket.push(Number(row.value));
    }
  }

  return metrics.map((m) => {
    const arr = (buckets.get(m) ?? []).slice().sort((a, b) => a - b);
    if (arr.length === 0) {
      return { metric: m, p75: null, samples: 0, good: 0, needsImprovement: 0, poor: 0 };
    }
    const idx = Math.min(arr.length - 1, Math.floor(arr.length * 0.75));
    let good = 0;
    let ni = 0;
    let poor = 0;
    for (const v of arr) {
      const c = classifyVital(m, v);
      if (c === "good") good += 1;
      else if (c === "ni") ni += 1;
      else poor += 1;
    }
    return {
      metric: m,
      p75: arr[idx],
      samples: arr.length,
      good,
      needsImprovement: ni,
      poor,
    };
  });
}

export type AdminRecent = {
  recentPosts: Array<{
    id: string;
    title: string;
    city: string;
    district: string;
    createdAt: string;
    authorLabel: string;
  }>;
  recentReports: Array<{
    id: string;
    postId: string;
    reason: string;
    status: string;
    createdAt: string;
  }>;
  recentOutbox: Array<{
    id: string;
    toEmail: string;
    subject: string;
    status: string;
    createdAt: string;
  }>;
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

async function safeCountSinceTable(
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

export async function loadAdminKpi(): Promise<AdminKpi> {
  const sb = getServiceSupabase();
  const today = startOfDay(new Date()).toISOString();
  const weekAgo = daysAgo(7).toISOString();

  const base: AdminKpi = {
    totalUsers: 0,
    totalAdmins: 0,
    newUsers7d: 0,
    newUsers30d: 0,
    newUsersToday: 0,
    planCounts: {},
    totalPosts: 0,
    postsToday: 0,
    postsThisWeek: 0,
    openReports: 0,
    totalReports: 0,
    pendingOutbox: 0,
    totalOutbox: 0,
    marketOpen: 0,
    marketTotal: 0,
    pendingExpertRequests: 0,
    pendingMeetingRequests: 0,
    totalExperts: 0,
    totalMeetings: 0,
    meetingsToday: 0,
    totalInspections: 0,
    inspectionsThisWeek: 0,
    totalReportDocs: 0,
    reportDocsToday: 0,
    activeUsers7d: 0,
    paymentsCompleted30d: 0,
    paymentsRevenue30dKrw: 0,
    totalBookmarks: 0,
    totalInboxNotifications: 0,
    stripeConfigured: Boolean(process.env.STRIPE_SECRET_KEY?.trim()),
    supabaseConfigured: Boolean(sb),
    aiAnalysisRuns7d: null,
    platformActivityEvents7d: null,
  };

  // 파일 기반 fallback 우선 집계
  try {
    const posts = await readPosts();
    base.totalPosts = posts.length;
    base.postsToday = posts.filter((p) => p.createdAt >= today).length;
    base.postsThisWeek = posts.filter((p) => p.createdAt >= weekAgo).length;
  } catch {
    /* ignore */
  }
  try {
    const market = await readMarketRequestsFile();
    base.marketTotal = market.length;
    base.marketOpen = market.filter((m) => m.status === "open").length;
  } catch {
    /* ignore */
  }

  if (!sb) return base;

  const thirtyAgo = daysAgo(30).toISOString();

  const [
    usersRes,
    adminsRes,
    new7Res,
    new30Res,
    postsCountRes,
    openReportsRes,
    totalReportsRes,
    pendingOutboxRes,
    totalOutboxRes,
    plans,
    expertPendingRes,
    meetingPendingRes,
    newTodayRes,
    expertsTotalRes,
    meetingsTotalRes,
    meetingsTodayRes,
    inspectionsTotalRes,
    inspections7Res,
    reportDocsTotalRes,
    reportDocsTodayRes,
    bookmarksTotalRes,
    paymentsPaid30Res,
    inboxTotalRes,
    postsWeekRes,
  ] = await Promise.all([
    sb.from("app_users").select("*", { count: "exact", head: true }),
    sb.from("app_users").select("*", { count: "exact", head: true }).eq("role", "admin"),
    sb.from("app_users").select("*", { count: "exact", head: true }).gte("created_at", weekAgo),
    sb.from("app_users").select("*", { count: "exact", head: true }).gte("created_at", thirtyAgo),
    sb.from("posts").select("*", { count: "exact", head: true }),
    sb.from("content_reports").select("*", { count: "exact", head: true }).eq("status", "open"),
    sb.from("content_reports").select("*", { count: "exact", head: true }),
    sb
      .from("notification_outbox")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending"),
    sb.from("notification_outbox").select("*", { count: "exact", head: true }),
    sb.from("app_users").select("plan"),
    sb
      .from("expert_verification_requests")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending"),
    sb
      .from("meeting_requests")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending"),
    sb.from("app_users").select("*", { count: "exact", head: true }).gte("created_at", today),
    sb.from("expert_profiles").select("*", { count: "exact", head: true }),
    sb.from("meetings").select("*", { count: "exact", head: true }),
    sb.from("meetings").select("*", { count: "exact", head: true }).gte("created_at", today),
    sb.from("inspection_notes").select("*", { count: "exact", head: true }),
    sb
      .from("inspection_notes")
      .select("*", { count: "exact", head: true })
      .gte("created_at", weekAgo),
    sb.from("reports").select("*", { count: "exact", head: true }),
    sb.from("reports").select("*", { count: "exact", head: true }).gte("created_at", today),
    sb.from("bookmarks").select("*", { count: "exact", head: true }),
    sb
      .from("payments")
      .select("amount")
      .eq("status", "paid")
      .gte("paid_at", thirtyAgo)
      .not("paid_at", "is", null)
      .limit(5000),
    sb.from("user_inbox_notifications").select("*", { count: "exact", head: true }),
    sb
      .from("posts")
      .select("author_label, notify_email")
      .gte("created_at", weekAgo)
      .limit(4000),
  ]);

  if (typeof usersRes.count === "number") base.totalUsers = usersRes.count;
  if (typeof adminsRes.count === "number") base.totalAdmins = adminsRes.count;
  if (typeof new7Res.count === "number") base.newUsers7d = new7Res.count;
  if (typeof new30Res.count === "number") base.newUsers30d = new30Res.count;
  if (typeof postsCountRes.count === "number") base.totalPosts = postsCountRes.count;
  if (typeof openReportsRes.count === "number") base.openReports = openReportsRes.count;
  if (typeof totalReportsRes.count === "number") base.totalReports = totalReportsRes.count;
  if (typeof pendingOutboxRes.count === "number") base.pendingOutbox = pendingOutboxRes.count;
  if (typeof totalOutboxRes.count === "number") base.totalOutbox = totalOutboxRes.count;
  if (typeof expertPendingRes.count === "number") base.pendingExpertRequests = expertPendingRes.count;
  if (typeof meetingPendingRes.count === "number") base.pendingMeetingRequests = meetingPendingRes.count;
  if (typeof newTodayRes.count === "number") base.newUsersToday = newTodayRes.count;
  if (typeof expertsTotalRes.count === "number") base.totalExperts = expertsTotalRes.count;
  if (typeof meetingsTotalRes.count === "number") base.totalMeetings = meetingsTotalRes.count;
  if (typeof meetingsTodayRes.count === "number") base.meetingsToday = meetingsTodayRes.count;
  if (typeof inspectionsTotalRes.count === "number") base.totalInspections = inspectionsTotalRes.count;
  if (typeof inspections7Res.count === "number") base.inspectionsThisWeek = inspections7Res.count;
  if (typeof reportDocsTotalRes.count === "number") base.totalReportDocs = reportDocsTotalRes.count;
  if (typeof reportDocsTodayRes.count === "number") base.reportDocsToday = reportDocsTodayRes.count;
  if (typeof bookmarksTotalRes.count === "number") base.totalBookmarks = bookmarksTotalRes.count;
  if (typeof inboxTotalRes.count === "number") {
    base.totalInboxNotifications = inboxTotalRes.count;
  }
  if (Array.isArray(paymentsPaid30Res.data)) {
    const rows = paymentsPaid30Res.data as Array<{ amount?: number | string | null }>;
    base.paymentsCompleted30d = rows.length;
    base.paymentsRevenue30dKrw = rows.reduce(
      (s, r) => s + Number(r.amount ?? 0),
      0,
    );
  }
  if (Array.isArray(postsWeekRes.data)) {
    const uniq = new Set<string>();
    for (const row of postsWeekRes.data as Array<{
      author_label?: string | null;
      notify_email?: string | null;
    }>) {
      const email = String(row.notify_email ?? "")
        .trim()
        .toLowerCase();
      const label = String(row.author_label ?? "")
        .trim()
        .toLowerCase();
      const key = email || label;
      if (key) uniq.add(key);
    }
    base.activeUsers7d = uniq.size;
  }

  const pc: Record<string, number> = {};
  if (Array.isArray(plans.data)) {
    for (const row of plans.data as Array<{ plan?: string | null }>) {
      const key = (row.plan ?? "free").toLowerCase();
      pc[key] = (pc[key] ?? 0) + 1;
    }
  }
  base.planCounts = pc;
  base.stripeConfigured = Boolean(process.env.STRIPE_SECRET_KEY?.trim());

  const [ai7, pe7] = await Promise.all([
    safeCountSinceTable(sb, "ai_analysis_runs", weekAgo),
    safeCountSinceTable(sb, "platform_activity_events", weekAgo),
  ]);
  base.aiAnalysisRuns7d = ai7;
  base.platformActivityEvents7d = pe7;

  return base;
}

export type PopularPost = {
  id: string;
  title: string;
  city: string;
  district: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
};

export async function loadPopularPosts(): Promise<PopularPost[]> {
  const posts = await readPosts();
  return posts
    .slice()
    .sort((a, b) => b.viewCount * 2 + b.likeCount * 5 - (a.viewCount * 2 + a.likeCount * 5))
    .slice(0, 8)
    .map((p) => ({
      id: p.id,
      title: p.title,
      city: p.city,
      district: p.district,
      viewCount: p.viewCount,
      likeCount: p.likeCount,
      commentCount: p.commentCount,
    }));
}

export type RegionShare = { region: string; count: number; pct: number };

export async function loadRegionDistribution(): Promise<RegionShare[]> {
  const posts = await readPosts();
  const bucket = new Map<string, number>();
  for (const p of posts) {
    const key = p.city || "미상";
    bucket.set(key, (bucket.get(key) ?? 0) + 1);
  }
  const total = posts.length || 1;
  return Array.from(bucket.entries())
    .map(([region, count]) => ({ region, count, pct: Math.round((count / total) * 1000) / 10 }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

export type SignupTrendPoint = { date: string; count: number };

export async function loadSignupTrend30d(): Promise<SignupTrendPoint[]> {
  const sb = getServiceSupabase();
  if (!sb) {
    // 파일 폴백: 더미 0 으로 최근 30일 채움
    const now = new Date();
    return Array.from({ length: 30 }, (_, i) => {
      const d = new Date(now);
      d.setDate(d.getDate() - (29 - i));
      return { date: d.toISOString().slice(0, 10), count: 0 };
    });
  }
  const since = daysAgo(29).toISOString();
  const { data } = await sb
    .from("app_users")
    .select("created_at")
    .gte("created_at", since);
  const daily = new Map<string, number>();
  for (let i = 0; i < 30; i += 1) {
    const d = daysAgo(29 - i);
    daily.set(d.toISOString().slice(0, 10), 0);
  }
  for (const row of (data ?? []) as Array<{ created_at: string }>) {
    const key = row.created_at.slice(0, 10);
    if (daily.has(key)) daily.set(key, (daily.get(key) ?? 0) + 1);
  }
  return Array.from(daily.entries()).map(([date, count]) => ({ date, count }));
}

export async function loadAdminRecent(): Promise<AdminRecent> {
  const sb = getServiceSupabase();
  const out: AdminRecent = {
    recentPosts: [],
    recentReports: [],
    recentOutbox: [],
  };

  // 최근 글 (파일/Supabase 공통 경로)
  try {
    const posts = await readPosts();
    out.recentPosts = posts.slice(0, 10).map((p) => ({
      id: p.id,
      title: p.title,
      city: p.city,
      district: p.district,
      createdAt: p.createdAt,
      authorLabel: p.authorLabel,
    }));
  } catch {
    /* ignore */
  }

  if (!sb) return out;

  const [reportsRes, outboxRes] = await Promise.all([
    sb
      .from("content_reports")
      .select("id, post_id, reason, status, created_at")
      .order("created_at", { ascending: false })
      .limit(10),
    sb
      .from("notification_outbox")
      .select("id, to_email, subject, status, created_at")
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  if (Array.isArray(reportsRes.data)) {
    out.recentReports = reportsRes.data.map((r) => ({
      id: r.id as string,
      postId: r.post_id as string,
      reason: r.reason as string,
      status: r.status as string,
      createdAt: r.created_at as string,
    }));
  }
  if (Array.isArray(outboxRes.data)) {
    out.recentOutbox = outboxRes.data.map((r) => ({
      id: r.id as string,
      toEmail: r.to_email as string,
      subject: r.subject as string,
      status: r.status as string,
      createdAt: r.created_at as string,
    }));
  }

  return out;
}
