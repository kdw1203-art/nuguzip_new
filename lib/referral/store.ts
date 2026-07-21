import "server-only";

import { getReadOnlySupabase } from "@/lib/newui/supabase-read";
import { getServiceSupabase } from "@/lib/supabase/service";
import { awardPoints } from "@/lib/points/ledger";
import { logger } from "@/lib/log";

/**
 * 친구 추천(referral) 저장소.
 *
 * - 코드 발급/조회: referral_codes(user_email PK, code UNIQUE)
 * - 리딤 기록:       referral_redemptions(referee_email UNIQUE)
 *
 * 두 테이블 모두 RLS deny-all → service-role 헬퍼로만 접근한다.
 * 읽기는 getReadOnlySupabase(service 우선), 쓰기는 getServiceSupabase().
 * 포인트 지급은 ledger.awardPoints("referral") — refId 로 중복 방어한다.
 */

/** referral 규칙 포인트 (EARN_RULES.referral 과 동일 — 표시·통계 계산용). */
const REFERRAL_POINTS = 300;
const CODE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"; // [A-Z0-9]
const CODE_LEN = 6;

export type ReferralLookup = { referrerEmail: string };
export type ReferralStats = {
  code: string | null;
  invitedCount: number;
  pointsEarned: number;
};
export type RedeemResult = { ok: boolean; reason?: string; awarded?: number };

/** 코드 정규화 — 대문자 + [A-Z0-9] 만. 링크·쿠키·수기 입력 모두 안전화. */
function normalizeCode(code: string): string {
  return (code ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16);
}

/** FNV-1a 32bit — 이메일에서 "대략 결정적인" 코드 시드를 만들 때 사용. */
function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** seed 로부터 6자리 [A-Z0-9] 코드 생성 (각 자리 독립 해시 → 시드가 바뀌면 완전히 달라짐). */
function makeCode(seed: string): string {
  let out = "";
  for (let i = 0; i < CODE_LEN; i++) {
    const n = hash32(`${seed}#${i}`);
    out += CODE_ALPHABET[n % CODE_ALPHABET.length];
  }
  return out;
}

async function readCodeFor(
  client: NonNullable<ReturnType<typeof getServiceSupabase>>,
  email: string,
): Promise<string | null> {
  const { data } = await client
    .from("referral_codes")
    .select("code")
    .eq("user_email", email)
    .maybeSingle();
  return data?.code ? String(data.code) : null;
}

/**
 * 사용자의 추천 코드를 반환. 없으면 짧은 유니크 코드를 발급 후 반환.
 * 유니크 충돌 시 시드를 바꿔 최대 8회 재시도한다.
 */
export async function getOrCreateCode(email: string): Promise<string | null> {
  if (!email) return null;

  // 1) 기존 코드 (읽기 전용 클라이언트)
  const read = getReadOnlySupabase();
  if (read) {
    const existing = await readCodeFor(read, email);
    if (existing) return existing;
  }

  // 2) 발급 (service-role 쓰기)
  const write = getServiceSupabase();
  if (!write) return null;

  // 경합 대비 재확인 (read 가 anon 이라 못 봤을 수도 있음)
  const already = await readCodeFor(write, email);
  if (already) return already;

  for (let attempt = 0; attempt < 8; attempt++) {
    const seed =
      attempt < 5 ? `${email}|${attempt}` : `${email}|${attempt}|${Math.random()}`;
    const code = makeCode(seed);
    const { data, error } = await write
      .from("referral_codes")
      .insert({ user_email: email, code })
      .select("code")
      .maybeSingle();
    if (!error && data?.code) return String(data.code);
    if (error?.code === "23505") {
      // PK(user_email) 경합이면 이미 발급된 코드 반환, code 충돌이면 다음 시드로 재시도
      const raced = await readCodeFor(write, email);
      if (raced) return raced;
      continue;
    }
    if (error) {
      logger.error("[referral] getOrCreateCode insert", error);
      return null;
    }
  }
  logger.error("[referral] getOrCreateCode: exhausted retries", { email });
  return null;
}

/** 코드로 추천인 이메일을 조회. 없으면 null. */
export async function getReferralByCode(code: string): Promise<ReferralLookup | null> {
  const c = normalizeCode(code);
  if (!c) return null;
  const read = getReadOnlySupabase();
  if (!read) return null;
  const { data, error } = await read
    .from("referral_codes")
    .select("user_email")
    .eq("code", c)
    .maybeSingle();
  if (error || !data?.user_email) return null;
  return { referrerEmail: String(data.user_email) };
}

/** 내 코드 + 초대 성사 수 + 적립 포인트(성사 수 × 300). */
export async function getReferralStats(email: string): Promise<ReferralStats> {
  const code = await getOrCreateCode(email);
  let invitedCount = 0;
  const read = getReadOnlySupabase();
  if (read && email) {
    const { count, error } = await read
      .from("referral_redemptions")
      .select("id", { count: "exact", head: true })
      .eq("referrer_email", email);
    if (!error) invitedCount = count ?? 0;
  }
  return { code, invitedCount, pointsEarned: invitedCount * REFERRAL_POINTS };
}

/**
 * 리딤: 코드의 추천인을 찾아 방어(존재·자기추천 금지·중복 금지) 후
 * 리딤을 기록하고 추천인·피추천인 양쪽에 포인트를 지급한다.
 * unique-violation(23505)은 이미 리딤한 것으로 처리한다.
 */
export async function redeemReferral(
  code: string,
  refereeEmail: string,
): Promise<RedeemResult> {
  try {
    const c = normalizeCode(code);
    if (!c) return { ok: false, reason: "invalid_code" };
    if (!refereeEmail) return { ok: false, reason: "invalid" };

    const ref = await getReferralByCode(c);
    if (!ref) return { ok: false, reason: "invalid_code" };
    const referrerEmail = ref.referrerEmail;

    // 자기 자신 추천 금지
    if (referrerEmail === refereeEmail) return { ok: false, reason: "self" };

    const write = getServiceSupabase();
    if (!write) return { ok: false, reason: "unavailable" };

    // 이미 리딤한 피추천인인지 (referee 당 1회)
    const { data: existing } = await write
      .from("referral_redemptions")
      .select("id")
      .eq("referee_email", refereeEmail)
      .maybeSingle();
    if (existing) return { ok: false, reason: "already" };

    const { error: insErr } = await write.from("referral_redemptions").insert({
      code: c,
      referrer_email: referrerEmail,
      referee_email: refereeEmail,
    });
    if (insErr) {
      // referee_email UNIQUE 위반 = 동시 리딤 → 이미 처리됨
      if (insErr.code === "23505") return { ok: false, reason: "already" };
      logger.error("[referral] redeem insert", insErr);
      return { ok: false, reason: "db" };
    }

    // 양쪽 지급 — refId 로 원장에서 중복 방어
    const [referrerAward, refereeAward] = await Promise.all([
      awardPoints(referrerEmail, "referral", `referee:${refereeEmail}`),
      awardPoints(refereeEmail, "referral", `welcome:${refereeEmail}`),
    ]);
    if (!referrerAward.ok) {
      logger.warn("[referral] referrer award skipped", { reason: referrerAward.reason });
    }
    return { ok: true, awarded: refereeAward.awarded };
  } catch (e) {
    logger.error("[referral] redeemReferral", e);
    return { ok: false, reason: "error" };
  }
}
