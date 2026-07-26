/**
 * 관심 단지(watchlist) 저장소.
 *
 * 이 파일의 조회는 **실패하면 던진다.** 예전에는 error 를 아예 받지 않아서,
 * DB 가 밀리는 몇 초 동안 사용자가 등록해 둔 관심 단지가 통째로 "없음"이 됐다 —
 * 목록은 "아직 등록한 단지가 없어요"로, 개수는 `0`(= 한도 전부 남음)으로,
 * 등록 여부는 `false`(= 관심 등록 안 함)로. 셋 다 사실이 아닌데 사실처럼 보인다.
 */
import { getServiceSupabase } from "@/lib/supabase/service";
import { pushInboxNotification } from "@/lib/notifications/inbox";
import { logger } from "@/lib/log";

export interface WatchlistItem {
  id: string;
  userEmail: string;
  complexId: string;
  complexName: string;
  alertPriceMin: number | null;
  alertPriceMax: number | null;
  createdAt: string;
}

const inMemory: WatchlistItem[] = [];

function dbToItem(r: Record<string, unknown>): WatchlistItem {
  return {
    id: String(r.id),
    userEmail: String(r.user_email),
    complexId: String(r.complex_id),
    complexName: String(r.complex_name),
    alertPriceMin: r.alert_price_min != null ? Number(r.alert_price_min) : null,
    alertPriceMax: r.alert_price_max != null ? Number(r.alert_price_max) : null,
    createdAt: String(r.created_at),
  };
}

export async function listWatchlist(userEmail: string): Promise<WatchlistItem[]> {
  const sb = getServiceSupabase();
  if (!sb) return inMemory.filter((w) => w.userEmail === userEmail);
  const { data, error } = await sb
    .from("user_watchlist")
    .select("*")
    .eq("user_email", userEmail)
    // 알림 구독(#47, lib/alerts/subscriptions) 행은 관심 단지 목록에서 제외
    .not("complex_id", "like", "alert:%")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`user_watchlist 조회 실패: ${error.message}`);
  if (!Array.isArray(data)) {
    throw new Error("user_watchlist 조회 실패: 응답이 배열이 아닙니다");
  }
  return data.map(dbToItem);
}

/** 관심 단지 개수 (한도 검사용). */
export async function countWatchlist(userEmail: string): Promise<number> {
  const em = userEmail.trim().toLowerCase();
  const sb = getServiceSupabase();
  if (!sb) {
    return inMemory.filter((w) => w.userEmail.trim().toLowerCase() === em).length;
  }
  const { count, error } = await sb
    .from("user_watchlist")
    .select("id", { count: "exact", head: true })
    .eq("user_email", em)
    // 알림 구독(#47) 행은 관심 단지 한도에 포함하지 않는다
    .not("complex_id", "like", "alert:%");
  if (error) throw new Error(`user_watchlist 개수 조회 실패: ${error.message}`);
  /* count 가 숫자가 아니면 조회가 안 된 것이다. `?? 0` 으로 넘기면 "0개 등록"이
     되어 한도 검사가 통째로 풀린다 — 못 센 것과 0개는 다른 사실이다. */
  if (typeof count !== "number") {
    throw new Error("user_watchlist 개수 조회 실패: count 를 받지 못했습니다");
  }
  return count;
}

export async function addToWatchlist(
  userEmail: string,
  complexId: string,
  complexName: string,
  alertPriceMin?: number,
  alertPriceMax?: number,
): Promise<WatchlistItem> {
  const sb = getServiceSupabase();
  if (!sb) {
    const existing = inMemory.findIndex((w) => w.userEmail === userEmail && w.complexId === complexId);
    const item: WatchlistItem = {
      id: `mem-${Date.now()}`,
      userEmail,
      complexId,
      complexName,
      alertPriceMin: alertPriceMin ?? null,
      alertPriceMax: alertPriceMax ?? null,
      createdAt: new Date().toISOString(),
    };
    if (existing >= 0) inMemory[existing] = item;
    else inMemory.unshift(item);
    return item;
  }
  const { data, error } = await sb
    .from("user_watchlist")
    .upsert({ user_email: userEmail, complex_id: complexId, complex_name: complexName, alert_price_min: alertPriceMin ?? null, alert_price_max: alertPriceMax ?? null }, { onConflict: "user_email,complex_id" })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return dbToItem(data as Record<string, unknown>);
}

export async function removeFromWatchlist(userEmail: string, complexId: string): Promise<void> {
  const sb = getServiceSupabase();
  if (!sb) {
    const idx = inMemory.findIndex((w) => w.userEmail === userEmail && w.complexId === complexId);
    if (idx >= 0) inMemory.splice(idx, 1);
    return;
  }
  await sb.from("user_watchlist").delete().eq("user_email", userEmail).eq("complex_id", complexId);
}

export async function isWatching(userEmail: string, complexId: string): Promise<boolean> {
  const sb = getServiceSupabase();
  if (!sb) return inMemory.some((w) => w.userEmail === userEmail && w.complexId === complexId);
  const { data, error } = await sb
    .from("user_watchlist")
    .select("id")
    .eq("user_email", userEmail)
    .eq("complex_id", complexId)
    .maybeSingle();
  /* 행이 없으면 error 없이 data=null 이다 — 그 null 만 "관심 등록 안 함"이다. */
  if (error) throw new Error(`user_watchlist 조회 실패: ${error.message}`);
  return !!data;
}

/** 가격 변동 시 관심 등록 사용자에게 인앱 알림 전송 */
export async function notifyPriceChange(
  complexId: string,
  complexName: string,
  currentPricePerM2: number,
): Promise<void> {
  const sb = getServiceSupabase();
  let watchers: Array<{
    user_email: unknown;
    alert_price_min: unknown;
    alert_price_max: unknown;
  }>;
  if (sb) {
    const { data, error } = await sb
      .from("user_watchlist")
      .select("user_email, alert_price_min, alert_price_max")
      .eq("complex_id", complexId);
    /* 여기서는 던지지 않는다 — 이 함수를 부르는 쪽은 가격 갱신 파이프라인이라
       알림 하나 때문에 갱신 자체를 되돌릴 이유가 없다. 다만 예전처럼 `.data ?? []`
       로 삼키면 "이 단지를 관심 등록한 사람이 아무도 없다"가 되어 알림이 조용히
       사라진다. 보내지 않는 것까지는 같아도, 왜 안 갔는지는 남긴다. */
    if (error) {
      logger.error(`[watchlist] 알림 대상 조회 실패 (complex=${complexId}):`, error.message);
      return;
    }
    watchers = data ?? [];
  } else {
    watchers = inMemory
      .filter((w) => w.complexId === complexId)
      .map((w) => ({
        user_email: w.userEmail,
        alert_price_min: w.alertPriceMin,
        alert_price_max: w.alertPriceMax,
      }));
  }

  for (const w of watchers) {
    const min = w.alert_price_min;
    const max = w.alert_price_max;
    if (min !== null && currentPricePerM2 < Number(min)) continue;
    if (max !== null && currentPricePerM2 > Number(max)) continue;
    await pushInboxNotification({
      userEmail: String(w.user_email),
      title: `${complexName} 가격 변동 알림`,
      body: `현재 평균 ${(currentPricePerM2 / 10_000).toFixed(0)}만원/㎡`,
      actionUrl: `/complex/${complexId}`,
    });
  }
}
