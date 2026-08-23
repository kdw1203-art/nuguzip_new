/* [#67] 동일 사건 뉴스 클러스터링 — 제목 유사도 렌더타임 묶기.
 *
 * 같은 발표를 다룬 기사 여러 건이 각각 카드로 올라와 피드를 채우는 문제를,
 * **표시 계층에서** 묶어 해결한다(수집 파이프라인은 손대지 않는다 — 원본은
 * 전부 보존되고, 각 기사 상세 페이지도 그대로 남는다).
 *
 * 유사도: 정규화 제목의 (a) 토큰 자카드 (b) 문자 바이그램 자카드 중 큰 값.
 * 한국어 제목은 조사·띄어쓰기 변형이 많아 토큰만으로는 놓친다 — 바이그램이
 * "9·7 공급대책 발표" vs "9·7 대책 발표에" 류를 잡는다. 시간창(기본 72시간)
 * 밖이면 제목이 같아도 다른 사건으로 본다(후속 보도가 새 사건일 수 있음).
 * 순수 함수 — DB·네트워크 없음. scripts/check-news-cluster.mjs 가 회귀를 막는다.
 */

export type Clusterable = {
  id: string;
  title: string;
  /** 표시 시각(ms) — 최신 기사가 대표가 된다 */
  timeMs: number;
};

export type NewsCluster<T extends Clusterable> = {
  primary: T;
  related: T[];
};

const BRACKETS = /\[[^\]]*\]|\([^)]*\)|【[^】]*】|〈[^〉]*〉|<[^>]*>/g;
const QUOTES = /["'“”‘’`]/g;
/** 길이 3+ 토큰 꼬리의 흔한 조사 — "발표에"→"발표", "수도권은"→"수도권" */
const JOSA_TAIL = /(에서|으로|이라|라고|까지|부터|에게|한테|보다|처럼|은|는|이|가|을|를|의|에|도|만|와|과|로)$/;

export function normalizeNewsTitle(title: string): string {
  return title
    .normalize("NFC")
    .toLowerCase()
    // "9·7 대책"·"6.17 대책"류 — 숫자 사이 구분자를 붙여 한 토큰("97")으로 보존.
    // 이 숫자가 사건 식별자라, 지우면 같은 대책 보도끼리 못 묶인다(실측 튜닝).
    .replace(/(\d)[·.\-](\d)/g, "$1$2")
    .replace(BRACKETS, " ")
    .replace(QUOTES, "")
    .replace(/[^\p{Script=Hangul}a-z0-9]+/gu, " ")
    .trim();
}

export function titleTokens(title: string): Set<string> {
  const out = new Set<string>();
  for (const raw of normalizeNewsTitle(title).split(/\s+/)) {
    if (raw.length < 2) continue;
    const t = raw.length >= 3 ? raw.replace(JOSA_TAIL, "") : raw;
    if (t.length >= 2) out.add(t);
  }
  return out;
}

function charBigrams(title: string): Set<string> {
  const s = normalizeNewsTitle(title).replace(/\s+/g, "");
  const out = new Set<string>();
  for (let i = 0; i < s.length - 1; i += 1) out.add(s.slice(i, i + 2));
  return out;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const t of small) if (large.has(t)) inter += 1;
  return inter / (a.size + b.size - inter);
}

export function titleSimilarity(a: string, b: string): number {
  return Math.max(
    jaccard(titleTokens(a), titleTokens(b)),
    jaccard(charBigrams(a), charBigrams(b)),
  );
}

/** 토큰 겹침 계수(작은 쪽 기준) + 겹친 토큰 수 */
function overlapStats(a: Set<string>, b: Set<string>): { shared: number; coef: number } {
  if (a.size === 0 || b.size === 0) return { shared: 0, coef: 0 };
  let shared = 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const t of small) if (large.has(t)) shared += 1;
  return { shared, coef: shared / small.size };
}

/**
 * 같은 사건 판정(실측 튜닝, tests/e2e/news-cluster.spec.ts 가 고정):
 *   - 자카드(토큰·바이그램 중 큰 값) ≥ 0.5 — 강한 일치
 *   - 또는 겹친 토큰 ≥ 4 && 겹침 계수 ≥ 0.65 — "정부, 9·7 공급대책 발표" 류
 *     어순·조사 변형 (겹침 3개("서울 아파트 거래량")짜리 유사 주제는 통과 못 함)
 */
export function sameEventTitles(a: string, b: string): boolean {
  const ta = titleTokens(a);
  const tb = titleTokens(b);
  const j = Math.max(jaccard(ta, tb), jaccard(charBigrams(a), charBigrams(b)));
  if (j >= 0.5) return true;
  const { shared, coef } = overlapStats(ta, tb);
  return shared >= 4 && coef >= 0.65;
}

const DEFAULT_WINDOW_MS = 72 * 3600_000;

/**
 * 최신순 입력을 가정하지 않는다 — 내부에서 시간 내림차순 정렬 후, 각 기사를
 * 기존 클러스터 **대표**와만 비교한다(대표 전이로 인한 사슬 병합 방지:
 * A~B, B~C 라도 A~C 가 아니면 C 는 새 클러스터).
 */
export function clusterNews<T extends Clusterable>(
  items: T[],
  opts?: { windowMs?: number },
): Array<NewsCluster<T>> {
  const windowMs = opts?.windowMs ?? DEFAULT_WINDOW_MS;
  const sorted = [...items].sort((a, b) => b.timeMs - a.timeMs);
  const clusters: Array<{
    primary: T;
    related: T[];
    tokens: Set<string>;
    bigrams: Set<string>;
  }> = [];

  for (const item of sorted) {
    const tokens = titleTokens(item.title);
    const bigrams = charBigrams(item.title);
    let joined = false;
    for (const c of clusters) {
      if (Math.abs(c.primary.timeMs - item.timeMs) > windowMs) continue;
      const j = Math.max(jaccard(tokens, c.tokens), jaccard(bigrams, c.bigrams));
      const { shared, coef } = overlapStats(tokens, c.tokens);
      if (j >= 0.5 || (shared >= 4 && coef >= 0.65)) {
        c.related.push(item);
        joined = true;
        break;
      }
    }
    if (!joined) clusters.push({ primary: item, related: [], tokens, bigrams });
  }

  return clusters.map((c) => ({ primary: c.primary, related: c.related }));
}

/** 특정 기사가 속한 클러스터의 "다른 기사들" — 상세 페이지 관련 보도용 */
export function relatedInCluster<T extends Clusterable>(
  items: T[],
  id: string,
  opts?: { windowMs?: number },
): T[] {
  for (const c of clusterNews(items, opts)) {
    if (c.primary.id === id) return c.related;
    const hit = c.related.find((r) => r.id === id);
    if (hit) return [c.primary, ...c.related.filter((r) => r.id !== id)];
  }
  return [];
}
