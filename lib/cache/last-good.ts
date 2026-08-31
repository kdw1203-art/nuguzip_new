import "server-only";
import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/log";

/**
 * [938 · B007] 마지막 정상 결과(last-known-good) 내구 저장 — public_data_cache 재사용.
 *
 * 왜 필요한가(실측 2026-08-31): 지도 공유 단지 배치(map-shared-danji)와 지역 시세
 * 마커가 DB 포화 시간대에 조회 타임아웃으로 재생성에 실패했다(일 2~4건). Next 데이터
 * 캐시가 stale 을 이어 주는 경우는 살지만, 배포 직후·태그 무효화 직후의 콜드 캐시
 * 방문자는 "지금 못 불러왔다" 화면을 그대로 맞는다 — 내용은 모든 방문자에게 같고
 * 10분 전 값이면 충분한 데이터인데도.
 *
 * 계약:
 *  - 성공한 계산 결과를 upsert 로 남긴다(쓰기 실패는 경고만 — 본 응답을 볼모로 잡지 않음).
 *  - 실패 시 마지막 정상본을 읽어 대신 쓴다. maxAgeHours 를 넘긴 낡은 본은 쓰지 않는다
 *    — 오래된 값을 방금 값처럼 내는 것은 지어낸 값과 같다.
 *  - 저장본에는 fetched_at 이 남으므로 호출부가 시점을 표기할 수 있다.
 */

const SOURCE = "last-good";

export async function saveLastGood(cacheKey: string, value: unknown): Promise<void> {
  try {
    const sb = getServiceSupabase();
    if (!sb) return;
    const { error } = await sb.from("public_data_cache").upsert(
      {
        source: SOURCE,
        cache_key: cacheKey,
        payload: value as never,
        fetched_at: new Date().toISOString(),
        expires_at: null,
      },
      { onConflict: "cache_key" },
    );
    if (error) logger.warn(`[last-good] ${cacheKey} 저장 실패`, error.message);
  } catch (e) {
    logger.warn(`[last-good] ${cacheKey} 저장 실패`, e);
  }
}

export async function loadLastGood<T>(
  cacheKey: string,
  maxAgeHours: number,
): Promise<{ value: T; fetchedAt: string } | null> {
  try {
    const sb = getServiceSupabase();
    if (!sb) return null;
    const { data, error } = await sb
      .from("public_data_cache")
      .select("payload, fetched_at")
      .eq("cache_key", cacheKey)
      .maybeSingle();
    if (error || !data?.payload) return null;
    const fetchedAt = String(data.fetched_at ?? "");
    const age = Date.now() - new Date(fetchedAt).getTime();
    if (!Number.isFinite(age) || age > maxAgeHours * 3_600_000) return null;
    return { value: data.payload as T, fetchedAt };
  } catch {
    return null;
  }
}
