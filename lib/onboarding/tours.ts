import "server-only";
import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/log";

/**
 * A1 코치마크 투어 진행 상태.
 *
 * 저장 위치는 `app_users.onboarding_progress` JSON 안의 `tours` 배열이다.
 * (별도 컬럼을 만들지 않는 이유 — 추가 마이그레이션 없이 크로스디바이스로 남고,
 *  "온보딩"이라는 같은 맥락의 상태라 한곳에 모으는 게 맞다.)
 *
 * 주의: `completedSteps`(explore·inspection·share)와 섞지 않는다.
 * 그건 200P 완주 리워드의 기준이라, 투어를 봤다는 사실이 거기 끼면
 * 진행바가 3/3 → 3/4 로 밀리고 이미 완주한 사용자가 미완주로 바뀐다.
 * 투어는 "안내를 봤다"는 UI 상태일 뿐 가치 행동이 아니다.
 */

export const TOUR_IDS = ["map"] as const;
export type TourId = (typeof TOUR_IDS)[number];
const TOUR_SET = new Set<string>(TOUR_IDS);

export function isTourId(v: string): v is TourId {
  return TOUR_SET.has(v);
}

/** onboarding_progress JSON 에서 tours 배열만 안전하게 뽑아낸다. */
export function readTours(progress: unknown): TourId[] {
  if (!progress || typeof progress !== "object" || Array.isArray(progress)) return [];
  const raw = (progress as { tours?: unknown }).tours;
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.map(String).filter(isTourId))];
}

/** completedSteps 를 건드리지 않고 tours 만 병합한 새 progress 객체를 만든다. */
export function mergeTours(progress: unknown, tours: TourId[]): Record<string, unknown> {
  const basePayload =
    progress && typeof progress === "object" && !Array.isArray(progress)
      ? { ...(progress as Record<string, unknown>) }
      : {};
  if (tours.length === 0) {
    delete basePayload.tours;
    return basePayload;
  }
  return { ...basePayload, tours };
}

export async function getSeenTours(email: string): Promise<TourId[]> {
  const sb = getServiceSupabase();
  const em = email.trim().toLowerCase();
  if (!sb || !em) return [];
  try {
    const { data } = await sb
      .from("app_users")
      .select("onboarding_progress")
      .eq("email", em)
      .maybeSingle();
    return readTours(data?.onboarding_progress);
  } catch (e) {
    logger.warn("[tours] getSeenTours", e);
    return [];
  }
}

/** 투어 완료 기록. completedSteps·completed_at 은 그대로 둔다. */
export async function markTourSeen(email: string, tour: TourId): Promise<TourId[]> {
  const sb = getServiceSupabase();
  const em = email.trim().toLowerCase();
  if (!sb || !em || !isTourId(tour)) return [];
  try {
    const { data, error } = await sb
      .from("app_users")
      .select("onboarding_progress")
      .eq("email", em)
      .maybeSingle();
    if (error) return [];
    const current = readTours(data?.onboarding_progress);
    if (current.includes(tour)) return current;
    const next = [...current, tour];
    const payload = mergeTours(data?.onboarding_progress, next);
    const { error: upErr } = await sb
      .from("app_users")
      .update({ onboarding_progress: payload })
      .eq("email", em);
    if (upErr) {
      logger.warn("[tours] markTourSeen failed", upErr.message);
      return current;
    }
    return next;
  } catch (e) {
    logger.warn("[tours] markTourSeen", e);
    return [];
  }
}
