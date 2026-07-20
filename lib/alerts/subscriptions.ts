/**
 * 알림 구독 (#47) — 지역/키워드 알림 구독 저장소.
 *
 * 스키마 변경 없이 기존 `user_watchlist` 테이블을 재사용한다:
 *   - complex_id  = "alert:region:<값>" | "alert:keyword:<값>"  (유니크 키 user_email,complex_id)
 *   - complex_name = 표시 라벨 ("지역 · 서울" / "키워드 · 재건축")
 * 일반 관심 단지 행과 섞이지 않도록 `alert:` 접두사로 구분하며,
 * lib/watchlist/store-db 의 목록/카운트 쿼리는 `alert:%` 행을 제외한다.
 */
import "server-only";
import { getServiceSupabase } from "@/lib/supabase/service";

export const ALERT_PREFIX = "alert:";
export const MAX_ALERT_SUBSCRIPTIONS = 20;
export const MAX_ALERT_VALUE_LENGTH = 30;

export type AlertSubscriptionType = "region" | "keyword";

export interface AlertSubscription {
  id: string;
  type: AlertSubscriptionType;
  value: string;
  label: string;
  createdAt: string;
}

function normEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function normalizeAlertValue(raw: unknown): string {
  return String(raw ?? "").trim().replace(/\s+/g, " ");
}

export function isValidAlertType(t: unknown): t is AlertSubscriptionType {
  return t === "region" || t === "keyword";
}

function keyOf(type: AlertSubscriptionType, value: string): string {
  return `${ALERT_PREFIX}${type}:${value}`;
}

function labelOf(type: AlertSubscriptionType, value: string): string {
  return type === "region" ? `지역 · ${value}` : `키워드 · ${value}`;
}

function rowToSubscription(r: Record<string, unknown>): AlertSubscription | null {
  const key = String(r.complex_id ?? "");
  if (!key.startsWith(ALERT_PREFIX)) return null;
  const rest = key.slice(ALERT_PREFIX.length);
  const sep = rest.indexOf(":");
  if (sep <= 0) return null;
  const type = rest.slice(0, sep);
  const value = rest.slice(sep + 1);
  if (!isValidAlertType(type) || !value) return null;
  return {
    id: String(r.id),
    type,
    value,
    label: String(r.complex_name ?? labelOf(type, value)),
    createdAt: String(r.created_at ?? ""),
  };
}

/** 세션 사용자의 알림 구독 목록 (최신순). 실패 시 빈 배열. */
export async function listAlertSubscriptions(userEmail: string): Promise<AlertSubscription[]> {
  const sb = getServiceSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from("user_watchlist")
    .select("id, complex_id, complex_name, created_at")
    .eq("user_email", normEmail(userEmail))
    .like("complex_id", `${ALERT_PREFIX}%`)
    .order("created_at", { ascending: false });
  if (error || !Array.isArray(data)) return [];
  return data
    .map((r) => rowToSubscription(r as Record<string, unknown>))
    .filter((s): s is AlertSubscription => s !== null);
}

export type AddAlertResult =
  | { ok: true; item: AlertSubscription }
  | { ok: false; status: number; error: string };

/** 알림 구독 추가 (동일 지역/키워드는 upsert). */
export async function addAlertSubscription(
  userEmail: string,
  type: AlertSubscriptionType,
  rawValue: string,
): Promise<AddAlertResult> {
  const value = normalizeAlertValue(rawValue);
  if (!value) return { ok: false, status: 400, error: "구독할 지역 또는 키워드를 입력해 주세요." };
  if (value.length > MAX_ALERT_VALUE_LENGTH) {
    return { ok: false, status: 400, error: `${MAX_ALERT_VALUE_LENGTH}자 이내로 입력해 주세요.` };
  }
  const sb = getServiceSupabase();
  if (!sb) return { ok: false, status: 503, error: "일시적으로 구독을 저장할 수 없어요." };

  const email = normEmail(userEmail);
  const { count } = await sb
    .from("user_watchlist")
    .select("id", { count: "exact", head: true })
    .eq("user_email", email)
    .like("complex_id", `${ALERT_PREFIX}%`);
  if ((count ?? 0) >= MAX_ALERT_SUBSCRIPTIONS) {
    return { ok: false, status: 400, error: `구독은 최대 ${MAX_ALERT_SUBSCRIPTIONS}개까지 가능해요.` };
  }

  const { data, error } = await sb
    .from("user_watchlist")
    .upsert(
      {
        user_email: email,
        complex_id: keyOf(type, value),
        complex_name: labelOf(type, value),
        alert_price_min: null,
        alert_price_max: null,
      },
      { onConflict: "user_email,complex_id" },
    )
    .select("id, complex_id, complex_name, created_at")
    .single();
  if (error || !data) {
    return { ok: false, status: 500, error: "구독 저장에 실패했어요. 잠시 후 다시 시도해 주세요." };
  }
  const item = rowToSubscription(data as Record<string, unknown>);
  if (!item) return { ok: false, status: 500, error: "구독 저장에 실패했어요." };
  return { ok: true, item };
}

export type RemoveAlertResult =
  | { ok: true }
  | { ok: false; status: number; error: string };

/** 알림 구독 해지 — 본인 소유 + alert: 접두 행만 삭제. */
export async function removeAlertSubscription(
  userEmail: string,
  id: string,
): Promise<RemoveAlertResult> {
  const sb = getServiceSupabase();
  if (!sb) {
    // 저장소 미설정은 서버 오류(500)가 아니라 일시적 사용 불가(503)로 구분한다
    // (POST 경로의 addAlertSubscription 과 동일한 계약).
    return { ok: false, status: 503, error: "일시적으로 구독을 해지할 수 없어요." };
  }
  const { error } = await sb
    .from("user_watchlist")
    .delete()
    .eq("id", id)
    .eq("user_email", normEmail(userEmail))
    .like("complex_id", `${ALERT_PREFIX}%`);
  if (error) {
    return { ok: false, status: 500, error: "구독 해지에 실패했어요." };
  }
  return { ok: true };
}
