import Link from "next/link";
import { PageShell } from "../../components/PageShell";
import { AIPanel } from "../../components/AIPanel";
import { safeReadPosts } from "@/lib/safe-home-data";
import { COMMUNITY_SUBCATEGORIES, matchSubcategory } from "@/lib/subcategories";
import type { Post } from "@/lib/types/post";

/* 시안 8k — 자료(크롤링 뉴스) · 데스크탑 — posts 자동수집(뉴스) 실데이터 연동 */

export const dynamic = "force-dynamic";

const NEWS_SUB = COMMUNITY_SUBCATEGORIES.find((s) => s.id === "news");

/* ---------- 목업 폴백 ---------- */

const FALLBACK_FEATURED = {
  id: null as string | null,
  category: "정책",
  sourceLine: "자동 수집 · 국토교통부 보도자료 · 2026.07.17",
  title: "월세 세액공제 최대 30% 상향 개정안 발의 — 무주택 세입자 주거안정",
  summary: (
    <>
      ① 월세 세액공제율 17% → 최대 30% 상향
      <br />② 대상: 연소득 8,000만 이하 무주택 세대주
      <br />③ 국회 통과 시 2027년 1월 지급분부터 적용
    </>
  ),
  body: "개정안은 청년·신혼부부 등 무주택 세입자의 월세 부담을 낮추기 위한 것으로, 기존 공제 한도(750만원)도 1,000만원으로 확대하는 내용을 담았다. 원문 전문은 출처 링크에서 확인할 수 있습니다…",
  sourceUrl: "https://www.molit.go.kr",
  sourceHost: "molit.go.kr",
};

const FALLBACK_LATEST = [
  {
    id: "1",
    badge: "개발",
    title:
      "안양 관양 재개발 구역, 시공사 선정 임박 — 인근 구축 단지 재건축 기대감 확산",
    meta: "OO경제 · 07.18 · 댓글 17",
  },
  { id: "2", badge: "정책", title: "1기 신도시 특별법 시행령 입법예고", meta: "OO일보 · 07.16" },
  { id: "3", badge: "개발", title: "평촌 리모델링 3개 단지 조합 설립", meta: "OO경제 · 07.14" },
  { id: "4", badge: "시장", title: "수도권 재개발 일반분양가 상승세", meta: "OO신문 · 07.11" },
];

const FALLBACK_RELATED = [
  { id: null as string | null, title: "“이 정도면 월세 유지가 낫나요?”", comments: 17 },
  { id: null as string | null, title: "“매수 타이밍에 영향 있을까”", comments: 9 },
];

/* ---------- 헬퍼 ---------- */

function isNewsPost(p: Post) {
  if (p.isAutomated) return true;
  if (!NEWS_SUB) return false;
  return matchSubcategory(NEWS_SUB, [p.category, p.title, ...(p.tags ?? [])]);
}

function newsBadgeStyle(category: string) {
  const c = category ?? "";
  if (["개발", "재건축", "재개발", "분양"].some((k) => c.includes(k)))
    return "bg-[#fdf3e7] text-[#c07a3a]";
  if (["정책", "뉴스"].some((k) => c.includes(k)))
    return "bg-[#edf2fe] text-primary";
  return "bg-[#f2f4f8] text-text-2";
}

function displayIso(p: Post) {
  return p.sourcePublishedAt || p.createdAt;
}

function shortDate(iso: string) {
  const d = new Date(iso);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${mm}.${dd}`;
}

function fullDate(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

function hostOf(url: string | undefined) {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function summaryLines(body: string): string[] {
  return body
    .replace(/\r/g, "")
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 3);
}

/* 더미데이터 정책: 실데이터 0건일 때만 목업 노출 — 목업 항목엔 작은 "예시" 라벨 */
function ExampleBadge() {
  return (
    <span className="inline-flex shrink-0 items-center rounded border border-line px-1 py-px text-[9px] font-semibold leading-[1.4] text-text-3">
      예시
    </span>
  );
}

/* ---------- 페이지 ---------- */

export default async function TownNewsPage() {
  let newsPosts: Post[] = [];
  let ugcPosts: Post[] = [];
  try {
    const all = await safeReadPosts();
    newsPosts = all
      .filter(isNewsPost)
      .sort(
        (a, b) =>
          new Date(displayIso(b)).getTime() - new Date(displayIso(a)).getTime(),
      );
    ugcPosts = all.filter((p) => !p.isAutomated);
  } catch {
    newsPosts = [];
  }

  const featuredPost = newsPosts[0];
  const featuredIsMock = !featuredPost;
  const featured = featuredPost
    ? {
        id: featuredPost.id,
        category: featuredPost.category || "뉴스",
        sourceLine: `자동 수집 · ${featuredPost.sourceName || featuredPost.authorLabel} · ${fullDate(displayIso(featuredPost))}`,
        summary: (
          <>
            {summaryLines(featuredPost.body).map((line, i) => (
              <span key={i}>
                {i > 0 && <br />}
                {`${["①", "②", "③"][i] ?? "·"} ${line.slice(0, 60)}`}
              </span>
            ))}
          </>
        ),
        title: featuredPost.title,
        body: `${featuredPost.body.slice(0, 180)}…`,
        sourceUrl: featuredPost.sourceUrl ?? null,
        sourceHost: hostOf(featuredPost.sourceUrl),
      }
    : FALLBACK_FEATURED;

  // 더미데이터 정책: 실 뉴스가 1건이라도 있으면 목업으로 채우지 않음 (0건일 때만 예시 목업)
  const latestIsMock = newsPosts.length === 0;
  const latest = latestIsMock
    ? FALLBACK_LATEST
    : newsPosts.slice(1, 9).map((p) => ({
        id: p.id,
        badge: p.category || "뉴스",
        title: p.title,
        meta: `${p.sourceName || p.authorLabel} · ${shortDate(displayIso(p))}${
          p.commentCount > 0 ? ` · 댓글 ${p.commentCount}` : ""
        }`,
      }));

  const relatedIsMock = ugcPosts.length === 0;
  const related = relatedIsMock
    ? FALLBACK_RELATED
    : [...ugcPosts]
        .sort((a, b) => b.commentCount - a.commentCount)
        .slice(0, 2)
        .map((p) => ({ id: p.id, title: p.title, comments: p.commentCount }));

  // 사실 기반 원칙: 실데이터 없는 수치는 허위 값 대신 "—"
  const savedCount: number | null = featuredPost?.bookmarkCount ?? null;

  return (
    <PageShell breadcrumb="동네이야기 › 자료 › 정책">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="rise-in text-[22px] font-extrabold text-ink">
          뉴스 · 자료
        </h1>
        <div className="flex gap-2 text-[13px]">
          <span className="btn-soft rounded-[10px] px-3.5 py-2">
            저장 {savedCount ?? "—"}
          </span>
          <span className="rounded-[10px] bg-[rgba(255,255,255,.7)] px-3.5 py-2 font-semibold text-text-2">
            공유
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-[1fr_340px]">
        <div className="flex flex-col gap-4">
          {/* 대표 자료 — 8k 본문 */}
          <article className="rise-in card flex flex-col gap-3.5 rounded-[20px] p-[26px]">
            <div className="flex items-center gap-2">
              <span
                className={`rounded-[5px] px-2 py-[3px] text-[11px] font-extrabold ${newsBadgeStyle(featured.category)}`}
              >
                {featured.category}
              </span>
              <span className="truncate text-xs text-text-3">
                {featured.sourceLine}
              </span>
              {featuredIsMock && <ExampleBadge />}
            </div>
            {featured.id ? (
              <Link href={`/town/news/${featured.id}`}>
                <h2 className="text-[22px] font-extrabold leading-[1.4] text-ink">
                  {featured.title}
                </h2>
              </Link>
            ) : (
              <h2 className="text-[22px] font-extrabold leading-[1.4] text-ink">
                {featured.title}
              </h2>
            )}

            <AIPanel title="3줄 요약">{featured.summary}</AIPanel>

            <p className="text-sm leading-[1.8] text-text-1">{featured.body}</p>

            <div className="flex items-center justify-between border-t border-[#f0f3f8] pt-3.5">
              {featured.sourceUrl ? (
                <a
                  href={featured.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[13px] font-bold text-primary"
                >
                  원문 보기{featured.sourceHost ? ` (${featured.sourceHost})` : ""} ↗
                </a>
              ) : featured.id ? (
                <Link
                  href={`/town/news/${featured.id}`}
                  className="text-[13px] font-bold text-primary"
                >
                  전체 내용 보기 ›
                </Link>
              ) : (
                <span className="text-[13px] font-bold text-primary">
                  원문 보기 ↗
                </span>
              )}
              <span className="text-[11px] text-[#adb5bd]">
                자동 수집 콘텐츠 · 요약 오류 신고
              </span>
            </div>
          </article>

          {/* 최신 자료 목록 */}
          <section className="rise-in-1 card flex flex-col gap-1 rounded-[20px] px-6 py-5">
            <div className="mb-1 text-[15px] font-extrabold text-ink">
              최신 자료
            </div>
            {latest.map((n, i) => {
              const row = (
                <>
                  <div className="h-[38px] w-[52px] shrink-0 rounded-lg bg-gradient-to-br from-[#e8edf5] to-[#f2f5fa]" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`shrink-0 rounded-[5px] px-1.5 py-px text-[10px] font-extrabold ${newsBadgeStyle(n.badge)}`}
                      >
                        {n.badge}
                      </span>
                      <span className="truncate text-[13px] font-bold text-ink">
                        {n.title}
                      </span>
                      {latestIsMock && <ExampleBadge />}
                    </div>
                    <div className="mt-0.5 text-[11px] text-text-3">{n.meta}</div>
                  </div>
                  <span className="text-[#c3cad6]">›</span>
                </>
              );
              const rowClass = `flex items-center gap-3.5 py-3 ${
                i < latest.length - 1 ? "border-b border-[#f0f3f8]" : ""
              }`;
              // 목업 항목은 존재하지 않는 상세로 연결하지 않음
              return latestIsMock ? (
                <div key={n.id} className={rowClass}>
                  {row}
                </div>
              ) : (
                <Link key={n.id} href={`/town/news/${n.id}`} className={rowClass}>
                  {row}
                </Link>
              );
            })}
            {latest.length === 0 && (
              /* 12j 빈 상태 규격: 일러스트 52px + 제목 + 한 줄 + CTA 1개 */
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <div
                  className="h-[52px] w-[52px] rounded-2xl"
                  style={{
                    background:
                      "repeating-linear-gradient(45deg,#e2e8f2,#e2e8f2 5px,#eef2f8 5px,#eef2f8 10px)",
                  }}
                />
                <div className="text-sm font-bold text-text-1">
                  추가 자료가 아직 없어요
                </div>
                <div className="text-xs text-text-3">
                  새 자료가 수집되면 이곳에 차례로 쌓여요
                </div>
                <Link
                  href="/town"
                  className="btn-primary mt-1 rounded-[10px] px-4 py-2 text-xs"
                >
                  동네이야기 보기
                </Link>
              </div>
            )}
          </section>
        </div>

        {/* ---------- 사이드바 ---------- */}
        <aside className="flex flex-col gap-4">
          <div className="rise-in-2 card flex flex-col gap-2.5 rounded-[18px] p-[18px]">
            <div className="flex items-center gap-1.5 text-[13px] font-extrabold text-ink">
              나에게 미치는 영향
              {/* 실계산 미연결 — 예시 수치임을 명시 (허위 수치 오인 방지) */}
              <ExampleBadge />
            </div>
            <div className="flex justify-between rounded-[10px] bg-bg px-3 py-2.5 text-xs">
              <span className="text-text-2">현재 월세 65만 기준</span>
              <span className="font-extrabold text-primary">
                연 234만 환급 예상
              </span>
            </div>
            <p className="text-[11px] leading-[1.5] text-text-3">
              예시 프로필(무주택·연소득 7,000만) 기준 계산 예시
            </p>
          </div>

          <div className="rise-in-3 card flex flex-col gap-2 rounded-[18px] p-[18px]">
            <div className="text-[13px] font-extrabold text-ink">관련 이야기</div>
            {related.map((r, i) => (
              <Link
                key={r.title}
                href={r.id ? `/town/news/${r.id}` : "/town"}
                className={`py-2 text-xs text-text-1 ${
                  i < related.length - 1 ? "border-b border-[#f0f3f8]" : ""
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <span className="line-clamp-1">
                    “{r.title}” 댓글 {r.comments}
                  </span>
                  {relatedIsMock && <ExampleBadge />}
                </span>
              </Link>
            ))}
          </div>

          <div className="rise-in-4 flex flex-col gap-1.5 rounded-[18px] bg-[rgba(29,79,216,.08)] p-4 text-center">
            <div className="text-xs font-extrabold text-primary">
              월세 vs 매수, 뭐가 유리할까?
            </div>
            <Link
              href="/analysis/scenario"
              className="btn-primary rounded-[10px] p-2.5 text-xs"
            >
              AI 시나리오로 비교
            </Link>
          </div>
        </aside>
      </div>
    </PageShell>
  );
}
