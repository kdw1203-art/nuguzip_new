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

/**
 * 현재 잔액 = 가장 최근 원장 행의 balance. 원장 행이 하나도 없으면 0 이다.
 *
 * 조회에 **실패하면 던진다.** 예전에는 `if (error || !data) return 0` 이라
 * 실패와 "아직 적립한 적 없음"이 똑같이 0 이었는데, 그 0 이 가는 곳을 보면
 * 왜 안 되는지 분명하다:
 *   - /points/shop 과 /my 는 "0 P" 를 사실인 것처럼 그린다.
 *   - 소비 경로(spend·boost·리포트 구매)는 사전 잔액 확인에서 걸려
 *     "포인트가 부족해요" 라고 답한다 — 넉넉히 가진 사람에게 하는 거짓말이다.
 *     차감이 일어나지 않으니 돈은 안전하지만, 안내는 틀렸다.
 * 못 읽은 것과 없는 것은 다르므로 갈라 낸다. 행이 0개(`!data`)인 것만 0 이다.
 */
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
  if (error) {
    logger.error("[points] 잔액 조회 실패", error.message);
    throw new Error(`point_ledger 잔액 조회 실패: ${error.message}`);
  }
  if (!data) return 0;
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
  const { data, error } = await sb
    .from("point_ledger")
    .select("delta")
    .eq("user_email", email)
    .gt("delta", 0)
    .gte("created_at", sinceIso);
  /* 못 읽은 것을 0 으로 보면 "오늘 하나도 안 벌었다"가 되어 일·월 상한 검사를
     그대로 통과한다 — 상한을 이미 채운 사람에게 계속 지급하는 길이 열린다.
     상한은 지키라고 있는 것이므로, 확인이 안 되면 지급하지 않는다(호출부
     awardPoints 의 try/catch 가 받아 reason:"error" 로 돌려준다). */
  if (error) throw new Error(`point_ledger 적립합계 조회 실패: ${error.message}`);
  if (!Array.isArray(data)) throw new Error("point_ledger 적립합계 응답이 배열이 아닙니다");
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
  const { count, error } = await q;
  /* count 가 null 인 것은 "0건"이 아니라 **세지 못했다**는 뜻이다. 그걸 false 로
     바꾸면 "아직 지급 안 했다"가 되어 once·refId 중복 방어가 통째로 열린다
     (같은 사유로 두 번 적립). 확인 못 했으면 지급하지 않는다. */
  if (error) throw new Error(`point_ledger 중복지급 확인 실패: ${error.message}`);
  if (typeof count !== "number") throw new Error("point_ledger 중복지급 확인 결과가 없습니다");
  return count > 0;
}

export type AwardResult = {
  ok: boolean;
  awarded: number;
  balance: number;
  reason?: string;
};

/**
 * **실패 결과에 곁들일** 잔액. awardPoints·spendPoints 는 던지지 않고 결과 객체를
 * 돌려주는 계약이라, 이미 실패한 자리에서 잔액까지 못 읽었다고 예외를 올리면
 * 계약이 깨진다(특히 catch 블록 안에서 던지면 그대로 밖으로 새어 나간다).
 *
 * 여기서 0 을 쓰는 것이 getBalance 를 고친 취지와 어긋나지 않는 이유: 이 값은
 * 언제나 `ok: false` 와 함께 나가므로 "당신의 잔액은 0원" 이라는 단독 주장이
 * 되지 않는다. 잔액을 사실로 보여 주는 화면들(/points/shop, /my, /my/points)은
 * 이 함수를 거치지 않고 getBalance 를 직접 부르고, 실패하면 실패라고 쓴다.
 */
async function balanceForFailure(email: string): Promise<number> {
  return getBalance(email).then(
    (b) => b,
    () => 0,
  );
}

/** 규칙 기반 적립 — 상한·중복·once 방어 포함 */
export async function awardPoints(
  email: string,
  ruleKey: string,
  refId?: string,
): Promise<AwardResult> {
  const sb = getServiceSupabase();
  const rule = EARN_RULES[ruleKey];
  if (!sb || !email || !rule) {
    return { ok: false, awarded: 0, balance: await balanceForFailure(email), reason: "invalid" };
  }
  try {
    // once / ref 중복
    if (rule.once && (await alreadyAwarded(email, rule.key))) {
      const balance = await balanceForFailure(email);
      return { ok: false, awarded: 0, balance, reason: "already_once" };
    }
    if (refId && (await alreadyAwarded(email, rule.key, refId))) {
      const balance = await balanceForFailure(email);
      return { ok: false, awarded: 0, balance, reason: "already_ref" };
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
      return { ok: false, awarded: 0, balance: await balanceForFailure(email), reason: "cap" };
    }
    // 룰 dailyCap (횟수)
    if (rule.dailyCap) {
      const { count, error: countErr } = await sb
        .from("point_ledger")
        .select("id", { count: "exact", head: true })
        .eq("user_email", email)
        .eq("reason", rule.key)
        .gte("created_at", dayStart);
      /* 위 alreadyAwarded 와 같은 이유 — 세지 못한 것을 0 으로 보면 하루 상한이
         있으나 마나가 된다. 아래 catch 로 넘겨 지급을 건너뛴다. */
      if (countErr) throw new Error(`point_ledger 일일횟수 조회 실패: ${countErr.message}`);
      if (typeof count !== "number") throw new Error("point_ledger 일일횟수 결과가 없습니다");
      if (count >= rule.dailyCap) {
        const balance = await balanceForFailure(email);
        return { ok: false, awarded: 0, balance, reason: "rule_cap" };
      }
    }
    // 상한 초과분 컷
    const room = Math.max(0, DAILY_EARN_CAP - dayEarned);
    const amount = Math.min(rule.points, room);
    if (amount <= 0) {
      return { ok: false, awarded: 0, balance: await balanceForFailure(email), reason: "cap" };
    }
    const expires = new Date(now);
    expires.setMonth(expires.getMonth() + POINT_EXPIRY_MONTHS);

    /* 적립도 차감과 같은 자물쇠 안에서 한다(point_ledger_award).
       예전에는 "잔액 조회 → insert" 두 왕복이라, 같은 사용자의 적립과 차감이
       겹치면 나중에 쓰는 쪽이 앞선 쪽의 러닝 잔액을 통째로 덮었다 —
       적립 한 번으로 동시에 일어난 차감을 지워 포인트를 되돌릴 수 있었다. */
    const { data, error } = await sb.rpc("point_ledger_award", {
      p_user_email: email,
      p_amount: amount,
      p_reason: rule.key,
      p_ref_id: refId ?? null,
      p_expires_at: expires.toISOString(),
    });
    if (!error) {
      const r = (data ?? {}) as {
        ok?: boolean;
        awarded?: number;
        balance?: number;
        reason?: string;
      };
      return {
        ok: Boolean(r.ok),
        awarded: Number(r.awarded) || 0,
        balance: Number(r.balance) || 0,
        reason: r.ok ? undefined : (r.reason ?? "error"),
      };
    }
    if (!isMissingRpc(error, "point_ledger_award")) {
      logger.error("[awardPoints] rpc", error);
      return { ok: false, awarded: 0, balance: await balanceForFailure(email), reason: "db" };
    }

    // ── 폴백(비원자): RPC 함수가 아직 없는 환경 전용 ──
    const bal = await getBalance(email);
    const newBal = bal + amount;
    const { error: insertError } = await sb.from("point_ledger").insert({
      user_email: email,
      delta: amount,
      reason: rule.key,
      ref_id: refId ?? null,
      balance: newBal,
      expires_at: expires.toISOString(),
    });
    if (insertError) {
      logger.error("[awardPoints] insert", insertError);
      return { ok: false, awarded: 0, balance: bal, reason: "db" };
    }
    return { ok: true, awarded: amount, balance: newBal };
  } catch (e) {
    logger.error("[awardPoints]", e);
    return { ok: false, awarded: 0, balance: await balanceForFailure(email), reason: "error" };
  }
}

export type SpendResult = {
  ok: boolean;
  spent: number;
  balance: number;
  reason?: string;
};

/** RPC 미배포(마이그레이션 전) 감지 — PostgREST 는 함수를 못 찾으면 PGRST202 를 준다 */
function isMissingRpc(
  error: { code?: string; message?: string } | null,
  fnName = "point_ledger_spend",
): boolean {
  if (!error) return false;
  if (error.code === "PGRST202" || error.code === "42883") return true;
  const msg = error.message ?? "";
  return msg.includes(fnName) && /(not find|not exist|does not exist)/i.test(msg);
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
    return { ok: false, spent: 0, balance: await balanceForFailure(email), reason: "invalid" };
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
      return { ok: false, spent: 0, balance: await balanceForFailure(email), reason: "db" };
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
    return { ok: false, spent: 0, balance: await balanceForFailure(email), reason: "error" };
  }
}
