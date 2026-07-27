/**
 * 운영 DB `board_posts` 테이블(자동 수집 뉴스·커뮤니티 글) 읽기 전용 로더.
 *
 * 신규 UI의 posts 스토어(`posts` 테이블, lib/posts-store)와 별개로 구 운영
 * 파이프라인이 적재해 온 테이블이라, town 화면에서는 두 소스를 모두 읽어
 * 병합(최신순)해 쓴다. 실패·빈 데이터 시 빈 배열 → 페이지 쪽 목업 폴백 유지.
 *
 * board_posts 컬럼: id(uuid)·author_id·board_type("community"|"report")·
 * category·region("서울"/"경기"/…)·title·content·tags(jsonb)·ai_summary·
 * source_url·source_name·source_published_at·external_key·is_automated·
 * automation_meta(jsonb)·is_published·created_at·updated_at
 */
import "server-only";
import { cache } from "react";
import {
  getAnonReadOnlySupabase,
  getReadOnlySupabase,
} from "@/lib/newui/supabase-read";
import { getPost, readPosts } from "@/lib/posts-store";
import type { Post, PostAutomationMeta } from "@/lib/types/post";
import { logger } from "@/lib/log";

const BOARD_POSTS_LIMIT = 300;

type BoardCommentsCount = Array<{ count: number }> | null | undefined;

function commentCountOf(row: Record<string, unknown>): number {
  const nested = row.board_comments as BoardCommentsCount;
  if (Array.isArray(nested) && typeof nested[0]?.count === "number") {
    return nested[0].count;
  }
  return 0;
}

function boardRowToPost(row: Record<string, unknown>): Post {
  const isAutomated = row.is_automated === true;
  const sourceName = row.source_name ? String(row.source_name) : undefined;
  const createdAt = String(row.created_at ?? new Date().toISOString());
  const tags = Array.isArray(row.tags) ? (row.tags as unknown[]).map(String) : [];
  return {
    id: String(row.id),
    authorLabel: isAutomated ? sourceName || "뉴스 자동수집" : "이웃",
    category: String(row.category ?? (isAutomated ? "뉴스" : "자유")),
    city: row.region ? String(row.region) : "",
    district: "",
    title: String(row.title ?? ""),
    body: String(row.content ?? ""),
    tags,
    createdAt,
    updatedAt: String(row.updated_at ?? createdAt),
    likeCount: 0,
    commentCount: commentCountOf(row),
    viewCount: 0,
    comments: [],
    sourceUrl: row.source_url ? String(row.source_url) : undefined,
    sourceName,
    sourcePublishedAt: row.source_published_at
      ? String(row.source_published_at)
      : undefined,
    externalKey: row.external_key ? String(row.external_key) : undefined,
    isAutomated: isAutomated || undefined,
    automationMeta:
      row.automation_meta &&
      typeof row.automation_meta === "object" &&
      !Array.isArray(row.automation_meta)
        ? (row.automation_meta as PostAutomationMeta)
        : undefined,
  };
}

const BOARD_SELECT_WITH_COMMENTS = "*, board_comments(count)";

/* ---------- 뉴스 품질 게이트 (#24) ----------
 * 자동 수집 뉴스의 저품질 항목을 노출 전에 걸러낸다:
 *  1) 광고 표기 제목 — "[부동산 AD]", "[AD]", "[광고]", "(광고)", "AD)" 접두 등
 *  2) 제목 8자 미만 — 잘린/무의미 제목 (자동 수집 글에만 적용, 이웃 글은 유지)
 *  3) external_key 중복 — 같은 원문이 두 번 적재된 경우 최신 1건만 유지
 *     (readTownPosts 병합 단계의 id·external_key dedup 은 그대로 유지됨)
 * 제외 건수는 logger 로 남긴다.
 */

/** 광고 표기 제목 패턴 — 본문 중 "광고" 단어 언급(예: 허위 광고 단속)은 제외하지 않도록 표기형만 매칭 */
const AD_TITLE_RE =
  /\[\s*(?:부동산\s*)?AD\s*\]|\[\s*광고\s*\]|\(\s*광고\s*\)|^\s*(?:AD|광고)\s*[)\]:·-]/i;

function isAdTitle(title: string): boolean {
  return AD_TITLE_RE.test(title);
}

/** 품질 게이트 적용 — 제외 사유별 건수를 로그로 남기고 통과분만 반환 */
function applyNewsQualityGate(posts: Post[]): Post[] {
  let excludedShortTitle = 0;
  let excludedAdTitle = 0;
  let excludedDupKey = 0;
  const seenExternalKeys = new Set<string>();
  const passed: Post[] = [];
  for (const p of posts) {
    const title = p.title.trim();
    if (isAdTitle(title)) {
      excludedAdTitle += 1;
      continue;
    }
    // 제목 8자 미만: 자동 수집(뉴스) 글에만 적용 — 이웃이 쓴 짧은 제목 글은 유지
    if (p.isAutomated && title.length < 8) {
      excludedShortTitle += 1;
      continue;
    }
    if (p.externalKey) {
      if (seenExternalKeys.has(p.externalKey)) {
        excludedDupKey += 1;
        continue;
      }
      seenExternalKeys.add(p.externalKey);
    }
    passed.push(p);
  }
  const excludedTotal = excludedShortTitle + excludedAdTitle + excludedDupKey;
  if (excludedTotal > 0) {
    logger.info(
      `[readBoardPosts] 품질 게이트 제외 ${excludedTotal}건 (짧은 제목 ${excludedShortTitle} · 광고 표기 ${excludedAdTitle} · external_key 중복 ${excludedDupKey})`,
    );
  }
  return passed;
}

/**
 * 관련글 카드에 실제로 그려지는 컬럼만 — 본문(content)과 automation_meta 를 뺀다.
 *
 * 행 평균 2,495B 중 content 795B · automation_meta 868B 로 둘이 3분의 2다.
 * 관련글은 제목·분류·출처·시각만 쓰므로 그 둘을 안 읽으면 전송량이 1/5 이 된다.
 * 품질 게이트(제목·is_automated·external_key)와 정렬·중복 제거(id·external_key·
 * created_at·source_published_at)에 필요한 컬럼은 전부 남겨 뒀다 — 그래서
 * 고르는 글 자체는 전체 컬럼을 읽을 때와 **같다**.
 *
 * board_comments 카운트도 뺐다. 관련글 카드는 댓글 수를 그리지 않고,
 * 그 중첩 집계가 anon 3초 statement_timeout 을 때리는 원인이기도 하다.
 */
const BOARD_SELECT_LIGHT =
  "id,board_type,category,region,title,source_url,source_name," +
  "source_published_at,external_key,is_automated,created_at,updated_at";

type BoardQueryKind = "full" | "light";

/** 실제 조회 — 요청당 한 번만 나가도록 아래 read* 래퍼가 감싼다. */
async function fetchBoardPosts(limit: number, kind: BoardQueryKind): Promise<Post[]> {
  const sb = getReadOnlySupabase();
  if (!sb) return [];
  const plain = kind === "light" ? BOARD_SELECT_LIGHT : "*";
  const primary = kind === "light" ? BOARD_SELECT_LIGHT : BOARD_SELECT_WITH_COMMENTS;
  try {
    let { data, error } = await sb
      .from("board_posts")
      .select(primary)
      .eq("board_type", "community")
      .eq("is_published", true)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error && primary !== plain) {
      logger.error("[readBoardPosts] with-comments query failed", error);
      // board_comments 중첩 카운트가 권한 등으로 막히면 카운트 없이 재시도
      ({ data, error } = await sb
        .from("board_posts")
        .select(plain)
        .eq("board_type", "community")
        .eq("is_published", true)
        .order("created_at", { ascending: false })
        .limit(limit));
    }
    if (error) {
      logger.error("[readBoardPosts] plain query failed", error);
      // Service Role 키 무효 등 클라이언트 자체 문제 대비 — anon으로 마지막 재시도
      const anon = getAnonReadOnlySupabase();
      if (anon && anon !== sb) {
        ({ data, error } = await anon
          .from("board_posts")
          .select(plain)
          .eq("board_type", "community")
          .eq("is_published", true)
          .order("created_at", { ascending: false })
          .limit(limit));
        if (error) logger.error("[readBoardPosts] anon query failed", error);
      }
    }
    if (error || !Array.isArray(data)) return [];
    /* select() 인자가 리터럴이 아니라 변수라서 supabase-js 의 타입 수준 파서가
       행 모양을 못 풀고 GenericStringError 로 떨어진다. 런타임 모양은 그대로
       행 객체이므로 unknown 을 한 번 거쳐 넘긴다. */
    return applyNewsQualityGate(
      data.map((r) => boardRowToPost(r as unknown as Record<string, unknown>)),
    );
  } catch (e) {
    logger.error("[readBoardPosts]", e);
    return [];
  }
}

/**
 * 요청 단위 dedup — 같은 렌더 안에서 board_posts 를 한 번만 읽는다.
 *
 * 실측: /town/news 한 번 그릴 때 이 조회가 **세 번** 나갔다 — 본문의
 * readTownPosts(), getWeeklyDigest→computeNews, getWeeklyDigest→readTownPosts.
 * 홈(app/page.tsx)도 digest 경유로 두 번. 한 번에 300행(행당 ~2.5KB, 약 750KB)
 * 이라 이게 pg_stat_statements 상 DB 시간 1위였다.
 *
 * 배열 인스턴스를 공유해도 안전하다 — 모든 소비처가 정렬·가공 전에 .filter()
 * (새 배열 할당)를 먼저 거친다. 공유 배열을 그 자리에서 뒤집는 곳은 없다.
 *
 * 기본값은 cache() **바깥**에서 채운다. React cache() 는 실제로 넘어온 인자로
 * 키를 잡아서, readBoardPosts() 와 readBoardPosts(300)(app/support/page.tsx:34)
 * 이 서로 다른 항목이 되어 버리기 때문이다.
 */
const loadBoardPosts = cache(fetchBoardPosts);

/** board_posts 공개(community) 글 최신순 — 실패 시 빈 배열. 요청당 1회로 접힌다. */
export function readBoardPosts(limit: number = BOARD_POSTS_LIMIT): Promise<Post[]> {
  return loadBoardPosts(limit, "full");
}

/** 관련글용 경량 조회 — 본문·automation_meta 없이. 요청당 1회로 접힌다. */
function readLightBoardPosts(): Promise<Post[]> {
  return loadBoardPosts(BOARD_POSTS_LIMIT, "light");
}

/** board_posts 단건 조회 — 없거나 실패 시 null */
export async function getBoardPost(id: string): Promise<Post | null> {
  // board_posts id 는 uuid — 형식이 다르면 쿼리 자체를 생략
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return null;
  }
  const sb = getReadOnlySupabase();
  if (!sb) return null;
  try {
    let { data, error } = await sb
      .from("board_posts")
      .select(BOARD_SELECT_WITH_COMMENTS)
      .eq("id", id)
      .eq("is_published", true)
      .maybeSingle();
    if (error) {
      ({ data, error } = await sb
        .from("board_posts")
        .select("*")
        .eq("id", id)
        .eq("is_published", true)
        .maybeSingle());
    }
    if (error || !data) return null;
    return boardRowToPost(data as Record<string, unknown>);
  } catch (e) {
    logger.error("[getBoardPost]", e);
    return null;
  }
}

function displayTime(p: Post): number {
  const t = Date.parse(p.sourcePublishedAt || p.createdAt);
  return Number.isFinite(t) ? t : 0;
}

/**
 * town 화면용 병합 피드 — posts 스토어 + board_posts 둘 다 시도해 합치고
 * (id·external_key 로 중복 제거) 최신순 정렬. 실패 시 빈 배열.
 *
 * readBoardPosts 와 같은 이유로 요청당 1회로 접는다 — /town/news 는 본문과
 * getWeeklyDigest 양쪽에서 이걸 부른다. 인자가 없어 캐시 키 문제도 없다.
 */
export const readTownPosts = cache((): Promise<Post[]> => mergeTownPosts(readBoardPosts()));

/**
 * 관련글 전용 병합 피드 — readTownPosts 와 **고르는 글이 같다**.
 *
 * 다른 점은 board_posts 쪽에서 본문·automation_meta 를 안 읽는다는 것뿐이다.
 * 정렬·중복 제거·품질 게이트가 쓰는 컬럼은 그대로 읽으므로 순서도 결과도
 * 같고, 관련글 카드가 그리는 건 제목·출처·시각뿐이라 빠진 컬럼은 화면에
 * 닿지 않는다. /town/news/[id] 는 뉴스 453건마다 한 장씩 있어서, 한 장을
 * 그리려고 300행 × 2.5KB 를 읽던 게 이 경로에서 제일 큰 낭비였다.
 */
export const readRelatedTownPosts = cache(
  (): Promise<Post[]> => mergeTownPosts(readLightBoardPosts()),
);

async function mergeTownPosts(boardPromise: Promise<Post[]>): Promise<Post[]> {
  const [storePosts, boardPosts] = await Promise.all([
    readPosts().catch((e): Post[] => {
      logger.error("[readTownPosts:store]", e);
      return [];
    }),
    boardPromise,
  ]);
  const seen = new Set<string>();
  const merged: Post[] = [];
  for (const p of [...storePosts, ...boardPosts]) {
    const keys = [p.id, p.externalKey].filter((k): k is string => Boolean(k));
    if (keys.some((k) => seen.has(k))) continue;
    keys.forEach((k) => seen.add(k));
    merged.push(p);
  }
  return merged.sort((a, b) => displayTime(b) - displayTime(a));
}

/** town 상세용 단건 — posts 스토어 우선, 없으면 board_posts */
export async function getTownPost(id: string): Promise<Post | null> {
  const fromStore = await getPost(id).catch((): Post | null => null);
  if (fromStore) return fromStore;
  return getBoardPost(id);
}
