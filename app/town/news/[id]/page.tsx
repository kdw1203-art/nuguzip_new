import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "../../../components/PageShell";
import { AIPanel } from "../../../components/AIPanel";
import { ReportButton } from "../../../components/ReportButton";
import { getTownPost, readRelatedTownPosts } from "@/lib/newui/board-posts";
import { isPostHidden } from "@/lib/moderation/reports-store";
import type { Post } from "@/lib/types/post";
import { logger } from "@/lib/log";
import { newsImageUrl } from "../../shared";
import { LocationMap } from "../../LocationMap";
import { regionIdForName } from "@/lib/region/catalog";
import { resolveComplexHref } from "@/lib/newui/complex-link";
import { CoverImage } from "@/app/components/CoverImage";
import { AdSlot } from "@/app/components/ads/AdSlot";
import { getAdViewer } from "@/lib/ads/viewer";
import { PostActions, CommentForm, LikeButton } from "./PostInteractions";

/* 뉴스 상세 — posts 실데이터(id 조회) 연동. 없는 글은 notFound() (사실 우선: 목업 기사 금지). */

export const dynamic = "force-dynamic";

/* ---------- 헬퍼 ---------- */

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "방금 전";
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}일 전`;
  return new Date(iso).toLocaleDateString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
  });
}

function fullDateTime(iso: string) {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function shortDate(iso: string) {
  const d = new Date(iso);
  return `${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

function paragraphs(body: string): string[] {
  const parts = body
    .replace(/\r/g, "")
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length > 1) return parts;
  // 개행 없는 본문은 문장 단위로 2~3문단 분할
  const sentences = body.split(/(?<=[.다요!?])\s+/).filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < sentences.length; i += 3) {
    out.push(sentences.slice(i, i + 3).join(" "));
  }
  return out.length > 0 ? out : [body];
}

/* ---------- SEO ----------
 *
 * 이 페이지에는 generateMetadata 가 아예 없었다. 453장이 전부 레이아웃 기본
 * 제목으로 나가고 있었다는 뜻이다 — 검색 결과에서 서로 구분되지 않는다.
 *
 * robots 를 noindex, follow 로 두는 이유(실측 2026-07-27):
 *   board_posts 의 공개 글 453건은 **전부** is_automated = true 이고 453건
 *   모두 source_url 을 갖고 있다. 118개 외부 매체에서 모아 온 기사 요약본이고
 *   본문 평균 길이는 533자다. 우리가 쓴 글이 한 건도 없다. 이걸 색인시키면
 *   원문과 중복되는 얇은 페이지 453장을 사이트에 붙이는 셈이라, 사이트 전체
 *   품질 신호에 마이너스다. 이미 같은 판단으로 사이트맵에도 넣지 않았다
 *   (lib/seo/build-sitemap.ts 에는 허브 /town/news 만 있다) — 그 결정을
 *   메타에도 똑같이 적어 두는 것뿐이다.
 *
 *   follow 는 남긴다. 링크는 따라가되 이 URL 자체를 색인하지 말라는 뜻이라,
 *   허브·지역 링크로 가는 신호는 그대로 흐른다.
 *
 *   나중에 이웃이 직접 쓴 글이 쌓이면 is_automated 로 갈라서 사람이 쓴 글만
 *   index: true 로 돌리면 된다. 지금은 그 글이 0건이라 가를 것이 없다.
 *
 * 조회 실패는 여기서도 던진다 — 본문과 같은 이유다. 못 읽은 것을 "없는 글"로
 * 바꿔 적지 않는다. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const post = await getTownPost(id);
  if (!post) {
    return {
      title: "글을 찾을 수 없습니다 | 누구집",
      description: "요청하신 글을 찾을 수 없습니다.",
      robots: { index: false, follow: false },
    };
  }

  const where = [post.city, post.district].filter(Boolean).join(" ").trim();
  const source = post.sourceName?.trim();
  const descParts = [
    where || "전국",
    post.category,
    source ? `출처 ${source}` : null,
  ].filter(Boolean);
  const body = post.body.replace(/\s+/g, " ").trim();

  return {
    title: `${post.title} | 누구집`,
    description: body ? body.slice(0, 150) : `${descParts.join(" · ")} 부동산 소식.`,
    robots: { index: false, follow: true },
  };
}

/* ---------- 페이지 ---------- */

export default async function TownNewsDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let similarPosts: { id: string | null; title: string; meta: string }[] = [];
  /* 웹19 — 목록 정렬(readTownPosts 와 동일) 기준 이웃 글. 목록으로 돌아가지
     않고 다음 기사로 넘어가는 동선. 현재 글이 목록에 없으면(숨김 등) 생략. */
  let newerPost: { id: string | null; title: string } | null = null;
  let olderPost: { id: string | null; title: string } | null = null;
  /* posts 스토어 + board_posts(운영 DB) 병합 실데이터.
     try/catch 로 실패를 null 로 바꾸던 자리다 — 아래 notFound() 와 만나서
     조회 실패가 404 로 나갔다. 이제 실패는 던지고 5xx 가 된다(사유는
     lib/newui/board-posts.ts 의 getBoardPost 주석). */
  const post: Post | null = await getTownPost(id);
  // 사실 우선: 존재하지 않는 글은 목업 기사 대신 404
  if (!post) notFound();
  // 신고 누적/처리로 숨김된 글(posts.visibility="hidden")도 상세 노출 차단(#7)
  if (await isPostHidden(id).catch(() => false)) notFound();

  try {
    /* 관련글은 제목·분류·출처·시각만 쓴다 — 본문·automation_meta 는 안 읽는다.
       고르는 글은 readTownPosts 와 같다(정렬·중복 제거·품질 게이트 컬럼 동일). */
    const all = await readRelatedTownPosts();
    const sameCat = all.filter(
      (p) => p.id !== post!.id && p.category === post!.category,
    );
    const others = all.filter(
      (p) => p.id !== post!.id && p.category !== post!.category && p.isAutomated,
    );
    similarPosts = [...sameCat, ...others].slice(0, 3).map((p) => ({
      id: p.id,
      title: p.title,
      meta: `${p.sourceName || p.authorLabel} · ${shortDate(p.sourcePublishedAt || p.createdAt)}`,
    }));
    // 웹19 — 이웃 글(목록과 같은 정렬: 앞쪽이 더 최신)
    const idx = all.findIndex((p) => p.id === post!.id);
    if (idx >= 0) {
      const newer = idx > 0 ? all[idx - 1] : null;
      const older = idx < all.length - 1 ? all[idx + 1] : null;
      if (newer) newerPost = { id: newer.id, title: newer.title };
      if (older) olderPost = { id: older.id, title: older.title };
    }
  } catch (e) {
    /* 여기서만 실패를 삼킨다. 관련글은 부가 섹션이고, 아래 렌더는 목록이 비면
       섹션 자체를 안 그린다(similarPosts.length > 0). 즉 실패해도 화면이
       "관련 글이 없다"고 **말하지 않는다** — 사라질 뿐이다. 본문은 이미 위에서
       읽었고, 그쪽 실패는 던져서 5xx 로 나간다(404 로 위장하지 않는다). */
    logger.error("[/town/news/[id]] 관련글 조회 실패", e);
    similarPosts = [];
  }

  const isAutomated = Boolean(post.isAutomated);
  const byline = isAutomated
    ? `자동 수집 · ${post.sourceName || "뉴스 자동수집"} · ${fullDateTime(post.sourcePublishedAt || post.createdAt)}`
    : `${post.authorLabel} · ${fullDateTime(post.createdAt)}`;
  const title = post.title;
  const category = post.category;
  const region = [post.city, post.district].filter(Boolean).join(" ") || "전국";
  const bodyParas = paragraphs(post.body);
  const summary = bodyParas
    .slice(0, 3)
    .map((s, i) => `${["①", "②", "③"][i] ?? "·"} ${s.slice(0, 55)}`);
  const activeComments = post.comments.filter((c) => !c.deletedAt).slice(0, 8);
  const commentCount = post.commentCount;
  const likeCount = post.likeCount;
  const saveCount = post.bookmarkCount ?? 0;
  const heroImage = newsImageUrl(post);
  // 광고 자리표시자를 실제 슬롯으로 바꾸면서 필요해진 값. 이 라우트는 force-dynamic 이라
  // 세션을 읽어도 캐시가 깨지지 않는다.
  const viewer = await getAdViewer();

  /* 고도화 26 — 연관 단지가 실제 단지로 리졸브되면 시세 페이지로 잇는다.
     리졸버는 동명 타지역 오연결을 막는 보수적 매칭이라, null 이면 지금처럼
     텍스트로만 남긴다(죽은 링크 금지). */
  const relatedSiteHref = post.relatedSite
    ? await resolveComplexHref(post.relatedSite, post.district || post.city).catch(
        () => null,
      )
    : null;

  return (
    <PageShell breadcrumb={`자료 › ${category} › ${region}`}>
      {/* 저장·공유는 실제로 동작하는 버튼이다(POST /api/bookmarks · Web Share).
          자세한 경위는 PostInteractions.tsx 주석 참고. */}
      <PostActions postId={post.id} title={title} saveCount={saveCount} />

      <div className="grid grid-cols-1 gap-5 md:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-4">
          {/* ---------- 기사 본문 ---------- */}
          <article className="rise-in card flex flex-col gap-4 rounded-[20px] p-7">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-[5px] bg-[#fdf3e7] px-2 py-[3px] text-[11px] font-extrabold text-warning">
                {category}
              </span>
              <span className="truncate text-xs text-text-3">{byline}</span>
              {/* 고도화 11 — 기사 지역 → 지역 시세 랜딩. regionIdForName 으로
                  해석되는 시군구만 링크한다 — "서울" 같은 광역명은 지역 id 가
                  없어 해석 실패 시 링크를 만들지 않는다(죽은 링크 금지). */}
              {(() => {
                const rid =
                  regionIdForName(
                    [post.city, post.district].filter(Boolean).join(" "),
                  ) ?? (post.district ? regionIdForName(post.district) : null);
                return rid ? (
                  <Link
                    href={`/region/${rid}`}
                    className="chip border border-line bg-bg px-2.5 py-1 text-[11px] font-bold text-primary no-underline"
                  >
                    {region} 시세 보기 ›
                  </Link>
                ) : null;
              })()}
            </div>
            <h1 className="text-2xl font-extrabold leading-[1.4] text-ink">
              {title}
            </h1>

            <AIPanel title="3줄 요약">
              {summary.map((s, i) => (
                <span key={i}>
                  {i > 0 && <br />}
                  {s}
                </span>
              ))}
            </AIPanel>

            {/* 원문 사진 — 자동수집 automation_meta 의 og:image 를 그대로 쓴다.
                예전에는 사진이 있든 없든 "원문 기사 사진 — 지역 (출처: …)" 이라고
                고정폭 글꼴로 적힌 회색 상자를 280px 높이로 깔았다. 목록 화면은
                같은 데이터로 실사진을 이미 보여 주고 있었으므로, 없는 사진을
                설명하는 상자 대신 있는 사진을 보여 준다. 없으면 아무것도 그리지
                않는다 — 빈 상자는 자리만 밀고 정보가 없다. */}
            {heroImage ? (
              /* 최적화 22 — 로드 전 높이 0 → 로드 후 본문이 밀리는 CLS.
                 16:9 비율 상자를 먼저 잡아 레이아웃을 고정한다(og:image 표준 비율). */
              <div className="relative aspect-[16/9] max-h-[380px] w-full overflow-hidden rounded-[14px] bg-[#eef2f8]">
                <CoverImage
                  src={heroImage}
                  alt=""
                  imgClassName="absolute inset-0 h-full w-full object-cover"
                />
                {post.sourceName && (
                  <span className="absolute bottom-0 left-0 rounded-tr-[10px] bg-[rgba(255,255,255,.85)] px-3 py-[5px] text-[11px] text-text-3">
                    출처: {post.sourceName}
                  </span>
                )}
              </div>
            ) : null}

            <div className="flex flex-col gap-4 text-sm leading-[1.85] text-text-1">
              {bodyParas.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
              {/* 웹12 — 원문 링크 시인성 강화: 본문 끝 괄호 문장에서 카드형
                  CTA 로. 요약본 사이트의 예의는 원문으로 잘 보내는 것이다.
                  출처명·호스트를 함께 보여 어디로 가는지 누르기 전에 알 수
                  있게 한다. */}
              {post?.sourceUrl &&
                (() => {
                  let host: string | null = null;
                  try {
                    host = new URL(post.sourceUrl).host;
                  } catch {
                    host = null;
                  }
                  return (
                    <a
                      href={post.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="card-hover flex items-center justify-between gap-3 rounded-[14px] border border-line bg-bg px-4 py-3 no-underline"
                    >
                      <span className="min-w-0">
                        <span className="block text-[11px] font-semibold text-text-3">
                          원문 출처{post.sourceName ? ` · ${post.sourceName}` : ""}
                        </span>
                        <span className="block text-[13px] font-extrabold text-primary">
                          원문 전체 보기 ↗
                        </span>
                      </span>
                      {host && (
                        <span className="shrink-0 text-[11px] text-text-3">{host}</span>
                      )}
                    </a>
                  );
                })()}
            </div>

            <div className="flex items-center justify-between border-t border-[#f0f3f8] pt-3.5">
              <div className="flex flex-wrap items-center gap-1 text-[11px] text-text-3">
                <span>
                  {isAutomated
                    ? "자동 수집 콘텐츠 · 저작권은 원 매체에 있음 ·"
                    : `${region} 이웃이 남긴 글 ·`}
                </span>
                {/* 신고 연결(#81) — POST /api/moderation/content-report */}
                <ReportButton postId={post.id} />
              </div>
              {/* "도움돼요 12" 는 파란 굵은 글씨라 눌리는 것처럼 보였는데 <span> 이었다.
                  POST /api/community/posts/[id]/like 는 이미 있었고 화면에서 쓰는 곳이
                  한 군데도 없었다 — 만들어 두고 연결을 안 한 상태였다. 연결한다. */}
              <div className="flex gap-3.5 text-xs text-text-2">
                <LikeButton postId={post.id} initialCount={likeCount} />
              </div>
            </div>
          </article>

          {/* 웹19 — 이웃 글 내비게이션(목록 정렬 기준). 있는 방향만 그린다. */}
          {(newerPost?.id || olderPost?.id) && (
            <nav aria-label="이웃 글" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {newerPost?.id ? (
                <Link
                  href={`/town/news/${encodeURIComponent(newerPost.id)}`}
                  className="card card-hover flex flex-col gap-1 rounded-[14px] px-4 py-3 no-underline"
                >
                  <span className="text-[10px] font-bold text-text-3">‹ 더 최신 글</span>
                  <span className="line-clamp-2 text-[13px] font-bold leading-snug text-ink">
                    {newerPost.title}
                  </span>
                </Link>
              ) : (
                <span className="hidden sm:block" />
              )}
              {olderPost?.id && (
                <Link
                  href={`/town/news/${encodeURIComponent(olderPost.id)}`}
                  className="card card-hover flex flex-col gap-1 rounded-[14px] px-4 py-3 no-underline sm:items-end sm:text-right"
                >
                  <span className="text-[10px] font-bold text-text-3">이전 글 ›</span>
                  <span className="line-clamp-2 text-[13px] font-bold leading-snug text-ink">
                    {olderPost.title}
                  </span>
                </Link>
              )}
            </nav>
          )}

          {/* ---------- 댓글 ---------- */}
          <section className="rise-in-1 card flex flex-col gap-3 rounded-[20px] px-[26px] py-[22px]">
            <div className="text-[15px] font-extrabold text-ink">
              댓글 {commentCount}
            </div>
            {activeComments.length > 0 ? (
              activeComments.map((c) => (
                <div key={c.id} className="flex gap-2.5">
                  <div className="h-8 w-8 shrink-0 rounded-full bg-gradient-to-br from-[#e2e8f2] to-[#eef2f8]" />
                  <div className="flex flex-1 flex-col gap-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-extrabold text-ink">
                        {c.authorLabel}
                      </span>
                      <span className="text-[10px] text-text-3">
                        {relativeTime(c.createdAt)}
                      </span>
                    </div>
                    <p className="text-[13px] leading-[1.55] text-text-1">
                      {c.body}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <p className="py-2 text-[13px] text-text-3">
                아직 댓글이 없어요. 첫 댓글을 남겨보세요.
              </p>
            )}
            {/* 입력칸처럼 생긴 <div> + "등록" 글자였다 — 타이핑도 전송도 불가능했다.
                POST /api/community/posts/[id]/comments 는 이미 있었으므로 연결했다. */}
            <CommentForm postId={post.id} />
          </section>
        </div>

        {/* ---------- 사이드바 ---------- */}
        <aside className="flex flex-col gap-3.5">
          {/* 기사 속 위치 */}
          <div className="rise-in-2 card flex flex-col gap-2.5 rounded-[18px] p-[18px]">
            <div className="text-[13px] font-extrabold text-ink">
              기사 속 위치
            </div>
            {/* 예전엔 "네이버/카카오 지도 SDK 영역" 이라고 적힌 그라디언트 상자에
                지역명 배지를 절대 좌표로 얹어 둔 그림이었다. 실지도 컴포넌트가
                모임 상세에 이미 있었으므로(LocationMap) 같은 것을 쓴다. */}
            <div className="relative">
              <LocationMap
                region={post.city}
                city={post.city}
                district={post.district}
                label={region}
                className="h-[150px]"
              />
              <Link
                href="/map"
                className="absolute bottom-2.5 right-2.5 rounded-lg bg-[rgba(255,255,255,.85)] px-2.5 py-[5px] text-[10px] font-bold text-primary"
              >
                지도에서 열기 ›
              </Link>
            </div>
            {post.relatedSite && (
              <div className="flex justify-between text-xs">
                <span className="text-text-2">연관 단지</span>
                {/* 고도화 26 — 리졸브되면 단지 시세로 크로스링크, 아니면 텍스트 */}
                {relatedSiteHref ? (
                  <Link href={relatedSiteHref} className="font-bold text-primary">
                    {post.relatedSite} 시세 ›
                  </Link>
                ) : (
                  <span className="font-bold text-ink">{post.relatedSite}</span>
                )}
              </div>
            )}
          </div>

          {/* 이 지역 임장노트 — 사실 우선: 허위 노트 목록·건수 제거, 작성/열람 진입만 */}
          <div className="rise-in-3 card flex flex-col gap-2.5 rounded-[18px] p-[18px]">
            <div className="text-[13px] font-extrabold text-ink">이 지역 임장노트</div>
            <p className="text-[11px] leading-relaxed text-text-3">
              현장을 다녀오셨다면 임장노트로 기록해 이웃과 공유해 보세요.
            </p>
            <div className="flex gap-2">
              <Link
                href="/notes/new"
                className="btn-primary btn-cta flex-1 rounded-[10px] p-2.5 text-center text-xs"
              >
                이 지역 노트 쓰기
              </Link>
              <Link
                href="/notes"
                className="btn-soft flex-1 rounded-[10px] p-2.5 text-center text-xs"
              >
                공개 노트 보기
              </Link>
            </div>
          </div>

          {/* 유사 기사 — 실데이터 있을 때만 */}
          {similarPosts.length > 0 && (
            <div className="rise-in-4 card flex flex-col gap-1 rounded-[18px] p-[18px]">
              <div className="mb-1.5 text-[13px] font-extrabold text-ink">
                유사 기사
              </div>
              {similarPosts.map((s, i) => (
                <Link
                  key={s.title}
                  href={s.id ? `/town/news/${s.id}` : "/town/news"}
                  className={`flex gap-2.5 py-[7px] ${
                    i < similarPosts.length - 1 ? "border-b border-[#f0f3f8]" : ""
                  }`}
                >
                  <div className="h-[38px] w-[52px] shrink-0 rounded-lg bg-gradient-to-br from-[#e8edf5] to-[#f2f5fa]" />
                  <div>
                    <div className="line-clamp-2 text-xs font-bold leading-[1.4] text-ink">
                      {s.title}
                    </div>
                    <div className="text-[10px] text-text-3">{s.meta}</div>
                  </div>
                </Link>
              ))}
            </div>
          )}

          {/* AD 슬롯 — 여기에는 "AD / AdSense 320×80" 이라고 적힌 점선 상자가 있었다.
              개발용 자리표시자가 그대로 나가 있던 것으로, 사용자에게는 광고가 실릴
              자리가 아니라 깨진 광고로 보인다. 실제 슬롯으로 교체한다 — 등록 배너도
              하우스 광고도 없으면 AdSlot 이 null 을 반환해 빈 상자를 남기지 않는다.
              (/supply 에서 같은 이유로 이미 고친 것과 같은 처리) */}
          <div className="rise-in-5">
            <AdSlot
              placement="community_feed"
              seed={0}
              adFree={viewer.adFree}
              signedIn={viewer.signedIn}
              plan={viewer.plan}
            />
          </div>
        </aside>
      </div>
    </PageShell>
  );
}
