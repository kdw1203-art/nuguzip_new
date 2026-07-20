/**
 * 관리자 대시보드(`app/admin/page.tsx`) 실집계 로더 (#83).
 *
 * - DAU: `platform_activity_events` 최근 24h distinct 사용자/익명 세션 수
 * - 신규 임장노트: `inspection_notes` 최근 24h 건수
 * - 가입: `profiles` 최근 24h 건수 (테이블 없으면 `app_users` 폴백)
 * - 전환율: 신규 노트 ÷ DAU (계산 불가 시 null → "—")
 * - 구독 매출: `payment_orders` 합 (테이블 없으면 `payments` paid 합, 둘 다 없으면 null)
 * - 처리 대기: `content_reports` 최근 5건 (open 우선)
 *
 * 모든 조회는 읽기 전용(lib/newui/supabase-read)이며 실패 시 null/빈 배열을
 * 반환하고, 페이지 쪽에서 "—" 또는 기존 목업으로 폴백한다.
 */
import "server-only";
import { getReadOnlySupabase } from "@/lib/newui/supabase-read";
import { logger } from "@/lib/log";

export interface AdminKpiCard {
  label: string;
  /** 실집계 실패 시 "—" */
  value: string;
  /** 보조 라벨 (전일 대비 등) — 없으면 null */
  delta: string | null;
  accent: boolean;
}

export interface AdminPendingItem {
  text: string;
  status: string;
  color: string;
}

export interface AdminDashboardMetrics {
  kpis: AdminKpiCard[];
  /** content_reports 실데이터 — 비어 있으면 페이지 쪽 목업 폴백 */
  pending: AdminPendingItem[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** platform_activity_events 행에서 distinct 키(세션 > 이메일 > 행 id) 추출 */
function activityKeyOf(row: {
  id: string;
  user_email?: string | null;
  metadata?: Record<string, unknown> | null;
}): string {
  const meta = row.metadata ?? {};
  const session =
    (typeof meta.session_id === "string" && meta.session_id) ||
    (typeof meta.sessionId === "string" && meta.sessionId) ||
    null;
  return session || row.user_email?.trim().toLowerCase() || row.id;
}

/** 최근 24h(및 이전 24h) distinct 활동 사용자 수 — 실패 시 null */
async function loadDau(): Promise<{ current: number; prev: number | null } | null> {
  const sb = getReadOnlySupabase();
  if (!sb) return null;
  const now = Date.now();
  const load = async (fromMs: number, toMs: number): Promise<number | null> => {
    const { data, error } = await sb
      .from("platform_activity_events")
      .select("id, user_email, metadata")
      .gte("created_at", new Date(fromMs).toISOString())
      .lt("created_at", new Date(toMs).toISOString())
      .limit(10000);
    if (error || !Array.isArray(data)) return null;
    const uniq = new Set<string>();
    for (const row of data as Array<{
      id: string;
      user_email?: string | null;
      metadata?: Record<string, unknown> | null;
    }>) {
      uniq.add(activityKeyOf(row));
    }
    return uniq.size;
  };
  const current = await load(now - DAY_MS, now + 60_000);
  if (current === null) return null;
  const prev = await load(now - 2 * DAY_MS, now - DAY_MS).catch(() => null);
  return { current, prev };
}

/** 테이블 count(created_at 최근 24h) — 실패 시 null */
async function count24h(table: string): Promise<number | null> {
  const sb = getReadOnlySupabase();
  if (!sb) return null;
  const sinceIso = new Date(Date.now() - DAY_MS).toISOString();
  const { count, error } = await sb
    .from(table)
    .select("*", { count: "exact", head: true })
    .gte("created_at", sinceIso);
  if (error || typeof count !== "number") return null;
  return count;
}

/** 가입 수: profiles 24h → 실패 시 app_users 24h 폴백 */
async function loadSignups24h(): Promise<number | null> {
  const fromProfiles = await count24h("profiles").catch(() => null);
  if (fromProfiles !== null) return fromProfiles;
  return count24h("app_users").catch(() => null);
}

/** 구독 매출: payment_orders 합 → 없으면 payments(paid, 최근 30일) 합 — 실패 시 null */
async function loadSubscriptionRevenue(): Promise<number | null> {
  const sb = getReadOnlySupabase();
  if (!sb) return null;
  const sum = (rows: unknown): number | null => {
    if (!Array.isArray(rows)) return null;
    let total = 0;
    for (const r of rows as Array<{ amount?: unknown }>) {
      const v = Number(r.amount);
      if (Number.isFinite(v)) total += v;
    }
    return total;
  };
  // 1순위: payment_orders (스펙 기준) — 테이블 없으면 error
  try {
    const { data, error } = await sb
      .from("payment_orders")
      .select("amount")
      .limit(5000);
    if (!error) {
      const total = sum(data);
      if (total !== null) return total;
    }
  } catch (e) {
    logger.info("[admin-metrics] payment_orders 조회 불가 — payments 폴백", e);
  }
  // 폴백: 구 payments 테이블 (paid, 최근 30일 — lib/admin/stats.ts 방식)
  try {
    const { data, error } = await sb
      .from("payments")
      .select("amount")
      .eq("status", "paid")
      .gte("paid_at", new Date(Date.now() - 30 * DAY_MS).toISOString())
      .not("paid_at", "is", null)
      .limit(5000);
    if (error) return null;
    return sum(data);
  } catch {
    return null;
  }
}

/* ---------- 처리 대기 (content_reports 최근 5건) ---------- */

interface ContentReportRowLite {
  reason: string | null;
  report_category: string | null;
  status: string | null;
  created_at: string | null;
}

function relativeLabel(iso: string | null): string {
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return "대기";
  const mins = Math.max(0, Math.round((Date.now() - t) / 60_000));
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.round(hours / 24)}일 전`;
}

async function loadPendingReports(): Promise<AdminPendingItem[]> {
  const sb = getReadOnlySupabase();
  if (!sb) return [];
  try {
    // open(미처리) 우선, 부족하면 전체 최근순
    let { data, error } = await sb
      .from("content_reports")
      .select("reason, report_category, status, created_at")
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(5);
    if (error || !Array.isArray(data) || data.length === 0) {
      ({ data, error } = await sb
        .from("content_reports")
        .select("reason, report_category, status, created_at")
        .order("created_at", { ascending: false })
        .limit(5));
    }
    if (error || !Array.isArray(data)) return [];
    return (data as ContentReportRowLite[]).map((r) => {
      const category = r.report_category?.trim() || "커뮤니티";
      const reason = (r.reason ?? "").trim() || "사유 미기재";
      const short = reason.length > 28 ? `${reason.slice(0, 28)}…` : reason;
      const open = (r.status ?? "open") === "open";
      const urgent =
        open &&
        Number.isFinite(Date.parse(r.created_at ?? "")) &&
        Date.now() - Date.parse(r.created_at ?? "") < DAY_MS;
      return {
        text: `신고: ${category} — “${short}” · ${relativeLabel(r.created_at)}`,
        status: urgent ? "긴급" : open ? "대기" : "처리됨",
        color: urgent ? "#d64545" : open ? "#f2c94c" : "#9aa6b8",
      };
    });
  } catch (e) {
    logger.error("[admin-metrics] content_reports", e);
    return [];
  }
}

/* ---------- 회원 관리 (P2-12: 목업 대체 — profiles 최근 가입 실데이터) ---------- */

export interface AdminMemberRow {
  name: string;
  /** 가입 상대 시각 ("10분 전" 등) */
  joined: string;
}

export interface AdminMembersData {
  /** 전체 회원 수 — 조회 실패 시 null */
  total: number | null;
  /** 최근 가입 회원 — 실패·빈 데이터 시 빈 배열 (페이지 쪽 빈 상태 렌더) */
  members: AdminMemberRow[];
}

export async function loadRecentMembers(limit = 5): Promise<AdminMembersData> {
  const sb = getReadOnlySupabase();
  if (!sb) return { total: null, members: [] };
  try {
    const { count } = await sb
      .from("profiles")
      .select("*", { count: "exact", head: true });
    const total = typeof count === "number" ? count : null;
    const { data, error } = await sb
      .from("profiles")
      .select("full_name, email, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error || !Array.isArray(data)) return { total, members: [] };
    const members = (
      data as Array<{ full_name?: string | null; email?: string | null; created_at?: string | null }>
    ).map((r) => ({
      name: r.full_name?.trim() || r.email?.split("@")[0] || "이름 미입력",
      joined: relativeLabel(r.created_at ?? null),
    }));
    return { total, members };
  } catch (e) {
    logger.error("[admin-metrics] profiles 최근 가입 조회", e);
    return { total: null, members: [] };
  }
}

/* ---------- 조립 ---------- */

function formatKrw(total: number): string {
  if (total >= 10_000) {
    const man = total / 10_000;
    return `${(man >= 100 ? Math.round(man) : Math.round(man * 10) / 10).toLocaleString("ko-KR")}만원`;
  }
  return `${Math.round(total).toLocaleString("ko-KR")}원`;
}

function deltaVsPrev(current: number, prev: number | null): string | null {
  if (prev === null || prev <= 0) return null;
  const pct = ((current - prev) / prev) * 100;
  if (!Number.isFinite(pct)) return null;
  const sign = pct >= 0 ? "+" : "−";
  return `${sign}${Math.abs(pct).toFixed(0)}%`;
}

export async function loadAdminDashboardMetrics(): Promise<AdminDashboardMetrics> {
  const [dau, notes, signups, revenue, pending] = await Promise.all([
    loadDau().catch((e) => {
      logger.error("[admin-metrics] dau", e);
      return null;
    }),
    count24h("inspection_notes").catch((): number | null => null),
    loadSignups24h().catch((): number | null => null),
    loadSubscriptionRevenue().catch((): number | null => null),
    loadPendingReports().catch((): AdminPendingItem[] => []),
  ]);

  // 노트 작성 전환율 = 24h 신규 노트 ÷ 24h DAU — 어느 한쪽이라도 없으면 "—"
  const conversion =
    dau && dau.current > 0 && notes !== null
      ? `${((notes / dau.current) * 100).toFixed(1)}%`
      : null;

  const kpis: AdminKpiCard[] = [
    {
      label: "DAU (24h)",
      value: dau ? dau.current.toLocaleString("ko-KR") : "—",
      delta: dau ? deltaVsPrev(dau.current, dau.prev) : null,
      accent: false,
    },
    {
      label: "신규 임장노트 (24h)",
      value: notes !== null ? notes.toLocaleString("ko-KR") : "—",
      delta: signups !== null ? `가입 +${signups.toLocaleString("ko-KR")}` : null,
      accent: false,
    },
    {
      label: "노트 작성 전환율",
      value: conversion ?? "—",
      delta: null,
      accent: true,
    },
    {
      label: "구독 매출",
      value: revenue !== null && revenue > 0 ? formatKrw(revenue) : revenue === 0 ? "0원" : "—",
      delta: null,
      accent: false,
    },
  ];

  return { kpis, pending };
}

/* ==========================================================================
   운영 패널 보강 — 신고 상태별 카운트 · 최근 문의 · 가입 추이(14일) · ETL 상태
   모두 읽기 전용, 실패 시 빈 배열 폴백 (페이지 쪽 빈 상태/목업 렌더).
   ========================================================================== */

export interface AdminStatusCount {
  status: string;
  count: number;
}

export interface AdminInquiryRow {
  /** "[문의:결제·환불] 제목" 에서 파싱한 표시 텍스트 */
  title: string;
  /** 보낸이 이메일 — 파싱 실패 시 null */
  from: string | null;
  when: string;
}

export interface AdminSignupDay {
  /** "MM.DD" (KST) */
  label: string;
  count: number;
}

export interface AdminEtlRow {
  name: string;
  status: string;
  color: string;
}

export interface AdminOpsPanels {
  /** content_reports 상태별 카운트 — 실패 시 빈 배열 */
  reportCounts: AdminStatusCount[];
  /** 최근 문의(support → 관리자 인박스 user_inbox_notifications) 최신 5 */
  inquiries: AdminInquiryRow[];
  /** profiles created_at 일별 최근 14일 (빈 날 0 포함) */
  signupTrend: AdminSignupDay[];
  /** market_ingest_log 최신 3 */
  etl: AdminEtlRow[];
}

/** content_reports 상태별 카운트 (최근 1000건 기준) */
async function loadReportStatusCounts(): Promise<AdminStatusCount[]> {
  const sb = getReadOnlySupabase();
  if (!sb) return [];
  try {
    const { data, error } = await sb
      .from("content_reports")
      .select("status")
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error || !Array.isArray(data)) return [];
    const counts = new Map<string, number>();
    for (const r of data as Array<{ status?: string | null }>) {
      const s = (r.status ?? "open").trim() || "open";
      counts.set(s, (counts.get(s) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count);
  } catch {
    return [];
  }
}

/**
 * 최근 문의 — app/api/support 는 문의를 관리자 인박스
 * (user_inbox_notifications, title "[문의:카테고리] 제목") 로 전달한다.
 * 해당 행을 읽어 최신 5건 반환. 테이블·데이터 없으면 빈 배열(정직한 빈 상태).
 */
async function loadRecentInquiries(limit = 5): Promise<AdminInquiryRow[]> {
  const sb = getReadOnlySupabase();
  if (!sb) return [];
  const adminEmail = (process.env.ADMIN_EMAIL ?? "admin@nuguzip.com")
    .trim()
    .toLowerCase();
  try {
    const { data, error } = await sb
      .from("user_inbox_notifications")
      .select("title, body, created_at")
      .eq("user_email", adminEmail)
      .like("title", "[문의%")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error || !Array.isArray(data)) return [];
    return (
      data as Array<{ title?: string | null; body?: string | null; created_at?: string | null }>
    ).map((r) => {
      const title = (r.title ?? "").replace(/^\[문의:?/, "[").trim() || "제목 없음";
      const m = /^보낸이:\s*(\S+)/.exec(r.body ?? "");
      return {
        title: title.length > 48 ? `${title.slice(0, 48)}…` : title,
        from: m ? m[1] : null,
        when: relativeLabel(r.created_at ?? null),
      };
    });
  } catch {
    return [];
  }
}

/** profiles 가입 추이 — 일별(KST) 최근 14일, 빈 날 0 포함 */
async function loadSignupTrend(days = 14): Promise<AdminSignupDay[]> {
  const sb = getReadOnlySupabase();
  if (!sb) return [];
  const sinceMs = Date.now() - days * DAY_MS;
  const kstDay = (ms: number): string => {
    const d = new Date(ms + 9 * 60 * 60 * 1000);
    return `${String(d.getUTCMonth() + 1).padStart(2, "0")}.${String(d.getUTCDate()).padStart(2, "0")}`;
  };
  const loadCreated = async (table: string): Promise<string[] | null> => {
    const { data, error } = await sb
      .from(table)
      .select("created_at")
      .gte("created_at", new Date(sinceMs).toISOString())
      .limit(10000);
    if (error || !Array.isArray(data)) return null;
    return (data as Array<{ created_at?: string | null }>)
      .map((r) => r.created_at ?? "")
      .filter(Boolean);
  };
  try {
    const created =
      (await loadCreated("profiles").catch(() => null)) ??
      (await loadCreated("app_users").catch(() => null));
    if (created === null) return [];
    const counts = new Map<string, number>();
    for (const iso of created) {
      const t = Date.parse(iso);
      if (!Number.isFinite(t)) continue;
      const key = kstDay(t);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const out: AdminSignupDay[] = [];
    for (let i = days - 1; i >= 0; i -= 1) {
      const label = kstDay(Date.now() - i * DAY_MS);
      out.push({ label, count: counts.get(label) ?? 0 });
    }
    return out;
  } catch {
    return [];
  }
}

/** ETL 상태 — market_ingest_log 최신 3 (lib/market/store 읽기 로더 재사용) */
async function loadEtlStatus(limit = 3): Promise<AdminEtlRow[]> {
  try {
    const { listIngestLog } = await import("@/lib/market/store");
    const rows = await listIngestLog(limit);
    return rows.map((r) => {
      const ok = r.status === "ok";
      const skipped = r.status === "skipped";
      return {
        name: `${r.source.toUpperCase()} · ${r.dataset} (${r.origin})`,
        status: `${ok ? "●" : skipped ? "◦" : "▲"} ${
          ok ? "정상" : skipped ? "건너뜀" : "오류"
        } · ${r.rows.toLocaleString("ko-KR")}행 · ${relativeLabel(r.createdAt)}${
          !ok && r.message ? ` · ${r.message.slice(0, 40)}` : ""
        }`,
        color: ok ? "#4ade80" : skipped ? "#9aa6b8" : "#f2c94c",
      };
    });
  } catch (e) {
    logger.info("[admin-metrics] market_ingest_log 조회 불가", e);
    return [];
  }
}

export async function loadAdminOpsPanels(): Promise<AdminOpsPanels> {
  const [reportCounts, inquiries, signupTrend, etl] = await Promise.all([
    loadReportStatusCounts().catch((): AdminStatusCount[] => []),
    loadRecentInquiries(5).catch((): AdminInquiryRow[] => []),
    loadSignupTrend(14).catch((): AdminSignupDay[] => []),
    loadEtlStatus(3).catch((): AdminEtlRow[] => []),
  ]);
  return { reportCounts, inquiries, signupTrend, etl };
}
