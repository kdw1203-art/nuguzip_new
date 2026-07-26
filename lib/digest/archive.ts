import "server-only";

import { getReadOnlySupabase } from "@/lib/newui/supabase-read";

/**
 * N23 — 주간 다이제스트 웹 아카이브.
 *
 * ── /digest 와 무엇이 다른가 ──────────────────────────────────────────────
 * `/digest` 는 **지금으로부터 최근 7일**을 보여 준다. 오늘 보면 7/20~7/26,
 * 내일 보면 7/21~7/27이다. 링크를 남겨도 다음 날 다른 내용이 되므로 인용할
 * 수 없고, 색인돼도 내용이 매일 바뀌는 URL 하나일 뿐이다.
 *
 * 이 모듈은 그 대신 **주를 고정한다**. 주는 KST 월요일 00:00 부터 다음 월요일
 * 00:00 직전까지이고, 주소는 그 월요일 날짜(YYYY-MM-DD)다. `/digest/2026-07-13`
 * 은 언제 열어도 그 주를 말한다.
 *
 * ── 저장하지 않고 다시 계산한다 ────────────────────────────────────────────
 * 주마다 결과를 표로 굳혀 두는(스냅샷) 방법도 있지만 하지 않았다. 표를 새로
 * 만들면 그 표와 원본이 어긋나는 순간이 오고 — 글이 내려가거나 비공개로
 * 바뀌어도 아카이브에는 남는다 — 그때 아카이브 쪽이 사실이 아니게 된다.
 * 그래서 매번 원본(board_posts)에서 그 주 구간을 다시 읽는다. 대신 "그 주에
 * 있었던 글이 나중에 내려가면 아카이브에서도 사라진다" 는 성질을 갖는다.
 * 둘 중에서는 이쪽이 덜 거짓말한다.
 *
 * ── 진행 중인 주는 만들지 않는다 ───────────────────────────────────────────
 * 이번 주는 아직 끝나지 않았다. 수요일에 굳힌 "이번 주 요약"은 그 주의 절반을
 * 전부인 것처럼 말한다. 완결된 주만 아카이브에 넣는다.
 *
 * ── 얇은 주는 만들지 않는다 ────────────────────────────────────────────────
 * 항목이 MIN_ITEMS 개 미만인 주는 페이지를 만들지 않는다. 한두 줄짜리 "주간
 * 다이제스트" 는 다이제스트가 아니고, 그런 URL 을 주마다 찍어 내면 색인만
 * 부풀린다(1차 경계와 동일한 기준).
 *
 * 조회 실패는 던진다 — 부르는 쪽이 404(그 주 없음)와 5xx(못 읽음)를 구분해야
 * 한다. 빈 주로 바꿔 내보내면 "그 주엔 아무 일도 없었다" 는 거짓이 된다.
 */

/** 아카이브가 다루는 최대 주 수 — 이보다 오래된 주는 만들지 않는다. */
export const ARCHIVE_WEEKS = 12;
/** 이 개수 미만인 주는 페이지를 만들지 않는다. */
export const MIN_ITEMS = 3;
/** 한 주 화면에 싣는 최대 뉴스/이웃 글 수. */
const NEWS_LIMIT = 12;
const COMMUNITY_LIMIT = 8;
/** 한 번에 읽어 오는 최대 행 수 — 이 수에 닿으면 가장 오래된 주는 신뢰하지 않는다. */
const FETCH_LIMIT = 3000;

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

/* ---------- 주 경계 (KST 월요일) ---------- */

function ymd(msUtc: number): string {
  const kst = new Date(msUtc + KST_OFFSET_MS);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${kst.getUTCFullYear()}-${p(kst.getUTCMonth() + 1)}-${p(kst.getUTCDate())}`;
}

/** 어떤 시각이 속한 KST 주의 월요일 00:00(KST)을 UTC ms 로. */
export function weekStartMs(msUtc: number): number {
  const kst = new Date(msUtc + KST_OFFSET_MS);
  const dow = kst.getUTCDay(); // 0=일요일
  const backDays = (dow + 6) % 7; // 월요일이면 0, 일요일이면 6
  const midnightKst = Date.UTC(
    kst.getUTCFullYear(),
    kst.getUTCMonth(),
    kst.getUTCDate(),
  );
  return midnightKst - KST_OFFSET_MS - backDays * DAY_MS;
}

/** 'YYYY-MM-DD'(KST 월요일) → UTC ms. 형식이 틀리면 null. */
export function weekSlugToMs(slug: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(slug)) return null;
  const ms = Date.parse(`${slug}T00:00:00+09:00`);
  if (!Number.isFinite(ms)) return null;
  // 월요일이 아닌 날짜는 주소로 인정하지 않는다 (같은 주에 7개 URL 이 생기는 것을 막는다)
  return weekStartMs(ms) === ms ? ms : null;
}

export function weekSlugOf(msUtc: number): string {
  return ymd(weekStartMs(msUtc));
}

/** "2026년 7월 13일~19일" — 주 구간을 사람이 읽는 형태로. */
export function weekRangeLabel(startMs: number): string {
  const s = new Date(startMs + KST_OFFSET_MS);
  const e = new Date(startMs + WEEK_MS - DAY_MS + KST_OFFSET_MS);
  const sy = s.getUTCFullYear();
  const sm = s.getUTCMonth() + 1;
  const sd = s.getUTCDate();
  const em = e.getUTCMonth() + 1;
  const ed = e.getUTCDate();
  if (sm === em) return `${sy}년 ${sm}월 ${sd}일~${ed}일`;
  return `${sy}년 ${sm}월 ${sd}일~${em}월 ${ed}일`;
}

/** "7월 3주차" — 그 주 월요일이 속한 달 기준. */
export function weekOrdinalLabel(startMs: number): string {
  const s = new Date(startMs + KST_OFFSET_MS);
  const month = s.getUTCMonth() + 1;
  const nth = Math.min(Math.ceil(s.getUTCDate() / 7), 5);
  return `${month}월 ${nth}주차`;
}

/* ---------- 자료형 ---------- */

export type DigestArchiveItem = {
  id: string;
  title: string;
  region: string | null;
  sourceName: string | null;
  sourceUrl: string | null;
  /** 표시 기준 시각 (source_published_at ?? created_at, ISO) */
  at: string;
};

export type DigestWeekSummary = {
  /** 'YYYY-MM-DD' (KST 월요일) */
  slug: string;
  startMs: number;
  rangeLabel: string;
  ordinalLabel: string;
  newsCount: number;
  communityCount: number;
  totalCount: number;
};

export type DigestWeek = DigestWeekSummary & {
  news: DigestArchiveItem[];
  community: DigestArchiveItem[];
  /** 그 주 시장 온도 기록 (N11). 그 주 스냅샷이 없으면 빈 배열 — 다른 주로 대체하지 않는다. */
  temperature: Array<{ regionId: string; regionLabel: string; score: number; headline: string }>;
};

/* ---------- 원본 읽기 ---------- */

type Bucket = { news: DigestArchiveItem[]; community: DigestArchiveItem[] };

function itemOf(row: Record<string, unknown>, atMs: number): DigestArchiveItem {
  const source = row.source_name ? String(row.source_name).trim() : "";
  const url = row.source_url ? String(row.source_url).trim() : "";
  return {
    id: String(row.id ?? ""),
    title: String(row.title ?? "").trim(),
    region: row.region ? String(row.region).trim() || null : null,
    sourceName: source || null,
    sourceUrl: url || null,
    at: new Date(atMs).toISOString(),
  };
}

/**
 * 아카이브 구간 전체를 한 번에 읽어 주별로 접는다.
 *
 * 표시 기준 시각은 source_published_at(있으면) ?? created_at 이다. 질의는
 * created_at 으로 자르는데, 수집이 발행보다 앞설 수는 없으므로 구간 시작보다
 * 조금 앞(2주)까지만 넉넉히 잡으면 발행 시각이 구간에 드는 글은 모두 걸린다.
 *
 * 반환하는 buckets 는 완결된 주만, 그리고 FETCH_LIMIT 에 닿아 잘렸을 경우
 * 신뢰할 수 없는 오래된 주를 뺀 결과다.
 */
async function loadBuckets(now: Date): Promise<Map<string, Bucket>> {
  const sb = getReadOnlySupabase();
  if (!sb) {
    throw new Error(
      "Supabase 읽기 키가 없어 주간 아카이브를 만들 수 없습니다 " +
        "(SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY).",
    );
  }

  const currentWeekStart = weekStartMs(now.getTime());
  const firstWeekStart = currentWeekStart - ARCHIVE_WEEKS * WEEK_MS;
  const fetchFrom = new Date(firstWeekStart - 14 * DAY_MS).toISOString();

  const { data, error } = await sb
    .from("board_posts")
    .select("id, title, region, source_name, source_url, source_published_at, created_at, is_automated, is_published")
    .eq("is_published", true)
    .gte("created_at", fetchFrom)
    .order("created_at", { ascending: false })
    .limit(FETCH_LIMIT);
  if (error) {
    throw new Error(`주간 아카이브 조회 실패 (board_posts): ${error.message}`);
  }

  const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;

  /* 상한에 닿았으면 가장 오래된 쪽이 잘렸을 수 있다. 잘린 구간의 주는 개수를
     실제보다 적게 세게 되므로 아예 만들지 않는다 — 적게 센 숫자를 그 주의
     전부인 것처럼 싣느니 그 주를 안 만드는 편이 낫다. */
  let reliableFrom = firstWeekStart;
  if (rows.length >= FETCH_LIMIT) {
    const oldest = rows.reduce((min, r) => {
      const t = Date.parse(String(r.created_at ?? ""));
      return Number.isFinite(t) && t < min ? t : min;
    }, Number.POSITIVE_INFINITY);
    if (Number.isFinite(oldest)) {
      // 잘린 경계가 걸친 주는 통째로 버린다 (그 주의 앞부분이 빠졌을 수 있다)
      reliableFrom = Math.max(reliableFrom, weekStartMs(oldest) + WEEK_MS);
    }
  }

  const buckets = new Map<string, Bucket>();
  for (const row of rows) {
    const published = row.source_published_at ? Date.parse(String(row.source_published_at)) : NaN;
    const created = Date.parse(String(row.created_at ?? ""));
    const atMs = Number.isFinite(published) ? published : created;
    if (!Number.isFinite(atMs)) continue;

    const start = weekStartMs(atMs);
    if (start >= currentWeekStart) continue; // 진행 중인 주(및 미래 시각)는 제외
    if (start < reliableFrom) continue;

    const item = itemOf(row, atMs);
    if (!item.id || !item.title) continue;

    const slug = ymd(start);
    const bucket = buckets.get(slug) ?? { news: [], community: [] };
    if (row.is_automated === true) bucket.news.push(item);
    else bucket.community.push(item);
    buckets.set(slug, bucket);
  }

  for (const bucket of buckets.values()) {
    bucket.news.sort((a, b) => b.at.localeCompare(a.at));
    bucket.community.sort((a, b) => b.at.localeCompare(a.at));
  }
  return buckets;
}

function summaryOf(slug: string, bucket: Bucket): DigestWeekSummary {
  const startMs = weekSlugToMs(slug) ?? 0;
  return {
    slug,
    startMs,
    rangeLabel: weekRangeLabel(startMs),
    ordinalLabel: weekOrdinalLabel(startMs),
    newsCount: bucket.news.length,
    communityCount: bucket.community.length,
    totalCount: bucket.news.length + bucket.community.length,
  };
}

/** 아카이브에 실을 주 목록 (최근 주 → 오래된 주). 조회 실패 시 throw. */
export async function listDigestWeeks(now = new Date()): Promise<DigestWeekSummary[]> {
  const buckets = await loadBuckets(now);
  const weeks: DigestWeekSummary[] = [];
  for (const [slug, bucket] of buckets) {
    const s = summaryOf(slug, bucket);
    if (s.totalCount < MIN_ITEMS) continue;
    weeks.push(s);
  }
  return weeks.sort((a, b) => b.slug.localeCompare(a.slug));
}

/** 한 주. 기준 미달·범위 밖이면 null (없는 주를 만들지 않는다). 조회 실패 시 throw. */
export async function getDigestWeek(
  slug: string,
  now = new Date(),
): Promise<DigestWeek | null> {
  const startMs = weekSlugToMs(slug);
  if (startMs === null) return null;

  const buckets = await loadBuckets(now);
  const bucket = buckets.get(slug);
  if (!bucket) return null;
  const summary = summaryOf(slug, bucket);
  if (summary.totalCount < MIN_ITEMS) return null;

  /* 그 주의 시장 온도. 없으면 없는 대로 둔다 — 최근 주 값으로 채우지 않는다.
     온도 아카이브 조회가 실패하면 그건 이 주가 없다는 뜻이 아니므로 던진다. */
  const { listTemperaturesForWeek } = await import("@/lib/market/temperature-archive");
  const snapshots = await listTemperaturesForWeek(slug);

  return {
    ...summary,
    news: bucket.news.slice(0, NEWS_LIMIT),
    community: bucket.community.slice(0, COMMUNITY_LIMIT),
    temperature: snapshots.slice(0, 8).map((s) => ({
      regionId: s.regionId,
      regionLabel: s.regionLabel,
      score: s.score,
      headline: s.headline,
    })),
  };
}
