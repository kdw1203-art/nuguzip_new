import { NextResponse } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { findBlockedWord } from "@/lib/community/moderation";
import { POSTS_READ_LIMIT, prependPost, readPosts } from "@/lib/posts-store";
import { decodeComplexId } from "@/lib/complex/complex-store";
import type { Post } from "@/lib/types/post";
import { FUNNEL_EVENT, recordFunnelEvent } from "@/lib/platform-funnel-events";
import { awardPoints } from "@/lib/points/ledger";
import { parsePromptIndex, promptTag } from "@/lib/town/prompts";
import { logger } from "@/lib/log";

export const runtime = "nodejs";

/**
 * 커뮤니티 글 목록.
 *
 * 최신 {@link POSTS_READ_LIMIT} 건까지만 준다 — 예전에는 상한 없이 전량을
 * 실어 보냈다. 받는 쪽이 "이게 전부"라고 오해하지 않도록 상한과 실제 건수를
 * 함께 적어 보낸다(필드 추가라 기존 소비처는 그대로 동작한다).
 */
export async function GET() {
  const posts = await readPosts();
  /* notifyEmail 은 작성자 알림용 서버 전용 값이다(lib/types/post.ts 주석).
     저장소 매핑이 무조건 실어 오는 바람에 익명 GET 응답에 작성자 실이메일이
     전량 노출되고 있었다(2026-08-02 감사) — 응답 직전에 벗긴다. */
  const publicPosts = posts.map(
    ({ notifyEmail: _drop, authorEmail: _drop2, ...rest }) => rest,
  );
  return NextResponse.json({
    posts: publicPosts,
    limit: POSTS_READ_LIMIT,
    truncated: posts.length >= POSTS_READ_LIMIT,
  });
}

export async function POST(req: Request) {
  const session = await safeAuth();
  /* 오픈 정책: 익명 글쓰기는 스팸·책임 소재가 불명확 — 로그인 필수 */
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

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
  // 이름 미설정 계정: 이메일 local part 전체를 공개 라벨로 저장하던 것을
  // 마스킹으로 교체 (inspection/notes·complex-reviews 등과 같은 규칙).
  // 이미 저장된 라벨은 이 코드로는 안 바뀐다 — 데이터 정정은 별건.
  const authorLabel =
    session.user.name?.trim() ||
    `${session.user.email?.split("@")[0]?.slice(0, 2) || "이웃"}** 이웃`;
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

  /* [#63] 글감 답변 태깅 — pi 가 유효한 글감 인덱스이면 스레드 태그를 붙인다.
     (서버가 인덱스 범위를 검증 — 클라이언트 값은 신뢰하지 않는다) */
  const promptIdx = parsePromptIndex(
    typeof b.promptIndex === "string" || typeof b.promptIndex === "number"
      ? String(b.promptIndex)
      : null,
  );
  if (promptIdx !== null) {
    const tag = promptTag(promptIdx);
    if (!tags.includes(tag)) tags.push(tag);
    if (!tags.includes("오늘의질문")) tags.push("오늘의질문");
  }

  const relatedSite = String(b.relatedSite ?? "").trim() || undefined;

  /* 단지 연결 — /complex/[id] 에서 "이 단지 이야기 쓰기"로 넘어온 경우에만 붙는다.
     클라이언트가 보낸 문자열을 그대로 저장하면 존재하지 않는 단지 페이지에 글이
     매달릴 수 있어, decodeComplexId 로 해독되는 값만 받는다(해독 실패 = 버린다).
     지역·단지명까지 복원되므로 이 값은 /complex/<id> 로 반드시 되돌아간다. */
  const complexIdRaw = String(b.complexId ?? "").trim();
  const complexId =
    complexIdRaw && decodeComplexId(complexIdRaw) ? complexIdRaw : undefined;
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
    complexId,
    visibility,
    notifyComments,
    notifyEmail,
    /* 소유 판정용 신원(서버 전용) — 포인트 추천글 부스트가 posts.author_email 로
       "내 글"을 찾는다. notifyEmail 은 알림 설정값이라 신원으로 겸용하지 않는다. */
    authorEmail: session.user.email.trim(),
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
  /* [3차] 참여 적립 — 글 작성 50P(일 2회, 원장 규칙이 상한·중복 방어). fail-soft. */
  let pointsAwarded = 0;
  if (session?.user?.email) {
    try {
      const award = await awardPoints(session.user.email, "post_written", post.id);
      if (award.ok) pointsAwarded = award.awarded;
    } catch (e) {
      logger.error("[post-points]", e);
    }
  }
  /* 서버 전용 값은 만든 본인에게도 굳이 돌려주지 않는다(목록 GET 과 같은 규칙).
     쓰기 화면은 성공 응답 본문을 읽지 않으므로 동작 변화가 없다. */
  const { notifyEmail: _n, authorEmail: _a, ...publicPost } = post;
  return NextResponse.json({ post: publicPost, pointsAwarded }, { status: 201 });
}
