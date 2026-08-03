/**
 * 최근 검색어 localStorage 저장소 — /search 와 헤더 검색(HeaderSearch)이 공유한다.
 *
 * 항목 12: 헤더 검색에 최근 검색어를 붙이면서, /search 클라이언트에 있던 같은
 * 키·같은 형식의 읽기/쓰기가 두 벌이 될 뻔했다. 키가 한 글자라도 어긋나면 두
 * 화면의 "최근 검색"이 조용히 갈라지므로 여기 한 곳에만 둔다.
 *
 * 브라우저 전용(localStorage) — 반드시 이벤트 핸들러나 useEffect 안에서만 부를 것.
 * 실패(프라이빗 모드·파싱 오류)는 조용히 빈 목록으로 처리한다.
 */

export const RECENT_SEARCH_KEY = "nuguzip.recentSearches";
export const RECENT_SEARCH_MAX = 5;

export function readRecentSearches(): string[] {
  try {
    const raw = window.localStorage.getItem(RECENT_SEARCH_KEY);
    if (!raw) return [];
    const arr: unknown = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((v): v is string => typeof v === "string")
      .slice(0, RECENT_SEARCH_MAX);
  } catch {
    return [];
  }
}

export function writeRecentSearches(list: string[]): void {
  try {
    window.localStorage.setItem(
      RECENT_SEARCH_KEY,
      JSON.stringify(list.slice(0, RECENT_SEARCH_MAX)),
    );
  } catch {
    // 저장 불가 환경 — no-op
  }
}

/** 검색어를 맨 앞에 추가(중복 제거·상한 적용)하고 다음 목록을 반환 */
export function pushRecentSearch(keyword: string): string[] {
  const k = keyword.trim();
  if (!k) return readRecentSearches();
  const next = [k, ...readRecentSearches().filter((v) => v !== k)].slice(
    0,
    RECENT_SEARCH_MAX,
  );
  writeRecentSearches(next);
  return next;
}
