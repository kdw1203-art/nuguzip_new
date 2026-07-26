import "server-only";

import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/log";
import { EXPERIMENTS, type ExperimentDef } from "./registry";

/**
 * A7 — 실험 결과 집계.
 *
 * ── 무엇을 비율의 분모로 쓰는가 ─────────────────────────────────────
 * 분모는 **노출 이벤트 수**, 분자는 **전환 이벤트 수**다. 즉 "본 횟수당 누른 횟수"
 * (CTR)다. 한 사람이 여러 번 볼 수 있으므로 "사람당 전환율"이 아니다. 두 이름은
 * 값이 다르고, 어느 쪽인지 안 밝히면 읽는 사람이 반드시 오해한다.
 *
 * 사람 단위로 못 세는 이유: 비로그인 노출은 이벤트에 이메일이 없다. 익명 ID 는
 * experiment_assignments 에만 있고 이벤트에는 싣지 않는다(이벤트 표에 브라우저
 * 식별자를 쌓아 두지 않으려는 의도적 선택). 그래서 배정 subject 수는 따로 보여주고,
 * 비율은 이벤트 기준이라고 화면에 그대로 적는다.
 *
 * ── 유의성 ─────────────────────────────────────────────────────────
 * 표본이 모자라면 p 값을 아예 계산하지 않는다. n=2 에 p 값을 붙이면 숫자가 있다는
 * 이유만으로 결론이 서 버린다. 최소 기준(MIN_EXPOSURES_PER_VARIANT,
 * MIN_CONVERSIONS_PER_VARIANT)을 못 넘기면 "표본 부족"이라고만 말한다.
 */

/** 이 밑에서는 비교하지 않는다 — 흔한 관행값(변형당 노출 100·전환 5) */
export const MIN_EXPOSURES_PER_VARIANT = 100;
export const MIN_CONVERSIONS_PER_VARIANT = 5;

type ResultRow = {
  experiment_key: string;
  variant: string;
  event_name: string;
  event_count: number | string;
  user_count: number | string;
  first_at: string | null;
  last_at: string | null;
};

type AssignmentRow = {
  experiment_key: string;
  variant: string;
  subjects: number | string;
  user_subjects: number | string;
  exposures: number | string;
  variant_conflicts: number | string;
  first_assigned_at: string | null;
  last_seen_at: string | null;
};

export type VariantResult = {
  key: string;
  label: string;
  /** 이 변형이 대조군인가 */
  isControl: boolean;
  /** 노출 이벤트 수 (분모) */
  exposures: number;
  /** 전환 이벤트 수 (분자) */
  conversions: number;
  /** conversions / exposures. 노출이 0이면 null — 0% 라고 말하지 않는다 */
  rate: number | null;
  /** 이 변형에 배정된 subject 수 (사람/브라우저 단위) */
  subjects: number;
  /** 그중 로그인 사용자 */
  userSubjects: number;
  /** 다른 변형으로 다시 배정된 횟수 — 0이 아니면 결과가 깨끗하지 않다 */
  variantConflicts: number;
};

export type ExperimentResult = {
  def: ExperimentDef;
  variants: VariantResult[];
  totalExposures: number;
  totalConversions: number;
  firstAt: string | null;
  lastAt: string | null;
  /** 비교해도 되는 표본인가 */
  hasEnoughSample: boolean;
  /** 표본이 충분할 때만 채워진다 */
  comparison: {
    /** 대조군 대비 상대 변화율 (예: 0.12 = 12% 개선) */
    lift: number | null;
    /** 양측 p 값 (2-비율 z 검정, 정규근사) */
    pValue: number | null;
    /** 우리가 세는 단위가 사람이 아니라 이벤트라서 독립성 가정이 근사임을 표시 */
    caveat: string;
  } | null;
};

function num(v: number | string | null | undefined): number {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

/** 표준정규 누적분포 — Abramowitz & Stegun 7.1.26 erf 근사 */
function normalCdf(z: number): number {
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t +
      0.254829592) *
      t *
      Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
}

/** 2-비율 z 검정(양측). 어느 쪽이든 분모가 0이면 null. */
export function twoProportionPValue(
  aConv: number,
  aExp: number,
  bConv: number,
  bExp: number,
): number | null {
  if (aExp <= 0 || bExp <= 0) return null;
  const p1 = aConv / aExp;
  const p2 = bConv / bExp;
  const pooled = (aConv + bConv) / (aExp + bExp);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / aExp + 1 / bExp));
  if (!Number.isFinite(se) || se === 0) return null;
  const z = (p2 - p1) / se;
  return 2 * (1 - normalCdf(Math.abs(z)));
}

export async function loadExperimentResults(): Promise<ExperimentResult[]> {
  /* 2026-07-26: 여기서 실패를 삼켰다. 클라이언트를 못 만들면 "노출 0 · 전환 0"
     인 빈 결과를 그대로 돌려주고, 쿼리가 깨지면 logger.warn 만 남기고 역시 빈
     행으로 계산했다. 그러면 /admin/experiments 는 "표본이 아직 안 모였어요"
     라고 말한다 — 실험이 돌고 있는데도 결과가 없는 것처럼 보이고, 반대로
     "이 실험은 효과가 없다"는 잘못된 판단으로 이어진다. 조회 실패는 표본 0이
     아니다. 던져서 호출부가 구분하게 한다. */
  const sb = getServiceSupabase();
  if (!sb) {
    throw new Error(
      "[experiments] Supabase 서비스 클라이언트를 만들 수 없습니다 (SUPABASE_SERVICE_ROLE_KEY 누락)",
    );
  }

  const [events, assignments] = await Promise.all([
    sb
      .from("experiment_results_source")
      .select("experiment_key, variant, event_name, event_count, user_count, first_at, last_at"),
    sb
      .from("experiment_assignment_stats")
      .select(
        "experiment_key, variant, subjects, user_subjects, exposures, variant_conflicts, first_assigned_at, last_seen_at",
      ),
  ]);

  /* 한쪽만 실패해도 던진다 — 노출은 읽히고 배정만 실패하면 "노출 1,200 · 대상자
     0명" 같은 앞뒤가 안 맞는 수치가 사실인 것처럼 표에 박힌다. */
  if (events.error) {
    logger.error("[experiments] 실험 이벤트 집계 조회 실패", events.error.message);
    throw new Error(`experiment_results_source 조회 실패: ${events.error.message}`);
  }
  if (assignments.error) {
    logger.error("[experiments] 실험 배정 집계 조회 실패", assignments.error.message);
    throw new Error(`experiment_assignment_stats 조회 실패: ${assignments.error.message}`);
  }
  if (!Array.isArray(events.data)) throw new Error("experiment_results_source 응답이 배열이 아닙니다");
  if (!Array.isArray(assignments.data))
    throw new Error("experiment_assignment_stats 응답이 배열이 아닙니다");

  const eventRows = events.data as ResultRow[];
  const assignRows = assignments.data as AssignmentRow[];

  return EXPERIMENTS.map((def) => {
    const mine = eventRows.filter((r) => r.experiment_key === def.key);
    const myAssign = assignRows.filter((r) => r.experiment_key === def.key);

    const variants: VariantResult[] = def.variants.map((v, i) => {
      const exposureRow = mine.find(
        (r) => r.variant === v.key && r.event_name === def.exposureEvent,
      );
      const convRow = mine.find(
        (r) => r.variant === v.key && r.event_name === def.primaryMetricEvent,
      );
      const a = myAssign.find((r) => r.variant === v.key);
      const exposures = num(exposureRow?.event_count);
      const conversions = num(convRow?.event_count);
      return {
        key: v.key,
        label: v.label,
        isControl: i === 0,
        exposures,
        conversions,
        rate: exposures > 0 ? conversions / exposures : null,
        subjects: num(a?.subjects),
        userSubjects: num(a?.user_subjects),
        variantConflicts: num(a?.variant_conflicts),
      };
    });

    const stamps = mine.flatMap((r) => [r.first_at, r.last_at]).filter(Boolean) as string[];
    stamps.sort();

    const control = variants[0];
    const challenger = variants[1];
    const hasEnoughSample = variants.every(
      (v) =>
        v.exposures >= MIN_EXPOSURES_PER_VARIANT &&
        v.conversions >= MIN_CONVERSIONS_PER_VARIANT,
    );

    let comparison: ExperimentResult["comparison"] = null;
    if (hasEnoughSample && control && challenger && control.rate !== null && challenger.rate !== null) {
      comparison = {
        lift: control.rate > 0 ? (challenger.rate - control.rate) / control.rate : null,
        pValue: twoProportionPValue(
          control.conversions,
          control.exposures,
          challenger.conversions,
          challenger.exposures,
        ),
        caveat:
          "분모가 사람이 아니라 노출 이벤트다. 한 사람이 여러 번 노출될 수 있어 독립성 가정이 근사이며, p 값은 실제보다 작게(=유의해 보이게) 나올 수 있다.",
      };
    }

    return {
      def,
      variants,
      totalExposures: variants.reduce((s, v) => s + v.exposures, 0),
      totalConversions: variants.reduce((s, v) => s + v.conversions, 0),
      firstAt: stamps[0] ?? null,
      lastAt: stamps[stamps.length - 1] ?? null,
      hasEnoughSample,
      comparison,
    };
  });
}
/* emptyResult() 는 여기 있던 헬퍼였는데, 유일한 호출부가 "Supabase 클라이언트를
   못 만들면 전 실험을 노출 0·전환 0 으로 돌려준다" 는 자리였다. 그 자리를 throw 로
   바꾸면서 호출부가 사라졌다 — 빈 결과를 만들어 내는 함수가 남아 있으면 다음에
   누군가 또 같은 방식으로 실패를 덮게 되므로 같이 지운다. */
