import { fetchAppUserByEmail } from "@/lib/auth/fetch-app-user";
import { monthlyLimitsAsPlanTiers } from "@/lib/subscriptions/access";
import { normalizePlanToGate, type PlanTier } from "@/lib/subscriptions/access-gate";
import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/log";

/* FEATURE_RULES.ai_inspection_note 에서 유도 — 한도 숫자의 단일 출처.
   예전엔 여기(free 3 · pro 20)와 access.ts(basic 2 · pro 30)가 서로 다른
   숫자를 말했다. 요금제 안내가 말한 숫자와 실제로 부딪히는 숫자가 다르면
   벽이 가격 신호가 아니라 버그로 읽힌다(항목 35). */
export const AI_REPORT_LIMITS: Record<PlanTier, number | null> =
  monthlyLimitsAsPlanTiers("ai_inspection_note");

/* [944] AI 초안·예습 브리핑 — 정리 리포트와 별도 카운터(draft_count). */
export const AI_DRAFT_LIMITS: Record<PlanTier, number | null> =
  monthlyLimitsAsPlanTiers("ai_note_draft");

export async function getUserPlanTier(email: string): Promise<PlanTier> {
  const profile = await fetchAppUserByEmail(email);
  return normalizePlanToGate(profile.plan);
}

function currentYyyymm(): string {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * 이번 달 AI 리포트 사용 횟수.
 *
 * **조회에 실패하면 던진다.** 예전에는 error 를 받지 않아 실패가 곧 `0` 이었다.
 * 0 은 "이번 달에 한 번도 안 썼다"는 사실인데, DB 가 몇 초 밀리는 동안 한도를
 * 이미 다 쓴 사용자도 이 값을 받았다 — 한도가 통째로 풀리는 길이었고,
 * AI 리포트는 호출마다 비용이 나가는 기능이다.
 *
 * 행이 없는 것(= 이번 달 첫 사용)은 error 없이 data=null 로 오므로 그대로 0 이다.
 */
export async function getMonthlyReportUsage(email: string): Promise<number> {
  const sb = getServiceSupabase();
  /* 서비스 키가 없으면: 로컬에서만 관대하게(한도를 세지 않음), 프로덕션에서는
     fail-closed. 키가 미설정/회전된 채로 0("한 번도 안 씀")을 돌려주면 과금
     대상 AI 기능이 조용히 무제한 무료가 된다 — 설정 사고가 비용 사고가 된다. */
  if (!sb) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "SUPABASE_SERVICE_ROLE_KEY 미설정 — 사용량을 셀 수 없어 AI 한도 판정을 중단합니다.",
      );
    }
    return 0;
  }
  const { data, error } = await sb
    .from("inspection_ai_usage")
    .select("report_count")
    .eq("author_email", email.trim().toLowerCase())
    .eq("yyyymm", currentYyyymm())
    .maybeSingle();
  if (error) throw new Error(`inspection_ai_usage 조회 실패: ${error.message}`);
  return Number(data?.report_count ?? 0);
}

export async function checkReportQuota(email: string): Promise<{
  allowed: boolean;
  used: number;
  limit: number | null;
  plan: PlanTier;
}> {
  const plan = await getUserPlanTier(email);
  const limit = AI_REPORT_LIMITS[plan];
  const used = await getMonthlyReportUsage(email);
  if (limit === null) return { allowed: true, used, limit, plan };
  return { allowed: used < limit, used, limit, plan };
}

/**
 * 사용 횟수 +1.
 *
 * 여기서 실패하면 리포트는 나갔는데 카운트가 안 올라간다 — 사용자에게는
 * 아무 문제가 없어 보이지만, 다음 요청은 실제보다 적은 사용량을 보게 된다.
 * 되돌릴 수 없는 일(이미 생성된 리포트)이므로 던지지는 않되, **조용히 넘기지
 * 않는다.** 예전 코드는 세 개의 error 를 전부 버려서 어긋난 기록이 남지 않았다.
 */
export async function incrementReportUsage(email: string): Promise<void> {
  const sb = getServiceSupabase();
  if (!sb) return;
  const normalized = email.trim().toLowerCase();
  const yyyymm = currentYyyymm();
  const { data: existing, error: readError } = await sb
    .from("inspection_ai_usage")
    .select("id, report_count")
    .eq("author_email", normalized)
    .eq("yyyymm", yyyymm)
    .maybeSingle();
  if (readError) {
    /* 여기서 못 읽었다고 insert 로 넘어가면 안 된다 — 이미 행이 있는데 또 넣으면
       충돌하거나(유니크 제약) 사용량이 갈라진다. 기록만 남기고 물러난다. */
    logger.error("[quota] inspection_ai_usage 조회 실패 — 사용량 증가 생략:", readError.message);
    return;
  }
  if (existing?.id) {
    const { error } = await sb
      .from("inspection_ai_usage")
      .update({ report_count: Number(existing.report_count ?? 0) + 1 })
      .eq("id", existing.id);
    if (error) logger.error("[quota] 사용량 증가 실패:", error.message);
  } else {
    const { error } = await sb.from("inspection_ai_usage").insert({
      author_email: normalized,
      yyyymm,
      report_count: 1,
    });
    if (error) logger.error("[quota] 사용량 기록 실패:", error.message);
  }
}

/* ── [944] AI 초안 쿼터 — 리포트(report_count)와 같은 규약, 다른 열(draft_count) ── */

export async function getMonthlyDraftUsage(email: string): Promise<number> {
  const sb = getServiceSupabase();
  if (!sb) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "SUPABASE_SERVICE_ROLE_KEY 미설정 — 사용량을 셀 수 없어 AI 초안 한도 판정을 중단합니다.",
      );
    }
    return 0;
  }
  const { data, error } = await sb
    .from("inspection_ai_usage")
    .select("draft_count")
    .eq("author_email", email.trim().toLowerCase())
    .eq("yyyymm", currentYyyymm())
    .maybeSingle();
  if (error) throw new Error(`inspection_ai_usage 조회 실패: ${error.message}`);
  return Number(data?.draft_count ?? 0);
}

export async function checkDraftQuota(email: string): Promise<{
  allowed: boolean;
  used: number;
  limit: number | null;
  plan: PlanTier;
}> {
  const plan = await getUserPlanTier(email);
  const limit = AI_DRAFT_LIMITS[plan];
  const used = await getMonthlyDraftUsage(email);
  if (limit === null) return { allowed: true, used, limit, plan };
  return { allowed: used < limit, used, limit, plan };
}

export async function incrementDraftUsage(email: string): Promise<void> {
  const sb = getServiceSupabase();
  if (!sb) return;
  const normalized = email.trim().toLowerCase();
  const yyyymm = currentYyyymm();
  const { data: existing, error: readError } = await sb
    .from("inspection_ai_usage")
    .select("id, draft_count")
    .eq("author_email", normalized)
    .eq("yyyymm", yyyymm)
    .maybeSingle();
  if (readError) {
    logger.error("[quota] inspection_ai_usage 조회 실패 — 초안 사용량 증가 생략:", readError.message);
    return;
  }
  if (existing?.id) {
    const { error } = await sb
      .from("inspection_ai_usage")
      .update({ draft_count: Number(existing.draft_count ?? 0) + 1 })
      .eq("id", existing.id);
    if (error) logger.error("[quota] 초안 사용량 증가 실패:", error.message);
  } else {
    const { error } = await sb.from("inspection_ai_usage").insert({
      author_email: normalized,
      yyyymm,
      draft_count: 1,
    });
    if (error) logger.error("[quota] 초안 사용량 기록 실패:", error.message);
  }
}
