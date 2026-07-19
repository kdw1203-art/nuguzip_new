/**
 * 단지 허브 링크 해석 — 아파트명(+지역)으로 complexes 실 id를 찾는 서버 헬퍼.
 *
 * 사실성 원칙: 이름이 실제로 일치하는 단지를 찾았을 때만 /complex/[id]를 반환하고,
 * 애매하거나(지역 불일치) 못 찾으면 null → 호출부는 링크를 숨긴다 (mock-1로 보내지 않음).
 */
import { cache } from "react";
import { searchComplexes, type ComplexRow } from "@/lib/complex/complex-store";

function normalize(s: string): string {
  return s.replace(/\s+/g, "");
}

/** "관양동·평촌", "안양시 동안구" 등 지역 문자열 → 매칭용 토큰 (2자 이상) */
function regionTokens(region: string | null | undefined): string[] {
  return (region ?? "")
    .split(/[\s·,\/]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

function rowHaystack(r: ComplexRow): string {
  return `${r.city} ${r.district} ${r.address ?? ""} ${r.road_address ?? ""}`;
}

/**
 * 아파트명(+지역)으로 실 단지 id를 찾아 `/complex/[id]` href를 반환.
 * React cache로 같은 렌더 요청 내 중복 조회를 방지한다.
 * env 미설정·검색 실패·미발견·지역 불일치 시 null.
 */
export const resolveComplexHref = cache(
  async (
    name: string | null | undefined,
    region?: string | null,
  ): Promise<string | null> => {
    const query = (name ?? "").trim();
    if (!query) return null;
    try {
      const rows = await searchComplexes(query, undefined, 10);
      if (rows.length === 0) return null;

      // 이름이 실제로 겹치는 후보만 (검색 RPC의 느슨한 결과에서 오매칭 방지)
      const nq = normalize(query);
      const nameMatches = rows.filter((r) => {
        const rn = normalize(r.name);
        return rn.includes(nq) || nq.includes(rn);
      });
      if (nameMatches.length === 0) return null;

      const tokens = regionTokens(region);
      if (tokens.length > 0) {
        // 지역 정보가 있으면 지역까지 일치하는 단지만 신뢰
        const regionHit = nameMatches.find((r) => {
          const hay = rowHaystack(r);
          return tokens.some((t) => hay.includes(t));
        });
        if (regionHit) return `/complex/${regionHit.id}`;
        // 동명 타지역 단지로의 오연결 방지 — 유일 후보가 아니면 숨김
        return nameMatches.length === 1
          ? `/complex/${nameMatches[0].id}`
          : null;
      }

      return `/complex/${nameMatches[0].id}`;
    } catch {
      return null;
    }
  },
);
