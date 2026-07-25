import "server-only";

import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/log";
import { assignVariant } from "./assign";
import { controlVariant, getExperiment } from "./registry";

/**
 * A7 — 서버 쪽 실험 유틸.
 *
 * 로그인 사용자는 이메일(소문자)이 subject 다. 기기가 바뀌어도 같은 변형을 본다.
 * 비로그인은 브라우저 localStorage 익명 ID 가 subject 이고, 그 값은 클라이언트가
 * 이벤트에 실어 보낸다(lib/experiments/client.tsx 참고).
 */

/** 익명 subject 키 형식 — 클라이언트가 보낸 값을 그대로 믿지 않기 위한 검증 */
const ANON_SUBJECT_RE = /^[a-z0-9-]{8,64}$/;

export function normalizeSubject(input: {
  userEmail?: string | null;
  anonId?: string | null;
}): { key: string; kind: "user" | "anon" } | null {
  const email = input.userEmail?.trim().toLowerCase();
  if (email) return { key: email, kind: "user" };
  const anon = input.anonId?.trim().toLowerCase();
  if (anon && ANON_SUBJECT_RE.test(anon)) return { key: anon, kind: "anon" };
  return null;
}

/** 서버에서 변형을 정한다. subject 를 모르면 대조군. */
export function variantForSubject(
  experimentKey: string,
  subject: { key: string } | null,
): string {
  return assignVariant(experimentKey, subject?.key ?? null);
}

/**
 * 노출 기록. 이벤트 자체는 platform_activity_events 에 남고, 이 함수는 "누가 어떤
 * 통에 들어갔는지"를 experiment_assignments 에 누적한다.
 *
 * 실패해도 조용히 넘어간다 — 계측이 사용자 동작을 막으면 안 된다. 다만 로그는 남긴다.
 */
export async function recordExposure(input: {
  experimentKey: string;
  variant: string;
  subject: { key: string; kind: "user" | "anon" };
}): Promise<void> {
  const def = getExperiment(input.experimentKey);
  if (!def) return; // 등록부에 없는 키는 기록하지 않는다 — 오타로 표가 늘어나는 걸 막는다
  const known = def.variants.some((v) => v.key === input.variant);
  if (!known) return;

  const sb = getServiceSupabase();
  if (!sb) return;

  const { error } = await sb.rpc("record_experiment_exposure", {
    p_experiment_key: input.experimentKey,
    p_subject_key: input.subject.key,
    p_subject_kind: input.subject.kind,
    p_variant: input.variant,
  });
  if (error) logger.warn("[experiments] recordExposure", error.message);
}

/**
 * 이벤트에 실어 저장할 실험 태그를 정리한다.
 *
 * 클라이언트가 보낸 값을 그대로 쓰지 않는 이유: 등록부에 없는 실험 키나 변형이
 * 섞여 들어오면 결과 집계가 조용히 오염된다. 모르는 값은 버린다.
 */
export function sanitizeExperimentTag(
  experimentKey: unknown,
  variant: unknown,
): { experimentKey: string; variant: string } | null {
  if (typeof experimentKey !== "string" || typeof variant !== "string") return null;
  const def = getExperiment(experimentKey.trim());
  if (!def) return null;
  const v = variant.trim();
  if (!def.variants.some((x) => x.key === v)) return null;
  return { experimentKey: def.key, variant: v };
}

export { controlVariant };
