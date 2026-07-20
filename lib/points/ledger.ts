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

export async function getHistory(email: string, limit = 50): Promise<LedgerRow[]> {
  const sb = getServiceSupabase();
  if (!sb || !email) return [];
  const { data, error } = await sb
    .from("point_ledger")
    .select("delta, reason, ref_id, balance, created_at, expires_at")
    .eq("user_email", email)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !Array.isArray(data)) return [];
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

/** 포인트 소비 — 잔액 검증 후 차감 원장 기록 */
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
    const bal = await getBalance(email);
    if (bal < cost) {
      return { ok: false, spent: 0, balance: bal, reason: "insufficient" };
    }
    const newBal = bal - cost;
    const { error } = await sb.from("point_ledger").insert({
      user_email: email,
      delta: -cost,
      reason,
      ref_id: refId ?? null,
      balance: newBal,
    });
    if (error) {
      logger.error("[spendPoints] insert", error);
      return { ok: false, spent: 0, balance: bal, reason: "db" };
    }
    return { ok: true, spent: cost, balance: newBal };
  } catch (e) {
    logger.error("[spendPoints]", e);
    return { ok: false, spent: 0, balance: await getBalance(email), reason: "error" };
  }
}
