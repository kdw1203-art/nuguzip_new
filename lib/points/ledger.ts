import "server-only";
import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/log";
import {
  EARN_RULES,
  DAILY_EARN_CAP,
  MONTHLY_EARN_CAP,
  POINT_EXPIRY_MONTHS,
} from "@/lib/points/catalog";

/**
 * 포인트 원장(point_ledger) 엔진 — 적립·소비·잔액·상한·만료 (기획안 §4).
 * balance 는 매 행에 러닝 잔액으로 기록한다(최신 행의 balance = 현재 잔액).
 * Service Role 로만 기록 → 클라이언트 위조 불가.
 */

export type LedgerRow = {
  delta: number;
  reason: string;
  refId: string | null;
  balance: number;
  createdAt: string;
  expiresAt: string | null;
};

/** 현재 잔액 = 가장 최근 원장 행의 balance (없으면 0) */
export async function getBalance(email: string): Promise<number> {
  const sb = getServiceSupabase();
  if (!sb || !email) return 0;
  const { data, error } = await sb
    .from("point_ledger")
    .select("balance")
    .eq("user_email", email)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return 0;
  return Number(data.balance) || 0;
}

/**
 * 포인트 내역 — 최신순.
 *
 * 조회에 실패하면 **던진다**. 예전에는 빈 배열이었는데, 그러면 /my 와 /my/points 가
 * "아직 포인트 내역이 없어요 · 활동하면 적립·사용 기록이 모여요" 라고 쓴다 —
 * 적립한 적이 없는 사람과 원장을 못 읽은 사람이 화면에서 똑같아진다.
 * 행이 0개인 것은 진짜 빈 내역이므로 그대로 빈 배열이다.
 */
export async function getHistory(email: string, limit = 50): Promise<LedgerRow[]> {
  const sb = getServiceSupabase();
  if (!sb || !email) return [];
  const { data, error } = await sb
    .from("point_ledger")
    .select("delta, reason, ref_id, balance, created_at, expires_at")
    .eq("user_email", email)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    logger.error("[points] point_ledger 조회 실패", error.message);
    throw new Error(`point_ledger 조회 실패: ${error.message}`);
  }
  if (!Array.isArray(data)) throw new Error("point_ledger 응답이 배열이 아닙니다");
  return data.map((r) => ({
    delta: Number(r.delta),
    reason: String(r.reason),
    refId: r.ref_id ? String(r.ref_id) : null,
    balance: Number(r.balance),
    createdAt: String(r.created_at),
    expiresAt: r.expires_at ? String(r.expires_at) : null,
  }));
}

async function earnedSince(email: string, sinceIso: string): Promise<number> {
  const sb = getServiceSupabase();
  if (!sb) return 0;
  const { data } = await sb
    .from("point_ledger")
    .select("delta")
    .eq("user_email", email)
    .gt("delta", 0)
    .gte("created_at", sinceIso);
  if (!Array.isArray(data)) return 0;
  return data.reduce((s, r) => s + (Number(r.delta) || 0), 0);
}

/** 특정 사유가 이미 지급됐는지 (once / ref 중복 방지) */
async function alreadyAwarded(
  email: string,
  reason: string,
  refId?: string,
): Promise<boolean> {
  const sb = getServiceSupabase();
  if (!sb) return false;
  let q = sb
    .from("point_ledger")
    .select("id", { count: "exact", head: true })
    .eq("user_email", email)
    .eq("reason", reason);
  if (refId) q = q.eq("ref_id", refId);
  const { count } = await q;
  return (count ?? 0) > 0;
}

export type AwardResult = {
  ok: boolean;
  awarded: number;
  balance: number;
  reason?: string;
};

/** 규칙 기반 적립 — 상한·중복·once 방어 포함 */
export async function awardPoints(
  email: string,
  ruleKey: string,
  refId?: string,
): Promise<AwardResult> {
  const sb = getServiceSupabase();
  const rule = EARN_RULES[ruleKey];
  if (!sb || !email || !rule) {
    return { ok: false, awarded: 0, balance: await getBalance(email), reason: "invalid" };
  }
  try {
    // once / ref 중복
    if (rule.once && (await alreadyAwarded(email, rule.key))) {
      return { ok: false, awarded: 0, balance: await getBalance(email), reason: "already_once" };
    }
    if (refId && (await alreadyAwarded(email, rule.key, refId))) {
      return { ok: false, awarded: 0, balance: await getBalance(email), reason: "already_ref" };
    }
    // 일/월 상한
    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const [dayEarned, monthEarned] = await Promise.all([
      earnedSince(email, dayStart),
      earnedSince(email, monthStart),
    ]);
    if (dayEarned >= DAILY_EARN_CAP || monthEarned >= MONTHLY_EARN_CAP) {
      return { ok: false, awarded: 0, balance: await getBalance(email), reason: "cap" };
    }
    // 룰 dailyCap (횟수)
    if (rule.dailyCap) {
      const { count } = await sb
        .from("point_ledger")
        .select("id", { count: "exact", head: true })
        .eq("user_email", email)
        .eq("reason", rule.key)
        .gte("created_at", dayStart);
      if ((count ?? 0) >= rule.dailyCap) {
        return { ok: false, awarded: 0, balance: await getBalance(email), reason: "rule_cap" };
      }
    }
    // 상한 초과분 컷
    const room = Math.max(0, DAILY_EARN_CAP - dayEarned);
    const amount = Math.min(rule.points, room);
    if (amount <= 0) {
      return { ok: false, awarded: 0, balance: await getBalance(email), reason: "cap" };
    }
    const bal = await getBalance(email);
    const newBal = bal + amount;
    const expires = new Date(now);
    expires.setMonth(expires.getMonth() + POINT_EXPIRY_MONTHS);
    const { error } = await sb.from("point_ledger").insert({
      user_email: email,
      delta: amount,
      reason: rule.key,
      ref_id: refId ?? null,
      balance: newBal,
      expires_at: expires.toISOString(),
    });
    if (error) {
      logger.error("[awardPoints] insert", error);
      return { ok: false, awarded: 0, balance: bal, reason: "db" };
    }
    return { ok: true, awarded: amount, balance: newBal };
  } catch (e) {
    logger.error("[awardPoints]", e);
    return { ok: false, awarded: 0, balance: await getBalance(email), reason: "error" };
  }
}

export type SpendResult = {
  ok: boolean;
  spent: number;
  balance: number;
  reason?: string;
};

/** RPC 미배포(마이그레이션 전) 감지 — PostgREST 는 함수를 못 찾으면 PGRST202 를 준다 */
function isMissingRpc(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "PGRST202" || error.code === "42883") return true;
  const msg = error.message ?? "";
  return /point_ledger_spend/.test(msg) && /(not find|not exist|does not exist)/i.test(msg);
}

/**
 * 포인트 소비 — 원자적 RPC(point_ledger_spend)로 잔액 검증+차감을 단일 트랜잭션 처리.
 * (기존 "조회 후 insert" 2왕복은 동시 요청이 같은 잔액을 읽어 이중 차감되는 경합이 있었다.)
 * 마이그레이션이 아직 적용되지 않은 환경에서는 기존 경로로 폴백한다.
 */
export async function spendPoints(
  email: string,
  cost: number,
  reason: string,
  refId?: string,
): Promise<SpendResult> {
  const sb = getServiceSupabase();
  if (!sb || !email || cost <= 0) {
    return { ok: false, spent: 0, balance: await getBalance(email), reason: "invalid" };
  }
  try {
    const { data, error } = await sb.rpc("point_ledger_spend", {
      p_user_email: email,
      p_cost: cost,
      p_reason: reason,
      p_ref_id: refId ?? null,
    });
    if (!error) {
      const r = (data ?? {}) as {
        ok?: boolean;
        spent?: number;
        balance?: number;
        reason?: string;
      };
      return {
        ok: Boolean(r.ok),
        spent: Number(r.spent) || 0,
        balance: Number(r.balance) || 0,
        reason: r.ok ? undefined : (r.reason ?? "error"),
      };
    }
    if (!isMissingRpc(error)) {
      logger.error("[spendPoints] rpc", error);
      return { ok: false, spent: 0, balance: await getBalance(email), reason: "db" };
    }
    // ── 폴백(비원자): RPC 함수가 아직 없는 환경 전용 ──
    const bal = await getBalance(email);
    if (bal < cost) {
      return { ok: false, spent: 0, balance: bal, reason: "insufficient" };
    }
    const newBal = bal - cost;
    const { error: insertError } = await sb.from("point_ledger").insert({
      user_email: email,
      delta: -cost,
      reason,
      ref_id: refId ?? null,
      balance: newBal,
    });
    if (insertError) {
      logger.error("[spendPoints] insert", insertError);
      return { ok: false, spent: 0, balance: bal, reason: "db" };
    }
    return { ok: true, spent: cost, balance: newBal };
  } catch (e) {
    logger.error("[spendPoints]", e);
    return { ok: false, spent: 0, balance: await getBalance(email), reason: "error" };
  }
}
