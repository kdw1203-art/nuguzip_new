/**
 * 단지 허브 링크 해석 — 아파트명(+지역)으로 단지 id를 찾는 서버 헬퍼.
 * (id 는 실거래 market_transactions 의 region_name+complex_name 을 인코딩한 값이다.)
 *
 * 사실성 원칙: 이름이 실제로 일치하는 단지를 찾았을 때만 /complex/[id]를 반환하고,
 * 애매하거나(지역 불일치) 못 찾으면 null → 호출부는 링크를 숨긴다 (mock-1로 보내지 않음).
 */
import { cache } from "react";
import { unstable_cache } from "next/cache";
import {
  encodeKaptComplexId,
  searchComplexes,
  type ComplexRow,
} from "@/lib/complex/complex-store";

function hrefForRow(r: ComplexRow): string {
  /* kapt 가 있으면 동명 충돌을 피한 안정 id 를 쓴다. 없으면 기존 name id. */
  if (r.kapt_code?.trim()) {
    return `/complex/${encodeKaptComplexId(r.kapt_code)}`;
  }
  return `/complex/${r.id}`;
}

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
/**
 * 여러 (단지명, 지역) 쌍을 한꺼번에 해석 — 동시 상한 + 전체 마감 포함.
 *
 * 목록 페이지(/qna·/notes)가 항목마다 resolveComplexHref 를 Promise.all 로
 * 동시에 쏘면 렌더 한 번에 DB 왕복이 목록 크기만큼 난다(최대 50~100회) —
 * 연결 10개짜리 Auth 서버 프로젝트에서 525/57014 를 만든 패턴이다.
 * 여기서는 중복을 먼저 접고, 동시 4개 제한 + 전체 마감(기본 3초)으로 돈다.
 * 마감을 넘긴 나머지 키는 맵에 없다 → 호출부는 링크만 생략한다. 링크는 부가
 * 정보라 "조회 실패" 위장이 아니라 조회 자체를 하지 않은 것이다.
 */
export async function resolveComplexHrefs(
  targets: Iterable<{ name: string | null | undefined; region?: string | null }>,
  opts?: { concurrency?: number; deadlineMs?: number },
): Promise<Map<string, string | null>> {
  const concurrency = opts?.concurrency ?? 4;
  const deadlineMs = opts?.deadlineMs ?? 3_000;
  const keys: string[] = [];
  const byKey = new Map<string, { name: string; region: string | null }>();
  for (const t of targets) {
    const name = (t.name ?? "").trim();
    if (!name) continue;
    const key = complexHrefKey(name, t.region);
    if (!byKey.has(key)) {
      byKey.set(key, { name, region: t.region ?? null });
      keys.push(key);
    }
  }
  const resolved = new Map<string, string | null>();
  const startedAt = Date.now();
  let cursor = 0;
  const worker = async () => {
    while (cursor < keys.length) {
      if (Date.now() - startedAt > deadlineMs) return;
      const key = keys[cursor];
      cursor += 1;
      if (key === undefined) return;
      const target = byKey.get(key)!;
      try {
        resolved.set(key, await resolveComplexHref(target.name, target.region));
      } catch {
        resolved.set(key, null);
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, keys.length) }, worker),
  );
  return resolved;
}

/** resolveComplexHrefs 결과 맵을 조회할 때 쓰는 키. */
export function complexHrefKey(
  name: string | null | undefined,
  region?: string | null,
): string {
  return `${(name ?? "").trim()}|${region ?? ""}`;
}

/* 실제 해석 — 조회 실패는 **던진다**(아래 데이터 캐시가 실패를 6시간 동안
   "링크 없음"으로 굳히지 않게). "못 찾음"(null)만 값으로 돌려준다. */
async function resolveComplexHrefUncached(
  query: string,
  region: string,
): Promise<string | null> {
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
    if (regionHit) return hrefForRow(regionHit);
    // 동명 타지역 단지로의 오연결 방지 — 유일 후보가 아니면 숨김
    return nameMatches.length === 1 ? hrefForRow(nameMatches[0]) : null;
  }

  return hrefForRow(nameMatches[0]);
}

/* [948 · 최적화 2차] (단지명, 지역) → href 를 데이터 캐시에 6시간 보관.
   실측(2026-09-02, pg_stat_statements 11.5시간 델타): 이 해석이 부르는
   `complex_name ILIKE` 조회가 4,427회 · 평균 42ms = 187초로 DB 시간 1위였다.
   /notes·/qna·/notes/[id]·/map 은 동적 렌더라 요청마다 목록 전체(최대 50건)를
   다시 풀었고, 결과는 실거래 단지명에서만 나와 하루 안에 바뀌지 않는다.
   키는 (이름, 지역) 문자열 — 요청·사용자와 무관하게 같은 값이다.
   market 태그: 실거래 적재(molit) 뒤 invalidateAfterIngest 가 비운다. */
const resolveComplexHrefCached = unstable_cache(
  async (query: string, region: string) => resolveComplexHrefUncached(query, region),
  ["complex-href-v1"],
  { revalidate: 21_600, tags: ["market"] },
);

export const resolveComplexHref = cache(
  async (
    name: string | null | undefined,
    region?: string | null,
  ): Promise<string | null> => {
    const query = (name ?? "").trim();
    if (!query) return null;
    try {
      return await resolveComplexHrefCached(query, (region ?? "").trim());
    } catch {
      return null;
    }
  },
);
