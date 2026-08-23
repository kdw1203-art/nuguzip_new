import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "../../../components/PageShell";
import { AIPanel } from "../../../components/AIPanel";
import { ReportButton } from "../../../components/ReportButton";
import { getTownPost, readRelatedTownPosts } from "@/lib/newui/board-posts";
import { relatedInCluster } from "@/lib/news/cluster";
import { isPostHidden } from "@/lib/moderation/reports-store";
import type { Post } from "@/lib/types/post";
import { logger } from "@/lib/log";
import { newsImageUrl } from "../../shared";
import { LocationMap } from "../../LocationMap";
import { regionIdForName } from "@/lib/region/catalog";
import { resolveComplexHref } from "@/lib/newui/complex-link";
import { CoverImage } from "@/app/components/CoverImage";
import { AdSlot } from "@/app/components/ads/AdSlot";
import { PostActions, CommentForm, LikeButton } from "./PostInteractions";
import { CommentThread } from "./CommentThread";
import { getServiceSupabase } from "@/lib/supabase/service";
import {
  readNewsMeta,
  extractUuid,
  canonicalNewsUrl,
  splitSummary,
  buildNewsJsonLd,
} from "@/lib/news-seo";

/* 뉴스 상세 — posts 실데이터(id 조회) 연동. 없는 글은 notFound() (사실 우선: 목업 기사 금지). */

/* 비용 실측(2026-08-10): force-dynamic 이라 익명·크롤러 요청마다 오리진 함수가
   돌았다(x-vercel-cache: MISS, cache-control: private,no-store 실측). 이 화면의
   서버 렌더에는 사용자별 상태가 없다(auth·cookies 0건 — check-cache-policy 가
   회귀를 막는다). ISR 로 전환: 뉴스 적재는 하루 1회. 댓글·좋아요는 API 가 revalidatePath 로 즉시 재생성. */
export const revalidate = 600;
// 동적 세그먼트는 이게 없으면 "요청마다 서버 렌더"로 분류된다(2026-08 complex/[id] 실측)
export function generateStaticParams() {
  return [];
}

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

/** 포인트 상점 '닉네임 오로라' — 글 작성자 프로필의 settings.nickname_effect 를
    읽어 **만료 전일 때만** 종류를 돌려준다. rowToPost 는 개인정보 보호로
    author_email 을 지우므로(피드에 이메일이 새지 않게), 여기서 서비스 키로
    id→author_email→profiles.settings 를 직접 잇는다. 이 페이지는 ISR(600초)라
    적용·만료가 최대 10분 늦게 보일 수 있다 — 꾸밈 효과라 수용. 조회 실패도
    효과 없음으로 조용히 처리한다: 장식이 본문 렌더를 막으면 안 된다. */
async function readAuthorNicknameEffect(postId: string): Promise<"aurora" | null> {
  try {
    const sb = getServiceSupabase();
    if (!sb) return null;
    const { data: row } = await sb
      .from("posts")
      .select("author_email")
      .eq("id", postId)
      .maybeSingle();
    const email = typeof row?.author_email === "string" ? row.author_email : "";
    if (!email) return null;
    const { data: prof } = await sb
      .from("profiles")
      .select("settings")
      .eq("email", email)
      .maybeSingle();
    const eff = (
      prof?.settings as { nickname_effect?: { kind?: string; until?: string } } | null
    )?.nickname_effect;
    if (
      eff?.kind === "aurora" &&
      typeof eff.until === "string" &&
      Date.parse(eff.until) > Date.now()
    ) {
      return "aurora";
    }
    return null;
  } catch {
    return null;
  }
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
 * 2026-07-27 에 이 페이지를 noindex 로 막았다. 사유는 정당했다: 공개 글 453건이
 * 전부 자동수집이고 118개 매체 기사의 **본문을 그대로** 싣고 있었다. 원문과
 * 중복되는 얇은 페이지 453장을 색인시키면 사이트 품질 신호가 깎인다.
 *
 * 2026-08-04, 그 전제를 바꿨다. 이제 이 페이지는 원문 본문을 싣지 않는다:
 *   - 우리가 새로 쓴 요약 5문장 (seo.summary)
 *   - 핵심 문장 4개 (seo.key_points)
 *   - 자주 묻는 질문 2개 (seo.faq)
 *   - 선정 사유 한두 문장 (ai_reason)
 * 원문은 링크로 보낸다. 즉 중복 콘텐츠도, 전재 저작권 문제도 성립하지 않는다.
 *
 * 그래서 색인은 **우리 글이 실제로 있는 글에 한해서만** 연다.
 *   isAutomated && 우리 요약 있음  → index (이 글은 우리가 쓴 요약본이다)
 *   isAutomated && 우리 요약 없음  → noindex (원문 본문에 기대는 옛 글 — 종전 유지)
 *   !isAutomated                   → index (이웃이 직접 쓴 글)
 * 판정은 lib/news-seo.ts 의 readNewsMeta().hasOwnContent 한 곳에만 둔다.
 * 사이트맵(lib/seo/build-sitemap.ts loadNewsEntries)도 같은 조건을 쓴다.
 *
 * 조회 실패는 여기서도 던진다 — 본문과 같은 이유다. 못 읽은 것을 "없는 글"로
 * 바꿔 적지 않는다. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const uuid = extractUuid(id) ?? id;
  const post = await getTownPost(uuid);
  if (!post) {
    return {
      title: "글을 찾을 수 없습니다 | 누구집",
      description: "요청하신 글을 찾을 수 없습니다.",
      robots: { index: false, follow: false },
    };
  }

  const { seo, geo, summary, hasOwnContent } = readNewsMeta(post.automationMeta);
  const isAutomated = Boolean(post.isAutomated);
  const indexable = !isAutomated || hasOwnContent;

  const where = [post.city, post.district].filter(Boolean).join(" ").trim();
  const source = post.sourceName?.trim();
  const descParts = [
    where || "전국",
    post.category,
    source ? `출처 ${source}` : null,
  ].filter(Boolean);
  const body = post.body.replace(/\s+/g, " ").trim();

  const description =
    seo.meta_description ??
    summary?.slice(0, 155) ??
    (body ? body.slice(0, 150) : `${descParts.join(" · ")} 부동산 소식.`);

  const canonical = canonicalNewsUrl(seo.slug, uuid);
  const ogImage = newsImageUrl(post);
  /* 지역 엔티티까지 키워드에 합친다 — "반포동 보유세" 처럼 동 단위 질의는
     region 컬럼(시도 1개)만으로는 잡히지 않는다(GEO). */
  const keywords = [
    ...(seo.keywords ?? []),
    ...(geo.places ?? []),
    ...(geo.landmarks ?? []),
  ].filter(Boolean);

  return {
    title: `${seo.seo_title ?? post.title} | 누구집`,
    description,
    ...(keywords.length ? { keywords } : {}),
    alternates: { canonical },
    robots: { index: indexable, follow: true },
    openGraph: {
      type: "article",
      title: seo.seo_title ?? post.title,
      description,
      url: canonical,
      siteName: "누구집",
      locale: "ko_KR",
      ...(ogImage ? { images: [{ url: ogImage }] } : {}),
      ...(post.sourcePublishedAt ? { publishedTime: post.sourcePublishedAt } : {}),
      ...(post.category ? { section: post.category } : {}),
      ...(keywords.length ? { tags: keywords } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: seo.seo_title ?? post.title,
      description,
      ...(ogImage ? { images: [ogImage] } : {}),
    },
  };
}

/* 구조화 데이터 — JSON.stringify 결과라 XSS 위험은 없고, '<' 만 이스케이프해
   </script> 탈출을 막는다. 본문에 렌더하므로 스트리밍 메타데이터와 무관하게
   HTML 소스에 그대로 남는다. */
function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}

/* ---------- 페이지 ---------- */

export default async function TownNewsDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const uuid = extractUuid(id) ?? id;

  let similarPosts: { id: string | null; title: string; meta: string }[] = [];
  /* [#67] 같은 사건을 다룬 다른 매체 보도 — 제목 유사도 클러스터(lib/news/cluster) */
  let clusterRelated: { id: string; title: string; meta: string }[] = [];
  /* 웹19 — 목록 정렬(readTownPosts 와 동일) 기준 이웃 글. 목록으로 돌아가지
     않고 다음 기사로 넘어가는 동선. 현재 글이 목록에 없으면(숨김 등) 생략. */
  let newerPost: { id: string | null; title: string } | null = null;
  let olderPost: { id: string | null; title: string } | null = null;
  /* posts 스토어 + board_posts(운영 DB) 병합 실데이터.
     try/catch 로 실패를 null 로 바꾸던 자리다 — 아래 notFound() 와 만나서
     조회 실패가 404 로 나갔다. 이제 실패는 던지고 5xx 가 된다(사유는
     lib/newui/board-posts.ts 의 getBoardPost 주석). */
  const post: Post | null = await getTownPost(uuid);
  // 사실 우선: 존재하지 않는 글은 목업 기사 대신 404
  if (!post) notFound();
  // 신고 누적/처리로 숨김된 글(posts.visibility="hidden")도 상세 노출 차단(#7)
  if (await isPostHidden(uuid).catch(() => false)) notFound();

  /* 우리 요약·핵심·FAQ·지역. Post 가 automationMeta 를 그대로 넘겨주므로
     추가 조회가 없다. 값이 없으면 hasOwnContent 가 false 가 되고, 아래는
     예전 그대로 원문 본문을 그리며 색인도 열지 않는다(옛 글 호환). */
  const { seo, geo, summary, context, implication, hasOwnContent } =
    readNewsMeta(post.automationMeta);
  const renderOwnSummary = Boolean(post.isAutomated) && hasOwnContent;

  /* slug 주소 통합은 리다이렉트가 아니라 <link rel="canonical"> 로 한다.
     처음에는 구 UUID 주소를 permanentRedirect(308) 로 보내려 했는데, 이 라우트는
     force-dynamic 이라 레이아웃 셸이 먼저 흘러나간 뒤에 페이지가 resolve 된다.
     그 시점의 redirect 는 HTTP 상태로 나가지 못하고 NEXT_REDIRECT 가 응답 **본문**에
     실려 200 으로 나갔다(실측: 브라우저·GPTBot UA 모두 200, 기사 본문 없음).
     canonical 은 같은 통합을 하면서 이 문제가 없다 — 두 주소 모두 정상 렌더되고
     색인은 slug 주소로 모인다. 사이트맵도 slug 주소만 싣는다. */

  try {
    /* 관련글은 제목·분류·출처·시각만 쓴다 — 본문·automation_meta 는 안 읽는다.
       고르는 글은 readTownPosts 와 같다(정렬·중복 제거·품질 게이트 컬럼 동일). */
    const all = await readRelatedTownPosts();

    /* [#67] 동일 사건 클러스터 — 자동수집 뉴스 풀에서 이 기사와 같은 사건으로
       묶이는 다른 매체 보도. 유사 기사(주제·분류 기반)보다 강한 연결이라 위에 따로. */
    if (post!.isAutomated) {
      const pool = all
        .filter((p) => p.isAutomated && p.id)
        .map((p) => ({
          id: p.id as string,
          title: p.title,
          timeMs: Date.parse(p.sourcePublishedAt || p.createdAt) || 0,
          sourceName: p.sourceName || p.authorLabel,
          at: p.sourcePublishedAt || p.createdAt,
        }));
      clusterRelated = relatedInCluster(pool, post!.id)
        .slice(0, 4)
        .map((r) => ({
          id: r.id,
          title: r.title,
          meta: `${r.sourceName} · ${shortDate(r.at)}`,
        }));
    }

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
  /* 닉네임 오로라(포인트 상점 200P/7일) — 이웃 글에서만 작성자 이름을 빛낸다.
     자동수집 글은 작성자가 사람이 아니므로 조회 자체를 건너뛴다. */
  const nickEffect = isAutomated ? null : await readAuthorNicknameEffect(post.id);
  const byline = isAutomated ? (
    `${renderOwnSummary ? "누구집 요약" : "자동 수집"} · ${post.sourceName || "뉴스 자동수집"} · ${fullDateTime(post.sourcePublishedAt || post.createdAt)}`
  ) : (
    <>
      <span className={nickEffect === "aurora" ? "nick-aurora" : undefined}>
        {post.authorLabel}
      </span>
      {` · ${fullDateTime(post.createdAt)}`}
    </>
  );
  const title = post.title;
  const category = post.category;
  const region = [post.city, post.district].filter(Boolean).join(" ") || "전국";
  /* 우리 요약이 있으면 원문 본문을 싣지 않는다(이 파일 상단 SEO 주석 참고). */
  const bodyParas = renderOwnSummary ? [] : paragraphs(post.body);
  const summaryParas = summary ? splitSummary(summary) : [];
  const keyPoints = seo.key_points ?? [];
  const faq = seo.faq ?? [];
  /* 예전 3줄 요약은 원문 앞 3문단을 55자로 자른 것이었다 — 문장이 중간에 끊겨
     그 자체로는 뜻이 통하지 않았다. 우리 요약이 있으면 새로 쓴 핵심 문장을 쓴다. */
  const legacySummary = renderOwnSummary
    ? []
    : paragraphs(post.body)
        .slice(0, 3)
        .map((t, i) => `${["①", "②", "③"][i] ?? "·"} ${t.slice(0, 55)}`);
  const activeComments = post.comments.filter((c) => !c.deletedAt).slice(0, 8);
  const commentCount = post.commentCount;
  const likeCount = post.likeCount;
  const saveCount = post.bookmarkCount ?? 0;
  const heroImage = newsImageUrl(post);
  // 광고 자리표시자를 실제 슬롯으로 바꾸면서 필요해진 값. 이 라우트는 force-dynamic 이라
  // 세션을 읽어도 캐시가 깨지지 않는다.
  /* ISR 전환(2026-08-10): getAdViewer 는 세션(쿠키)을 읽어 페이지를 동적으로
     되돌린다 — lib/ads/viewer.ts 의 경고 그대로. 유료 플랜 광고 숨김은
     plan={null} 경로의 AdFreeGate(클라이언트)가 처리한다(complex/[id] 선례). */

  const jsonLd = renderOwnSummary
    ? buildNewsJsonLd(seo, uuid, geo, post.sourceName, post.sourceUrl)
    : null;

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
      {/* 구조화 데이터 — 우리 글로 렌더할 때만. 화면에 없는 내용을 마크업하지 않는다. */}
      {jsonLd && <JsonLd data={jsonLd} />}

      {/* 저장·공유는 실제로 동작하는 버튼이다(POST /api/bookmarks · Web Share).
          자세한 경위는 PostInteractions.tsx 주석 참고. */}
      <PostActions postId={post.id} title={title} saveCount={saveCount} />

      <div className="grid grid-cols-1 gap-5 md:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex flex-col gap-4">
          {/* ---------- 기사 본문 ---------- */}
          <article className="rise-in card flex flex-col gap-4 rounded-[20px] p-7">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-[5px] bg-[#fdf3e7] chip-pad text-[11px] font-extrabold text-warning">
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

            {keyPoints.length > 0 ? (
              <AIPanel title="핵심 요약">
                {keyPoints.map((t, i) => (
                  <span key={i}>
                    {i > 0 && <br />}
                    {`· ${t}`}
                  </span>
                ))}
              </AIPanel>
            ) : legacySummary.length > 0 ? (
              <AIPanel title="3줄 요약">
                {legacySummary.map((t, i) => (
                  <span key={i}>
                    {i > 0 && <br />}
                    {t}
                  </span>
                ))}
              </AIPanel>
            ) : null}

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
                    사진: {post.sourceName}
                  </span>
                )}
              </div>
            ) : null}

            <div className="flex flex-col gap-4 text-sm leading-[1.85] text-text-1">
              {/* 우리가 쓴 요약 — 원문 문장을 옮기지 않고 핵심 사실(수치·기관·
                  시점·영향)만 재구성한 글이다. */}
              {summaryParas.map((t, i) => (
                <p key={`sum-${i}`}>{t}</p>
              ))}

              {/* 우리 요약이 없는 옛 글은 종전대로 원문 본문을 그린다(noindex 유지). */}
              {bodyParas.map((t, i) => (
                <p key={`body-${i}`}>{t}</p>
              ))}

              {/* 배경·맥락 — 원문에 없는 우리 정리. 이 기사가 어떤 흐름 위에
                  있는지를 앞선 정책·통계와 이어 준다. */}
              {renderOwnSummary && context ? (
                <section className="rounded-[14px] border border-line bg-bg px-4 py-3">
                  <h2 className="mb-1 text-[12px] font-extrabold text-text-3">배경</h2>
                  <p className="text-[13px] leading-[1.75] text-text-1">{context}</p>
                </section>
              ) : null}

              {/* 시장에 주는 의미 — 원문에 없는 우리 해석. 실수요자가 무엇을
                  봐야 하는지까지 적는다. */}
              {renderOwnSummary && implication ? (
                <section className="rounded-[14px] border border-primary/25 bg-[#f7faff] px-4 py-3">
                  <h2 className="mb-1 text-[12px] font-extrabold text-primary">
                    시장에 주는 의미
                  </h2>
                  <p className="text-[13px] leading-[1.75] text-text-1">{implication}</p>
                </section>
              ) : null}
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
                          기사 전문 읽기 ↗
                        </span>
                      </span>
                      {host && (
                        <span className="shrink-0 text-[11px] text-text-3">{host}</span>
                      )}
                    </a>
                  );
                })()}
            </div>

            {/* 자주 묻는 질문 — 사용자가 실제로 검색할 법한 자연어 질문.
                FAQPage 구조화 데이터와 화면 내용이 같아야 유효하므로 함께 낸다. */}
            {faq.length > 0 ? (
              <section
                aria-label="자주 묻는 질문"
                className="flex flex-col gap-3 border-t border-[#f0f3f8] pt-4"
              >
                <h2 className="text-[15px] font-extrabold text-ink">자주 묻는 질문</h2>
                <dl className="flex flex-col gap-3">
                  {faq.map((f, i) => (
                    <div key={i} className="flex flex-col gap-1">
                      <dt className="text-[13px] font-extrabold text-ink">Q. {f.q}</dt>
                      <dd className="text-[13px] leading-[1.7] text-text-1">{f.a}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ) : null}

            {/* 관련 지역 — geo.places 를 지역 시세 페이지로 잇는다. 해석되는
                시군구만 링크하고 나머지는 텍스트 칩으로 남긴다(죽은 링크 금지). */}
            {geo.places && geo.places.length > 0 ? (
              <nav
                aria-label="관련 지역"
                className="flex flex-wrap items-center gap-1.5 border-t border-[#f0f3f8] pt-3.5"
              >
                <span className="text-[11px] font-bold text-text-3">관련 지역</span>
                {geo.places.map((place) => {
                  /* "서울 서초구 반포동" → 전체 → 앞 2단어 → 시군구 순으로 시도. */
                  const words = place.split(/\s+/).filter(Boolean);
                  const rid =
                    regionIdForName(place) ??
                    (words.length >= 2
                      ? regionIdForName(words.slice(0, 2).join(" "))
                      : null) ??
                    (words.length >= 2 ? regionIdForName(words[1]) : null);
                  return rid ? (
                    <Link
                      key={place}
                      href={`/region/${rid}`}
                      className="chip border border-line bg-bg px-2.5 py-1 text-[11px] font-bold text-primary no-underline"
                    >
                      {place}
                    </Link>
                  ) : (
                    <span
                      key={place}
                      className="chip border border-line bg-bg px-2.5 py-1 text-[11px] text-text-2"
                    >
                      {place}
                    </span>
                  );
                })}
              </nav>
            ) : null}

            <div className="flex items-center justify-between border-t border-[#f0f3f8] pt-3.5">
              <div className="flex flex-wrap items-center gap-1 text-[11px] text-text-3">
                <span>
                  {renderOwnSummary
                    ? `누구집이 원문을 요약·정리한 글입니다 · 원문 저작권은 ${post.sourceName || "원 매체"}에 있음 ·`
                    : isAutomated
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
            {/* [#65·#66] 채택·대댓글 스레드 — 상대시각은 서버에서 계산해 넘긴다(하이드레이션 불일치 방지) */}
            <CommentThread
              postId={post.id}
              comments={activeComments.map((c) => ({
                id: c.id,
                authorLabel: c.authorLabel,
                body: c.body,
                createdAt: c.createdAt,
                parentId: c.parentId ?? null,
                adopted: c.adopted === true,
              }))}
              relativeLabels={Object.fromEntries(
                activeComments.map((c) => [c.id, relativeTime(c.createdAt)]),
              )}
            />
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

          {/* [#67] 관련 보도 — 같은 사건을 다룬 다른 매체 (제목 유사도 클러스터) */}
          {clusterRelated.length > 0 && (
            <div className="rise-in-4 card flex flex-col gap-1 rounded-[18px] p-[18px]">
              <div className="mb-1.5 text-[13px] font-extrabold text-ink">
                관련 보도 {clusterRelated.length}건{" "}
                <span className="text-[11px] font-medium text-text-3">같은 사건 · 다른 매체</span>
              </div>
              {clusterRelated.map((s, i) => (
                <Link
                  key={s.id}
                  href={`/town/news/${s.id}`}
                  className={`flex flex-col gap-0.5 py-[7px] ${
                    i < clusterRelated.length - 1 ? "border-b border-[#f0f3f8]" : ""
                  }`}
                >
                  <div className="line-clamp-2 text-xs font-bold leading-[1.4] text-ink">
                    {s.title}
                  </div>
                  <div className="text-[10px] text-text-3">{s.meta}</div>
                </Link>
              ))}
            </div>
          )}

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
              plan={null}
            />
          </div>
        </aside>
      </div>
    </PageShell>
  );
}
