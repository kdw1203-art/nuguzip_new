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

/**
 * 가입 화면에서 고른 기본 정보(나이대·성별·가구·직업·생애최초·보유 주택).
 *
 * 왜 여기 들어왔나: /signup 은 이 6줄을 "맞춤 추천에 사용 · 나중에 수정 가능"
 * 이라고 적어 놓고 물었지만, 제출 시 /api/auth/register 로 보내는 필드에
 * 없어서 통째로 버려지고 있었다. 약속한 대로 쓰려면 우선 저장부터 해야 한다.
 * jsonb 블롭 안이라 스키마 변경 없이 붙는다.
 */
export type OnboardingProfile = Record<string, string>;

export type OnboardingPersonalization = {
  regions: string[];
  budget: OnboardingBudget | null;
  purpose: PurposeId | null;
  /** 가입 화면 기본 정보 — 고르지 않았으면 null */
  profile: OnboardingProfile | null;
  updatedAt: string | null;
};

/** 저장을 허용하는 기본 정보 항목과 값 — 임의 문자열 저장을 막는다. */
const PROFILE_OPTIONS: Record<string, readonly string[]> = {
  나이대: ["20대", "30대", "40대", "50대+"],
  성별: ["남", "여"],
  가구: ["1인 거주", "2인 거주", "3인 이상"],
  직업: ["직장인", "사업자", "법인"],
  생애최초: ["해당", "비해당"],
  "보유 주택": ["무주택", "1주택", "2주택+"],
};

export function sanitizeProfile(input: unknown): OnboardingProfile | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const o = input as Record<string, unknown>;
  const out: OnboardingProfile = {};
  for (const [key, allowed] of Object.entries(PROFILE_OPTIONS)) {
    const v = o[key];
    if (typeof v === "string" && (allowed as readonly string[]).includes(v)) out[key] = v;
  }
  return Object.keys(out).length > 0 ? out : null;
}

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

/** user_personalization(email PK)에서 온보딩 개인화 조회. 없으면 null (graceful).
 *  (구 app_users.personalization 은 app_users 가 비어 upsert 불가 → 전용 테이블로 이전) */
export async function getOnboardingPersonalization(
  email: string,
): Promise<OnboardingPersonalization | null> {
  const sb = getServiceSupabase();
  if (!sb) return null;
  const { data, error } = await sb
    .from("user_personalization")
    .select("personalization")
    .eq("email", normEmail(email))
    .maybeSingle();
  if (error || !data) return null;
  return parse((data as Record<string, unknown>).personalization);
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
