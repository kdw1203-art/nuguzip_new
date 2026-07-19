import { NextResponse } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { findBlockedWord } from "@/lib/community/moderation";
import { prependPost, readPosts } from "@/lib/posts-store";
import type { Post } from "@/lib/types/post";
import { FUNNEL_EVENT, recordFunnelEvent } from "@/lib/platform-funnel-events";

export const runtime = "nodejs";

export async function GET() {
  const posts = await readPosts();
  return NextResponse.json({ posts });
}

export async function POST(req: Request) {
  const session = await safeAuth();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON 본문이 필요합니다." }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  const title = String(b.title ?? "").trim();
  const content = String(b.body ?? b.content ?? "").trim();
  const city = String(b.city ?? "").trim();
  const district = String(b.district ?? "").trim();
  const category = String(b.category ?? "").trim();
  const fromClient = String(b.authorLabel ?? "").trim();
  const authorLabel = session?.user
    ? (session.user.name?.trim() ||
        session.user.email?.split("@")[0]?.trim() ||
        "회원")
    : fromClient || "익명";
  const tagsRaw = b.tags;
  const tags =
    typeof tagsRaw === "string"
      ? tagsRaw
          .split(/[#,]/g)
          .map((t) => t.trim())
          .filter(Boolean)
      : Array.isArray(tagsRaw)
        ? tagsRaw.map((t) => String(t).trim()).filter(Boolean)
        : [];

  const relatedSite = String(b.relatedSite ?? "").trim() || undefined;
  const imageUrlsRaw = b.imageUrls;
  const imageUrls = Array.isArray(imageUrlsRaw)
    ? imageUrlsRaw.map((u) => String(u).trim()).filter(Boolean).slice(0, 6)
    : [];
  const visibilityRaw = String(b.visibility ?? "public").trim();
  const visibility =
    visibilityRaw === "link_only" ? ("link_only" as const) : ("public" as const);
  const notifyComments = Boolean(b.notifyComments ?? true);
  const notifyEmail = session?.user?.email?.trim() || undefined;

  const rawUgc = String(b.ugcPostType ?? b.postKind ?? "general").trim();
  const ugcPostType: Post["ugcPostType"] =
    rawUgc === "question" || rawUgc === "review" || rawUgc === "tip" || rawUgc === "general"
      ? rawUgc
      : "general";

  if (!title || title.length < 2) {
    return NextResponse.json(
      { error: "제목은 2글자 이상 입력해 주세요." },
      { status: 400 },
    );
  }
  if (!content || content.length < 5) {
    return NextResponse.json(
      { error: "본문은 5글자 이상 입력해 주세요." },
      { status: 400 },
    );
  }
  if (!city || !district || !category) {
    return NextResponse.json(
      { error: "시·도, 시·군·구, 카테고리를 선택해 주세요." },
      { status: 400 },
    );
  }

  // 모더레이션 필터 (#84): 구 lib 금칙어 검사(lib/community/moderation)를
  // 제출 경로에서 서버측으로 적용 — 위반 시 안내 문구와 함께 400
  const blockedWord =
    findBlockedWord(title) ??
    findBlockedWord(content) ??
    (tags.length ? findBlockedWord(tags.join(" ")) : null);
  if (blockedWord) {
    return NextResponse.json(
      {
        error: `커뮤니티 이용 규칙에 어긋나는 표현(“${blockedWord}”)이 포함되어 있어요. 해당 표현을 수정한 뒤 다시 등록해 주세요.`,
        blockedWord,
      },
      { status: 400 },
    );
  }

  const now = new Date().toISOString();
  const post: Post = {
    id: crypto.randomUUID(),
    authorLabel,
    category,
    city,
    district,
    title,
    body: content,
    tags,
    createdAt: now,
    updatedAt: now,
    likeCount: 0,
    commentCount: 0,
    viewCount: 0,
    comments: [],
    relatedSite,
    visibility,
    notifyComments,
    notifyEmail,
    ugcPostType,
    ...(imageUrls.length
      ? {
          automationMeta: {
            attachments: imageUrls,
          },
        }
      : {}),
  };

  try {
    await prependPost(post);
  } catch {
    return NextResponse.json(
      { error: "게시글 저장에 실패했습니다. Supabase 테이블·RLS·키를 확인해 주세요." },
      { status: 500 },
    );
  }
  if (session?.user?.email) {
    void recordFunnelEvent(req, {
      eventName: FUNNEL_EVENT.COMMUNITY_POST_CREATE,
      userEmail: session.user.email,
      path: "/api/community/posts",
      metadata: { postId: post.id, ugcPostType, district, category },
    });
  }
  return NextResponse.json({ post }, { status: 201 });
}
