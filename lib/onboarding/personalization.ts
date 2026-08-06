/**
 * 온보딩 개인화 저장소 — 관심 지역·예산대·목적.
 *
 * 스키마 변경 없이 기존 `app_users.personalization`(jsonb) 컬럼에 JSON 블롭으로 영속한다.
 *   { regions: string[], budget: {type,min,max,label} | null, purpose, updatedAt }
 * (persona 우선순위는 user_preferences.priorities 에 별도 저장 — 충돌 없음)
 *
 * service-role 쓰기. 비로그인/미설정/오류는 모두 흡수(graceful).
 */
import "server-only";
import { getServiceSupabase } from "@/lib/supabase/service";
import { regionIdForName } from "@/lib/region/catalog";
import { logger } from "@/lib/log";
import {
  sanitizeProfile,
  type OnboardingProfile,
} from "@/lib/onboarding/profile-options";

export {
  PROFILE_OPTIONS,
  sanitizeProfile,
  type OnboardingProfile,
} from "@/lib/onboarding/profile-options";

/** 매매 / 전세 */
export type BudgetType = "sale" | "jeonse";

export type OnboardingBudget = {
  type: BudgetType;
  /** 억 단위 하한 (null = 제한 없음) */
  min: number | null;
  /** 억 단위 상한 (null = 제한 없음) */
  max: number | null;
  /** 표시용 라벨 (예: "6~9억") */
  label: string | null;
};

/** 실거주 / 투자 / 전세 */
export type PurposeId = "live" | "invest" | "jeonse";

export type OnboardingPersonalization = {
  regions: string[];
  budget: OnboardingBudget | null;
  purpose: PurposeId | null;
  /** 가입 화면 기본 정보 — 고르지 않았으면 null */
  profile: OnboardingProfile | null;
  updatedAt: string | null;
};

/** 관심지역 → 지역 허브 id·구 이름 해석 결과 (홈 퀵링크용) */
export type ResolvedRegion = {
  name: string;
  /** /region/[id] 허브 id (매칭 실패 시 null) */
  regionId: string | null;
  /** /listings?gu= 에 쓰는 구/시 이름 */
  gu: string;
};

const PURPOSE_SET = new Set<PurposeId>(["live", "invest", "jeonse"]);
const BUDGET_TYPE_SET = new Set<BudgetType>(["sale", "jeonse"]);
const MAX_REGIONS = 3;
const MAX_REGION_LEN = 30;

function normEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normNum(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function sanitizeRegions(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    const s = String(raw ?? "")
      .trim()
      .replace(/\s+/g, " ");
    if (!s || s.length > MAX_REGION_LEN || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
    if (out.length >= MAX_REGIONS) break;
  }
  return out;
}

export function sanitizeBudget(input: unknown): OnboardingBudget | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  const type = o.type;
  if (typeof type !== "string" || !BUDGET_TYPE_SET.has(type as BudgetType)) return null;
  const label = typeof o.label === "string" ? o.label.slice(0, 20) : null;
  return { type: type as BudgetType, min: normNum(o.min), max: normNum(o.max), label };
}

export function sanitizePurpose(input: unknown): PurposeId | null {
  return typeof input === "string" && PURPOSE_SET.has(input as PurposeId)
    ? (input as PurposeId)
    : null;
}

function parse(raw: unknown): OnboardingPersonalization | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const regions = sanitizeRegions(o.regions);
  const budget = sanitizeBudget(o.budget);
  const purpose = sanitizePurpose(o.purpose);
  const profile = sanitizeProfile(o.profile);
  if (regions.length === 0 && !budget && !purpose && !profile) return null;
  return {
    regions,
    budget,
    purpose,
    profile,
    updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : null,
  };
}

/** 관심지역명("서울 강남구")에서 /listings?gu= 에 쓸 구/시 토큰 추출. */
export function guOf(name: string): string {
  const tokens = name.trim().split(/\s+/).filter(Boolean);
  const gu = tokens.find((t) => /구$/.test(t));
  if (gu) return gu;
  const si = tokens.find((t) => /시$/.test(t));
  if (si) return si;
  return tokens[tokens.length - 1] ?? name;
}

/** 관심지역명 배열 → 허브 id·구 이름 해석 (서버 전용, 홈 퀵링크용). */
export function resolveRegions(regions: string[]): ResolvedRegion[] {
  return regions.map((name) => ({
    name,
    regionId: regionIdForName(name),
    gu: guOf(name),
  }));
}

/** 개인화 조회 결과 — "설정 안 함"과 "못 읽었음"을 구분한다.
 *  status:"ok" + value:null 은 **정말로 설정한 적이 없는 사람**이고,
 *  status:"error" 는 DB/설정 문제로 **알 수 없는** 상태다. 둘을 한 개의
 *  null 로 뭉개면 이미 설정한 사람이 장애 때 "관심 지역을 알려주세요"를
 *  보게 된다 — 없는 안내보다 틀린 안내가 나쁘다. */
export type PersonalizationLoad =
  | { status: "ok"; value: OnboardingPersonalization | null }
  | { status: "error" };

/** user_personalization(email PK)에서 온보딩 개인화 조회 (실패/미설정 구분).
 *  (구 app_users.personalization 은 app_users 가 비어 upsert 불가 → 전용 테이블로 이전)
 *
 *  service 클라이언트가 없는 경우도 error 다 — 키가 없으면 "설정이 없다"가
 *  아니라 "물어볼 데가 없다"이고, 그건 모르는 것이지 비어 있는 게 아니다. */
export async function loadOnboardingPersonalization(
  email: string,
): Promise<PersonalizationLoad> {
  const sb = getServiceSupabase();
  if (!sb) return { status: "error" };
  const { data, error } = await sb
    .from("user_personalization")
    .select("personalization")
    .eq("email", normEmail(email))
    .maybeSingle();
  if (error) {
    logger.warn("[onboarding] load personalization failed", error.message);
    return { status: "error" };
  }
  if (!data) return { status: "ok", value: null };
  return {
    status: "ok",
    value: parse((data as Record<string, unknown>).personalization),
  };
}

/** 위 조회의 흡수형 — 실패도 null 로 접는다.
 *  실패와 미설정을 구분해야 하는 화면(홈 개인화)은 위 loadOnboardingPersonalization
 *  을 직접 쓴다. 조회 경로는 한 곳뿐이라 두 함수가 갈라질 일이 없다. */
export async function getOnboardingPersonalization(
  email: string,
): Promise<OnboardingPersonalization | null> {
  const res = await loadOnboardingPersonalization(email);
  return res.status === "ok" ? res.value : null;
}

/** 온보딩 개인화 저장(전체 덮어쓰기) — email 기준 upsert. 실패는 흡수. */
export async function saveOnboardingPersonalization(
  email: string,
  input: { regions?: unknown; budget?: unknown; purpose?: unknown; profile?: unknown },
): Promise<OnboardingPersonalization> {
  const value: OnboardingPersonalization = {
    regions: sanitizeRegions(input.regions),
    budget: sanitizeBudget(input.budget),
    purpose: sanitizePurpose(input.purpose),
    profile: sanitizeProfile(input.profile),
    updatedAt: new Date().toISOString(),
  };
  const sb = getServiceSupabase();
  if (!sb) return value;
  const { error } = await sb
    .from("user_personalization")
    .upsert(
      { email: normEmail(email), personalization: value, updated_at: value.updatedAt },
      { onConflict: "email" },
    );
  if (error) logger.warn("[onboarding] save personalization failed", error.message);
  return value;
}
