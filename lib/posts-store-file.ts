import { promises as fs } from "fs";
import path from "path";
import type { Post, PostComment } from "@/lib/types/post";

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "posts.json");
const LIKES_FILE = path.join(DATA_DIR, "post_likes.json");

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

function normalizePost(row: unknown): Post {
  const p = row as Partial<Post>;
  const vis = p.visibility;
  const visibility =
    vis === "link_only" || vis === "public" ? vis : undefined;
  return {
    id: String(p.id ?? ""),
    authorLabel: String(p.authorLabel ?? "익명"),
    category: String(p.category ?? "자유"),
    city: String(p.city ?? "서울특별시"),
    district: String(p.district ?? "중구"),
    title: String(p.title ?? ""),
    body: String(p.body ?? ""),
    tags: Array.isArray(p.tags) ? p.tags.map(String) : [],
    createdAt: String(p.createdAt ?? new Date().toISOString()),
    updatedAt: String(p.updatedAt ?? p.createdAt ?? new Date().toISOString()),
    likeCount: Number(p.likeCount ?? 0),
    commentCount: Number(p.commentCount ?? (p.comments?.length ?? 0)),
    viewCount: Number(p.viewCount ?? 0),
    comments: Array.isArray(p.comments)
      ? p.comments.map((c) => ({
          id: String((c as PostComment).id),
          authorLabel: String((c as PostComment).authorLabel ?? "익명"),
          body: String((c as PostComment).body ?? ""),
          createdAt: String(
            (c as PostComment).createdAt ?? new Date().toISOString(),
          ),
        }))
      : [],
    relatedSite: p.relatedSite ? String(p.relatedSite) : undefined,
    sourceUrl: (() => {
      const raw = p.sourceUrl ?? (p as { source_url?: string }).source_url;
      const s = raw != null ? String(raw).trim() : "";
      return s ? s : undefined;
    })(),
    sourceName: (() => {
      const raw = p.sourceName ?? (p as { source_name?: string }).source_name;
      const s = raw != null ? String(raw).trim() : "";
      return s ? s : undefined;
    })(),
    sourcePublishedAt: (() => {
      const raw =
        p.sourcePublishedAt ??
        (p as { source_published_at?: string }).source_published_at;
      const s = raw != null ? String(raw).trim() : "";
      return s ? s : undefined;
    })(),
    externalKey: (() => {
      const raw = p.externalKey ?? (p as { external_key?: string }).external_key;
      const s = raw != null ? String(raw).trim() : "";
      return s ? s : undefined;
    })(),
    isAutomated:
      typeof p.isAutomated === "boolean"
        ? p.isAutomated
        : typeof (p as { is_automated?: boolean }).is_automated === "boolean"
          ? (p as { is_automated?: boolean }).is_automated
          : undefined,
    automationMeta:
      p.automationMeta && typeof p.automationMeta === "object"
        ? p.automationMeta
        : (p as { automation_meta?: Post["automationMeta"] }).automation_meta &&
            typeof (p as { automation_meta?: Post["automationMeta"] }).automation_meta === "object"
          ? (p as { automation_meta?: Post["automationMeta"] }).automation_meta
          : undefined,
    visibility,
    notifyComments:
      typeof p.notifyComments === "boolean" ? p.notifyComments : undefined,
    notifyEmail: (() => {
      const raw =
        p.notifyEmail ?? (p as { notify_email?: string }).notify_email;
      const s = raw != null ? String(raw).trim() : "";
      return s ? s : undefined;
    })(),
    ugcPostType: (() => {
      const u = p.ugcPostType ?? (p as { ugc_post_type?: string }).ugc_post_type;
      if (u === "question" || u === "review" || u === "tip" || u === "general") return u;
      return undefined;
    })(),
  };
}

export async function readPostsFile(): Promise<Post[]> {
  try {
    const raw = await fs.readFile(DATA_FILE, "utf-8");
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizePost);
  } catch {
    return [];
  }
}

async function writePostsFile(posts: Post[]): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(DATA_FILE, JSON.stringify(posts, null, 2), "utf-8");
}

export async function prependPostFile(post: Post): Promise<void> {
  const posts = await readPostsFile();
  posts.unshift(post);
  await writePostsFile(posts);
}

export async function getPostFile(id: string): Promise<Post | null> {
  const posts = await readPostsFile();
  return posts.find((p) => p.id === id) ?? null;
}

export async function incrementViewCountFile(id: string): Promise<Post | null> {
  const posts = await readPostsFile();
  const idx = posts.findIndex((p) => p.id === id);
  if (idx === -1) return null;
  const next = {
    ...posts[idx],
    viewCount: posts[idx].viewCount + 1,
    updatedAt: new Date().toISOString(),
  };
  posts[idx] = next;
  await writePostsFile(posts);
  return next;
}

export async function updatePostFile(
  id: string,
  patch: Partial<Post>,
): Promise<Post | null> {
  const posts = await readPostsFile();
  const idx = posts.findIndex((p) => p.id === id);
  if (idx === -1) return null;
  const next: Post = {
    ...posts[idx],
    ...patch,
    id: posts[idx].id,
    createdAt: posts[idx].createdAt,
    updatedAt: new Date().toISOString(),
  };
  posts[idx] = next;
  await writePostsFile(posts);
  return next;
}

export async function deletePostFile(id: string): Promise<boolean> {
  const posts = await readPostsFile();
  const next = posts.filter((p) => p.id !== id);
  if (next.length === posts.length) return false;
  await writePostsFile(next);
  const likes = await readLikesMap();
  if (likes[id]) {
    delete likes[id];
    await writeLikesMap(likes);
  }
  return true;
}

export async function appendCommentFile(
  id: string,
  comment: PostComment,
): Promise<Post | null> {
  const posts = await readPostsFile();
  const idx = posts.findIndex((p) => p.id === id);
  if (idx === -1) return null;
  const post = posts[idx];
  const comments = [...post.comments, comment];
  const next: Post = {
    ...post,
    comments,
    commentCount: comments.length,
    updatedAt: new Date().toISOString(),
  };
  posts[idx] = next;
  await writePostsFile(posts);
  return next;
}

export async function softDeleteCommentFile(
  postId: string,
  commentId: string,
): Promise<Post | null> {
  const posts = await readPostsFile();
  const idx = posts.findIndex((p) => p.id === postId);
  if (idx === -1) return null;
  const post = posts[idx];
  const now = new Date().toISOString();
  const comments = post.comments.map((c) =>
    c.id === commentId
      ? { ...c, body: "[삭제된 댓글입니다]", deletedAt: now }
      : c,
  );
  const next: Post = { ...post, comments, updatedAt: now };
  posts[idx] = next;
  await writePostsFile(posts);
  return next;
}

type LikesMap = Record<string, string[]>;

export async function readLikesMap(): Promise<LikesMap> {
  try {
    const raw = await fs.readFile(LIKES_FILE, "utf-8");
    const j = JSON.parse(raw) as unknown;
    if (!j || typeof j !== "object") return {};
    const rec = j as Record<string, unknown>;
    const out: LikesMap = {};
    for (const [k, v] of Object.entries(rec)) {
      if (Array.isArray(v)) out[k] = v.map(String);
    }
    return out;
  } catch {
    return {};
  }
}

export async function userHasLikedFile(
  postId: string,
  userKey: string,
): Promise<boolean> {
  const m = await readLikesMap();
  return (m[postId] ?? []).includes(userKey);
}

async function writeLikesMap(m: LikesMap): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(LIKES_FILE, JSON.stringify(m, null, 2), "utf-8");
}

/** post_likes.json + posts.json 동기화 (로컬 파일 백엔드) */
export async function togglePostLikeFile(
  postId: string,
  userKey: string,
): Promise<{ liked: boolean; likeCount: number } | null> {
  const posts = await readPostsFile();
  const idx = posts.findIndex((p) => p.id === postId);
  if (idx === -1) return null;

  const likes = await readLikesMap();
  const cur = new Set(likes[postId] ?? []);
  const had = cur.has(userKey);
  if (had) cur.delete(userKey);
  else cur.add(userKey);
  const nextArr = [...cur];
  likes[postId] = nextArr;
  await writeLikesMap(likes);

  const post = posts[idx];
  const next: Post = {
    ...post,
    likeCount: nextArr.length,
    updatedAt: new Date().toISOString(),
  };
  posts[idx] = next;
  await writePostsFile(posts);
  return { liked: !had, likeCount: nextArr.length };
}
