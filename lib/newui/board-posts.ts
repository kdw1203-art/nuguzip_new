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

/** board_posts 공개(community) 글 최신순 — 실패 시 빈 배열 */
export async function readBoardPosts(
  limit: number = BOARD_POSTS_LIMIT,
): Promise<Post[]> {
  const sb = getReadOnlySupabase();
  if (!sb) return [];
  try {
    let { data, error } = await sb
      .from("board_posts")
      .select(BOARD_SELECT_WITH_COMMENTS)
      .eq("board_type", "community")
      .eq("is_published", true)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) {
      logger.error("[readBoardPosts] with-comments query failed", error);
      // board_comments 중첩 카운트가 권한 등으로 막히면 카운트 없이 재시도
      ({ data, error } = await sb
        .from("board_posts")
        .select("*")
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
          .select("*")
          .eq("board_type", "community")
          .eq("is_published", true)
          .order("created_at", { ascending: false })
          .limit(limit));
        if (error) logger.error("[readBoardPosts] anon query failed", error);
      }
    }
    if (error || !Array.isArray(data)) return [];
    return data.map((r) => boardRowToPost(r as Record<string, unknown>));
  } catch (e) {
    logger.error("[readBoardPosts]", e);
    return [];
  }
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
 */
export async function readTownPosts(): Promise<Post[]> {
  const [storePosts, boardPosts] = await Promise.all([
    readPosts().catch((e): Post[] => {
      logger.error("[readTownPosts:store]", e);
      return [];
    }),
    readBoardPosts(),
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
