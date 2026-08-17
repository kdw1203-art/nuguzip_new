import { normalizeRegionLabel } from "./region-label";

/* 지역 임장 가이드 ↔ 공개 임장노트 매칭 — U3 데이터 플라이휠의 조인 지점.
 *
 * 노트 region 은 "서울 송파구 가락동"(동 단위 포함)이고 실거래 지역명은
 * "서울 송파구"(구 단위)다. 정규화 후 **정확 일치 또는 "지역명 + 공백"으로
 * 시작**할 때만 매칭한다 — "서울 송파구청역..." 같은 우연한 접두 일치가
 * 공백 경계 조건에 걸러진다. 순수 함수 (유닛 테스트 대상).
 */

export function noteRegionMatches(noteRegion: string | null | undefined, regionName: string): boolean {
  if (!noteRegion || !regionName) return false;
  const norm = normalizeRegionLabel(noteRegion);
  return norm === regionName || norm.startsWith(`${regionName} `);
}

export function filterNotesByRegion<T extends { region: string | null }>(
  notes: T[],
  regionName: string,
  limit = 4,
): T[] {
  const out: T[] = [];
  for (const n of notes) {
    if (noteRegionMatches(n.region, regionName)) {
      out.push(n);
      if (out.length >= limit) break;
    }
  }
  return out;
}
