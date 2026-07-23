import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "../../../components/PageShell";
import { AIPanel } from "../../../components/AIPanel";
import { ReportButton } from "../../../components/ReportButton";
import { getTownPost, readTownPosts } from "@/lib/newui/board-posts";
import type { Post } from "@/lib/types/post";

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

/* ---------- 페이지 ---------- */

export default async function TownNewsDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let post: Post | null = null;
  let similarPosts: { id: string | null; title: string; meta: string }[] = [];
  try {
    /* posts 스토어 + board_posts(운영 DB) 병합 실데이터 */
    post = await getTownPost(id);
  } catch {
    post = null;
  }
  // 사실 우선: 존재하지 않는 글은 목업 기사 대신 404
  if (!post) notFound();

  try {
    const all = await readTownPosts();
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
  } catch {
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

  return (
    <PageShell breadcrumb={`자료 › ${category} › ${region}`}>
      <div className="mb-4 flex items-center justify-end gap-2 text-[13px]">
        <span className="btn-soft rounded-[10px] px-3.5 py-2">
          저장 {saveCount}
        </span>
        <span className="rounded-[10px] bg-[rgba(255,255,255,.7)] px-3.5 py-2 font-semibold text-text-2">
          공유
        </span>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-4">
          {/* ---------- 기사 본문 ---------- */}
          <article className="rise-in card flex flex-col gap-4 rounded-[20px] p-7">
            <div className="flex items-center gap-2">
              <span className="rounded-[5px] bg-[#fdf3e7] px-2 py-[3px] text-[11px] font-extrabold text-[#c07a3a]">
                {category}
              </span>
              <span className="truncate text-xs text-text-3">{byline}</span>
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

            {/* 원문 사진 플레이스홀더 (자동 수집 기사) */}
            {isAutomated ? (
              <div className="relative flex h-[280px] items-end overflow-hidden rounded-[14px] bg-gradient-to-br from-[#e8edf5] to-[#f2f5fa]">
                <span className="rounded-tr-[10px] bg-[rgba(255,255,255,.85)] px-3 py-[5px] font-mono text-[11px] text-text-3">
                  원문 기사 사진 — {region}
                  {post.sourceName ? ` (출처: ${post.sourceName})` : ""}
                </span>
              </div>
            ) : null}

            <div className="flex flex-col gap-4 text-sm leading-[1.85] text-text-1">
              {bodyParas.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
              {post?.sourceUrl && (
                <p>
                  <span className="text-text-3">(원문 전체는 출처에서 — </span>
                  <a
                    href={post.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[13px] font-bold text-primary"
                  >
                    원문 보기 ↗
                  </a>
                  <span className="text-text-3">)</span>
                </p>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-[#f0f3f8] pt-3.5">
              <div className="flex flex-wrap items-center gap-1 text-[11px] text-[#adb5bd]">
                <span>
                  {isAutomated
                    ? "자동 수집 콘텐츠 · 저작권은 원 매체에 있음 ·"
                    : `${region} 이웃이 남긴 글 ·`}
                </span>
                {/* 신고 연결(#81) — POST /api/moderation/content-report */}
                <ReportButton postId={post.id} />
              </div>
              <div className="flex gap-3.5 text-xs text-text-2">
                <span className="font-bold text-primary">
                  도움돼요 {likeCount}
                </span>
              </div>
            </div>
          </article>

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
                      <span className="text-[10px] text-[#adb5bd]">
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
            <div className="flex items-center gap-2 rounded-xl bg-bg px-3.5 py-2.5">
              <span className="flex-1 text-[13px] text-text-3">
                댓글 남기기…
              </span>
              <span className="text-xs font-bold text-primary">등록</span>
            </div>
          </section>
        </div>

        {/* ---------- 사이드바 ---------- */}
        <aside className="flex flex-col gap-3.5">
          {/* 기사 속 위치 */}
          <div className="rise-in-2 card flex flex-col gap-2.5 rounded-[18px] p-[18px]">
            <div className="text-[13px] font-extrabold text-ink">
              기사 속 위치
            </div>
            <div className="relative h-[150px] overflow-hidden rounded-xl bg-gradient-to-br from-[#dfe7f5] to-[#c9d6ef]">
              <span className="absolute left-2 top-2 font-mono text-[10px] text-text-3">
                네이버/카카오 지도 SDK 영역
              </span>
              <div className="absolute left-10 top-[38px] rounded-lg bg-[#c07a3a] px-2 py-1 text-[10px] font-extrabold text-white">
                {region}
              </div>
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
                <span className="font-bold text-ink">{post.relatedSite}</span>
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

          {/* AD 슬롯 */}
          <div className="rise-in-5 flex h-20 flex-col items-center justify-center gap-[3px] rounded-[14px] border border-dashed border-[#d8dfea] bg-surface">
            <span className="rounded border border-[#e2e7ee] px-1.5 py-px text-[9px] font-bold tracking-widest text-[#adb5bd]">
              AD
            </span>
            <span className="font-mono text-[11px] text-[#adb5bd]">
              AdSense 320×80
            </span>
          </div>
        </aside>
      </div>
    </PageShell>
  );
}
