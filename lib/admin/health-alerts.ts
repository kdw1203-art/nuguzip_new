import "server-only";

import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/log";

/* 운영 경보 읽기 — ops.health_alert_log.
 *
 * 왜 이 파일이 생겼나(2026-08-25 실측): 경보 시스템은 이미 돌고 있었다.
 * 14일 동안 critical 이 169건 쌓였고(market_transactions.month_rollover 73 ·
 * ingest 66 · pipeline_heartbeat 30), db.query_load 경고는 **매일** 울렸다.
 * 그런데 그 경보를 읽는 화면이 한 곳도 없었다 — 테이블에만 쌓이고 있었다.
 * 아무도 안 보는 경보는 경보가 아니다.
 *
 * 메일 발송(RESEND)은 키가 아직 없어 닫혀 있다. 그 전까지는 최소한
 * 관리자 화면에서 보이게 한다.
 */

export interface HealthAlertRow {
  checkName: string;
  severity: "critical" | "warn" | string;
  detail: string | null;
  ageHours: number | null;
  checkedAt: string;
  /** 같은 check_name 이 이 기간에 몇 번 울렸는지 */
  count: number;
}

/** 최근 N일 경보를 check_name 기준으로 접어, 심각도·빈도 순으로 돌려준다. */
export async function loadRecentHealthAlerts(days = 7, limit = 12): Promise<HealthAlertRow[]> {
  const sb = getServiceSupabase();
  if (!sb) return [];
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const run = () =>
    sb
      .schema("ops")
      .from("health_alert_log")
      .select("check_name, severity, detail, age_hours, checked_at")
      .gte("checked_at", since)
      .order("checked_at", { ascending: false })
      .limit(500);
  let { data, error } = await run();
  if (error) {
    /* [G003 2026-08-31] 1회 재시도. 7일간 이 조회의 실패 2건은 전부 DB 포화
       구간의 일시 오류였다 — 운영 콘솔이 그 순간에만 "경보를 못 읽었다"고
       앓으면, 정작 경보를 봐야 할 때 화면이 비어 있게 된다. 짧게 한 번 더. */
    await new Promise((r) => setTimeout(r, 300));
    ({ data, error } = await run());
  }
  if (error) {
    logger.error("[admin] 경보 로그 조회 실패", error);
    return [];
  }
  const folded = new Map<string, HealthAlertRow>();
  for (const r of (data ?? []) as Array<Record<string, unknown>>) {
    const key = `${String(r.check_name ?? "")}|${String(r.severity ?? "")}`;
    const prev = folded.get(key);
    if (prev) {
      prev.count += 1;
      continue;
    }
    folded.set(key, {
      checkName: String(r.check_name ?? ""),
      severity: String(r.severity ?? "warn"),
      detail: r.detail == null ? null : String(r.detail),
      ageHours: r.age_hours == null ? null : Number(r.age_hours),
      checkedAt: String(r.checked_at ?? ""),
      count: 1,
    });
  }
  const rank = (s: string) => (s === "critical" ? 0 : s === "warn" ? 1 : 2);
  return [...folded.values()]
    .sort((a, b) => rank(a.severity) - rank(b.severity) || b.count - a.count)
    .slice(0, limit);
}

/** [G001] 최근 24시간 critical 경보 — 관리자 전 페이지 상단 배너용.
 *
 * billing-renewals 가 4일 넘게 critical 인데 freshness 서브 페이지에 들어가야
 * 보였다. 심각 경보는 관리자 어느 화면에 있어도 먼저 보여야 한다. */
export async function loadCriticalAlerts24h(): Promise<HealthAlertRow[]> {
  const alerts = await loadRecentHealthAlerts(1, 12);
  return alerts.filter((a) => a.severity === "critical");
}
