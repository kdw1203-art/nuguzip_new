/**
 * 저장 검색(조건 알림) 데이터 액세스.
 *
 * - 읽기: `getReadOnlySupabase()` (Service Role 우선). 클라이언트 null·빈 결과는
 *   빈 배열로 반환한다. 개인 목록이라 샘플 폴백은 두지 않는다(새 유저는 [] 가 정답).
 * - 쓰기: `getServiceSupabase()` (RLS deny-all 이라 service-role 로만 접근).
 * - DB 행(Record<string, unknown>) 은 절대 그대로 신뢰하지 않고 coercion 헬퍼로
 *   좁혀 SavedSearch 로 매핑한다.
 * - 소유자 스코프: 모든 변경은 id + user_email 동시 일치 조건으로만 수행한다.
 */
import "server-only";
import { getReadOnlySupabase } from "@/lib/newui/supabase-read";
import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/log";
import {
  isScope,
  type SavedSearch,
  type SavedSearchScope,
} from "@/lib/saved-search/types";

const TABLE = "saved_searches";
const LABEL_MAX = 80;
const QUERY_MAX = 200;
const LIST_LIMIT = 100;

/* ---------------- coercion 헬퍼 (행 타입 불신) ---------------- */

function asString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : v == null ? fallback : String(v);
}

function asStringOrNull(v: unknown): string | null {
  if (v == null) return null;
  return typeof v === "string" ? v : String(v);
}

function asNumber(v: unknown, fallback = 0): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function asBoolean(v: unknown): boolean {
  return v === true;
}

function asFilters(v: unknown): Record<string, unknown> {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return {};
}

function asScope(v: unknown): SavedSearchScope {
  const s = asString(v, "map");
  return isScope(s) ? s : "map";
}

/** 이메일 정규화 — 쓰기·읽기 키를 일치시켜 소유자 스코프를 안정화한다. */
function normEmail(email: string): string {
  return email.trim().toLowerCase();
}

function rowToSavedSearch(row: Record<string, unknown>): SavedSearch {
  const createdAt = asString(row.created_at, new Date().toISOString());
  return {
    id: asString(row.id),
    userEmail: asString(row.user_email),
    label: asString(row.label),
    query: asString(row.query),
    scope: asScope(row.scope),
    filters: asFilters(row.filters),
    alertEnabled: asBoolean(row.alert_enabled),
    lastCheckedAt: asStringOrNull(row.last_checked_at),
    lastMatchCount: asNumber(row.last_match_count),
    createdAt,
    updatedAt: asStringOrNull(row.updated_at),
  };
}

/* ---------------- 읽기 ---------------- */

/** 사용자의 저장 검색 목록(최신순, 최대 100건). 미설정·빈 결과·오류 시 []. */
export async function listSavedSearches(email: string): Promise<SavedSearch[]> {
  const owner = normEmail(email);
  if (!owner) return [];

  const sb = getReadOnlySupabase();
  if (!sb) return [];

  try {
    const { data, error } = await sb
      .from(TABLE)
      .select("*")
      .eq("user_email", owner)
      .order("created_at", { ascending: false })
      .limit(LIST_LIMIT);

    if (error) {
      logger.error("[saved-search] listSavedSearches", error);
      return [];
    }
    if (!Array.isArray(data)) return [];
    return data.map((r) => rowToSavedSearch(r as Record<string, unknown>));
  } catch (e) {
    logger.error("[saved-search] listSavedSearches", e);
    return [];
  }
}

/* ---------------- 쓰기 ---------------- */

/** 저장 검색 1건 생성. label 80자·query 200자 캡. */
export async function createSavedSearch(input: {
  email: string;
  label: string;
  query: string;
  scope: SavedSearchScope;
  filters: Record<string, unknown>;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const owner = normEmail(input.email);
  if (!owner) return { ok: false, error: "로그인이 필요합니다." };

  const label = input.label.trim().slice(0, LABEL_MAX);
  if (!label) return { ok: false, error: "검색 이름을 입력해 주세요." };

  const query = input.query.trim().slice(0, QUERY_MAX);
  const scope: SavedSearchScope = isScope(input.scope) ? input.scope : "map";
  const filters =
    input.filters && typeof input.filters === "object" && !Array.isArray(input.filters)
      ? input.filters
      : {};

  const sb = getServiceSupabase();
  if (!sb) return { ok: false, error: "저장소를 사용할 수 없습니다." };

  try {
    const { data, error } = await sb
      .from(TABLE)
      .insert({ user_email: owner, label, query, scope, filters })
      .select("id")
      .single();

    if (error) {
      logger.error("[saved-search] createSavedSearch", error);
      return { ok: false, error: "저장에 실패했습니다." };
    }
    const id =
      data && typeof data === "object"
        ? asString((data as Record<string, unknown>).id)
        : "";
    return { ok: true, id: id || undefined };
  } catch (e) {
    logger.error("[saved-search] createSavedSearch", e);
    return { ok: false, error: "저장에 실패했습니다." };
  }
}

/** 알림 on/off 토글 — id + user_email 동시 일치(소유자 스코프)로만 갱신. */
export async function setAlertEnabled(
  email: string,
  id: string,
  enabled: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const owner = normEmail(email);
  const targetId = id.trim();
  if (!owner || !targetId) return { ok: false, error: "잘못된 요청입니다." };

  const sb = getServiceSupabase();
  if (!sb) return { ok: false, error: "저장소를 사용할 수 없습니다." };

  try {
    const { error } = await sb
      .from(TABLE)
      .update({ alert_enabled: enabled, updated_at: new Date().toISOString() })
      .eq("id", targetId)
      .eq("user_email", owner);

    if (error) {
      logger.error("[saved-search] setAlertEnabled", error);
      return { ok: false, error: "변경에 실패했습니다." };
    }
    return { ok: true };
  } catch (e) {
    logger.error("[saved-search] setAlertEnabled", e);
    return { ok: false, error: "변경에 실패했습니다." };
  }
}

/** 저장 검색 삭제 — id + user_email 동시 일치(소유자 스코프)로만 삭제. */
export async function deleteSavedSearch(
  email: string,
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  const owner = normEmail(email);
  const targetId = id.trim();
  if (!owner || !targetId) return { ok: false, error: "잘못된 요청입니다." };

  const sb = getServiceSupabase();
  if (!sb) return { ok: false, error: "저장소를 사용할 수 없습니다." };

  try {
    const { error } = await sb
      .from(TABLE)
      .delete()
      .eq("id", targetId)
      .eq("user_email", owner);

    if (error) {
      logger.error("[saved-search] deleteSavedSearch", error);
      return { ok: false, error: "삭제에 실패했습니다." };
    }
    return { ok: true };
  } catch (e) {
    logger.error("[saved-search] deleteSavedSearch", e);
    return { ok: false, error: "삭제에 실패했습니다." };
  }
}
