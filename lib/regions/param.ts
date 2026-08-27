/**
 * [D62] `?region=` 한 낱말을 화면마다 다르게 읽던 문제.
 *
 * 같은 파라미터 이름으로 서로 다른 세 가지 말을 주고받고 있었다:
 *   · /map            → 한글 지역명   "서울 강남구"
 *   · /analysis/price → 실거래 슬러그 "서울-강남구" (또는 그 이름 그대로)
 *   · timing·scenario → 카탈로그 id  "gangnam"
 *
 * 그래서 화면을 잇는 링크가 조용히 틀렸다. 예를 들어 지도에서 쓰던 "강남구"를
 * 그대로 실거래 화면에 넘기면 목록에는 "서울 강남구"만 있어 매칭에 실패하고,
 * 그 페이지는 **첫 번째 지역으로 조용히 대체**한다 — 사용자는 자기가 고른 줄
 * 알았던 다른 동네의 숫자를 본다. 타이밍은 "강남구"를 id 로 그대로 API 에
 * 보내 빈 화면이 된다. 코드 주석(AnalysisCrossLinks.tsx)에도 "보내는 쪽은
 * 자기가 정확히 아는 값만 채운다"고 적혀 있는데, 그건 증상을 피한 것이지
 * 고친 게 아니다.
 *
 * 방향을 뒤집는다: **보내는 쪽은 그대로 두고 받는 쪽이 너그러워진다.**
 * 어느 말로 와도 자기 목록에서 같은 지역을 찾아낸다. 못 찾으면 null 을 주고,
 * 호출부가 "그 지역을 못 찾았다"고 말하도록 한다 — 조용한 대체가 가장 나쁘다.
 *
 * 무거운 의존이 없다(카탈로그를 import 하지 않는다). 호출부가 이미 들고 있는
 * 목록을 그대로 넘기면 되므로 서버·클라이언트 어디서든 쓸 수 있고 번들이 늘지 않는다.
 */

/** 비교용 정규화 — 공백·하이픈·행정구역 접미사를 지우고 소문자로. */
export function normalizeRegionText(value: string): string {
  return value
    .trim()
    .replace(/[\s_-]+/g, "")
    .replace(/특별시|광역시|특별자치시|특별자치도/g, "")
    .toLowerCase();
}

/** 지역 후보 — 화면마다 들고 있는 목록의 최소 공통 모양. */
export type RegionCandidate = {
  id?: string | null;
  slug?: string | null;
  name?: string | null;
  label?: string | null;
};

function textsOf(c: RegionCandidate): string[] {
  return [c.id, c.slug, c.name, c.label]
    .map((v) => (v ?? "").trim())
    .filter(Boolean);
}

/**
 * 어떤 표기로 들어온 `?region=` 이든 내 목록에서 같은 지역을 찾는다.
 *
 * 순서가 중요하다 — 느슨한 규칙을 먼저 적용하면 "서울"이 "서울 강남구"를
 * 먼저 물어 버린다:
 *   1) 원문 정확 일치 (id·slug·name·label)
 *   2) 정규화 후 정확 일치  ("서울-강남구" = "서울특별시 강남구")
 *   3) 정규화 후 포함 관계 — **가장 긴** 후보가 이긴다
 *      ("강남구"가 "서울 강남구"를 찾되, "서울"이 아무 구나 물지 않도록)
 *
 * @returns 찾은 후보, 또는 null(= 이 목록에 없는 지역)
 */
export function pickRegionByAnyName<T extends RegionCandidate>(
  raw: string | null | undefined,
  options: readonly T[],
): T | null {
  const query = (raw ?? "").trim();
  if (!query || options.length === 0) return null;

  for (const o of options) {
    if (textsOf(o).some((t) => t === query)) return o;
  }

  const nq = normalizeRegionText(query);
  if (!nq) return null;

  for (const o of options) {
    if (textsOf(o).some((t) => normalizeRegionText(t) === nq)) return o;
  }

  /* 3) 포함 관계 — 겹치는 글자가 많은 후보가 이긴다. 점수는 질의와 후보 중
     **짧은 쪽 길이**다(겹친 부분의 크기). 그리고 같은 점수의 후보가 둘 이상이면
     **null 을 준다** — 이게 이 함수의 핵심이다. "서울"만 들고 오면 25개 구가
     모두 같은 점수로 걸리는데, 그중 하나를 고르는 건 사용자가 고른 적 없는
     동네의 숫자를 보여 주는 일이다. 모르면 모른다고 해야 호출부가
     "그 지역을 찾지 못했다"고 말할 수 있다. */
  let best: T | null = null;
  let bestScore = 0;
  let bestTied = false;
  for (const o of options) {
    let score = 0;
    for (const t of textsOf(o)) {
      const nt = normalizeRegionText(t);
      if (nt.length < 2) continue;
      if (!(nt.includes(nq) || nq.includes(nt))) continue;
      score = Math.max(score, Math.min(nt.length, nq.length));
    }
    if (score === 0) continue;
    if (score > bestScore) {
      best = o;
      bestScore = score;
      bestTied = false;
    } else if (score === bestScore && o !== best) {
      bestTied = true;
    }
  }
  return bestTied ? null : best;
}
