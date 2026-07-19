import { getServiceSupabase } from "@/lib/supabase/service";
import { pushInboxNotification } from "@/lib/notifications/inbox";

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
  const { data } = await sb.from("user_watchlist").select("*").eq("user_email", userEmail).order("created_at", { ascending: false });
  return (data ?? []).map(dbToItem);
}

/** 관심 단지 개수 (한도 검사용). */
export async function countWatchlist(userEmail: string): Promise<number> {
  const em = userEmail.trim().toLowerCase();
  const sb = getServiceSupabase();
  if (!sb) {
    return inMemory.filter((w) => w.userEmail.trim().toLowerCase() === em).length;
  }
  const { count } = await sb
    .from("user_watchlist")
    .select("id", { count: "exact", head: true })
    .eq("user_email", em);
  return count ?? 0;
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
  const { data } = await sb.from("user_watchlist").select("id").eq("user_email", userEmail).eq("complex_id", complexId).maybeSingle();
  return !!data;
}

/** 가격 변동 시 관심 등록 사용자에게 인앱 알림 전송 */
export async function notifyPriceChange(
  complexId: string,
  complexName: string,
  currentPricePerM2: number,
): Promise<void> {
  const sb = getServiceSupabase();
  const watchers = sb
    ? (await sb.from("user_watchlist").select("user_email, alert_price_min, alert_price_max").eq("complex_id", complexId)).data ?? []
    : inMemory.filter((w) => w.complexId === complexId).map((w) => ({ user_email: w.userEmail, alert_price_min: w.alertPriceMin, alert_price_max: w.alertPriceMax }));

  for (const w of watchers) {
    const min = w.alert_price_min;
    const max = w.alert_price_max;
    if (min !== null && currentPricePerM2 < Number(min)) continue;
    if (max !== null && currentPricePerM2 > Number(max)) continue;
    await pushInboxNotification({
      userEmail: String(w.user_email),
      title: `${complexName} 가격 변동 알림`,
      body: `현재 평균 ${(currentPricePerM2 / 10_000).toFixed(0)}만원/㎡`,
      actionUrl: `/info/apt/${complexId}`,
    });
  }
}
