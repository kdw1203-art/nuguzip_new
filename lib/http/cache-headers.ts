/* [OPT-12] 공개 GET API 캐시 헤더 표준 — 등급제 프리셋.
   개인화·쿼터·세션이 걸린 응답에는 절대 쓰지 않는다(no-store 유지).
   s-maxage 는 CDN(Vercel)만 캐시하고 브라우저는 재검증한다 —
   stale-while-revalidate 로 갱신 중에도 응답이 끊기지 않는다. */

export const PUBLIC_CACHE = {
  /** 자주 변하는 공개 조회 (단지 컨텍스트·검색): 신선 60초·백그라운드 갱신 10분 */
  short: "public, s-maxage=60, stale-while-revalidate=600",
  /** 일 단위 데이터 (통계·캘린더): 신선 10분·백그라운드 갱신 1시간 */
  daily: "public, s-maxage=600, stale-while-revalidate=3600",
  /** 사실상 불변 (스냅샷·아카이브): 신선 1시간·백그라운드 갱신 하루 */
  immutableish: "public, s-maxage=3600, stale-while-revalidate=86400",
} as const;

export function withPublicCache(res: Response, preset: keyof typeof PUBLIC_CACHE): Response {
  res.headers.set("Cache-Control", PUBLIC_CACHE[preset]);
  return res;
}
