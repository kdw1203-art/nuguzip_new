import Link from "next/link";
import { PageShell } from "../components/PageShell";
import { readTownPosts } from "@/lib/newui/board-posts";
import { listMeetings, type UserMeeting } from "@/lib/meetings/store-db";
import {
  COMMUNITY_SUBCATEGORIES,
  findSub,
  matchSubcategory,
} from "@/lib/subcategories";
import type { Post } from "@/lib/types/post";

/* 시안 6d(동네이야기 데스크탑) + 6e(동네이야기 모바일) — posts 실데이터 연동 */

export const dynamic = "force-dynamic";

/* ---------- 목업 폴백 (DB 미연결 시) ---------- */

const FALLBACK_POSTS: Post[] = [
  {
    id: "mock-1",
    authorLabel: "첫집준비중",
    category: "임장후기",
    city: "경기도",
    district: "안양시 동안구",
    title: "공작아파트 3번째 임장 다녀왔어요 — 주차가 관건이네요",
    body: "저녁 8시에 가보니 이중주차가 꽤 많았습니다. 채광이랑 학군은 확실히 좋은데…",
    tags: ["임장", "후기"],
    createdAt: new Date(Date.now() - 2 * 3600_000).toISOString(),
    updatedAt: new Date(Date.now() - 2 * 3600_000).toISOString(),
    likeCount: 12,
    commentCount: 8,
    viewCount: 120,
    comments: [],
  },
  {
    id: "mock-2",
    authorLabel: "마포러버",
    category: "질문/상담",
    city: "서울특별시",
    district: "마포구",
    title: "마포 신축 vs 구축 리모델링, 첫 집으로 어떤 게 나을까요?",
    body: "",
    tags: ["질문"],
    createdAt: new Date(Date.now() - 5 * 3600_000).toISOString(),
    updatedAt: new Date(Date.now() - 5 * 3600_000).toISOString(),
    likeCount: 24,
    commentCount: 17,
    viewCount: 310,
    comments: [],
  },
  {
    id: "mock-3",
    authorLabel: "뉴스 자동수집",
    category: "부동산 뉴스",
    city: "기타(전국)",
    district: "",
    title: "“청년 82.6% 세입자 시대…월세 부담 낮춰야”",
    body: "",
    tags: ["뉴스"],
    createdAt: new Date(Date.now() - 26 * 3600_000).toISOString(),
    updatedAt: new Date(Date.now() - 26 * 3600_000).toISOString(),
    likeCount: 31,
    commentCount: 6,
    viewCount: 540,
    comments: [],
    isAutomated: true,
    sourceName: "OO일보",
  },
];

const FALLBACK_GROUPS = [
  { id: null, title: "과천지식정보타운 같이 봐요", meta: "7.25 (토) 10:00 · 4/6명" },
  { id: null, title: "마포 구축 리모델링 스터디", meta: "7.26 (일) 14:00 · 2/4명" },
];

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

function displayTimeIso(p: Post) {
  return p.sourcePublishedAt || p.createdAt;
}

function badgeStyle(category: string) {
  const c = category ?? "";
  if (["질문", "상담", "Q&A"].some((k) => c.includes(k)))
    return "bg-[#fdf3e7] text-[#c07a3a]";
  if (["뉴스", "정책", "시장", "이슈"].some((k) => c.includes(k)))
    return "bg-[#f2f4f8] text-text-2";
  return "bg-[#edf2fe] text-primary";
}

function meetingMeta(m: UserMeeting) {
  const when = m.scheduledAt
    ? new Date(m.scheduledAt).toLocaleDateString("ko-KR", {
        month: "numeric",
        day: "numeric",
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "일정 미정";
  return `${when} · ${m.currentMembers}/${m.maxMembers}명`;
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

export default async function TownPage({
  searchParams,
}: {
  searchParams: Promise<{ sub?: string; sort?: string }>;
}) {
  const sp = await searchParams;
  const sub = findSub(COMMUNITY_SUBCATEGORIES, sp.sub);
  const sort = sp.sort === "popular" ? "popular" : "latest";

  /* posts 스토어 + board_posts(운영 DB) 병합 실데이터 —
     더미데이터 정책: 실데이터 1건 이상이면 실데이터만, 0건일 때만 예시 목업 */
  let allPosts: Post[] = [];
  try {
    allPosts = await readTownPosts();
  } catch {
    allPosts = [];
  }
  const usingFallback = allPosts.length === 0;
  if (usingFallback) allPosts = FALLBACK_POSTS;

  const countBySub = COMMUNITY_SUBCATEGORIES.map((c) => ({
    ...c,
    count:
      c.id === "all"
        ? allPosts.length
        : allPosts.filter((p) =>
            matchSubcategory(c, [p.category, p.title, ...(p.tags ?? [])]),
          ).length,
  }));

  let posts =
    sub.id === "all"
      ? allPosts
      : allPosts.filter((p) =>
          matchSubcategory(sub, [p.category, p.title, ...(p.tags ?? [])]),
        );

  if (sort === "popular") {
    posts = [...posts].sort(
      (a, b) =>
        b.likeCount + b.commentCount * 2 - (a.likeCount + a.commentCount * 2),
    );
  } else {
    // 최신순: 이웃 글(UGC) 우선, 뉴스 자동수집 글은 뒤로 (구 커뮤니티 정렬 방식)
    posts = [...posts].sort((a, b) => {
      const autoDiff =
        Number(Boolean(a.isAutomated)) - Number(Boolean(b.isAutomated));
      if (autoDiff !== 0) return autoDiff;
      return (
        new Date(displayTimeIso(b)).getTime() -
        new Date(displayTimeIso(a)).getTime()
      );
    });
  }
  const feed = posts.slice(0, 20);

  /* 내 관심 지역 — 게시글 상위 지역에서 도출 */
  const regionCount = new Map<string, number>();
  for (const p of allPosts) {
    const r = p.city && p.district ? `${p.city} ${p.district}` : p.city;
    if (r) regionCount.set(r, (regionCount.get(r) ?? 0) + 1);
  }
  const topRegions = [...regionCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([r]) => r);
  // 실데이터 없으면 예시 라벨이 붙은 목업 지역 노출
  const regionsFallback = topRegions.length === 0;
  const myRegions = regionsFallback ? ["안양 관양동", "서울 마포구"] : topRegions;

  /* 이번 주 임장 모임 — meetings 실데이터 (없으면 목업) */
  let weekGroups: { id: string | null; title: string; meta: string }[] = [];
  try {
    const meetings = await listMeetings();
    weekGroups = meetings
      .slice(0, 2)
      .map((m) => ({ id: m.id, title: m.title, meta: meetingMeta(m) }));
  } catch {
    weekGroups = [];
  }
  const groupsFallback = weekGroups.length === 0;
  if (groupsFallback) weekGroups = FALLBACK_GROUPS;

  const hrefFor = (overrides: { sub?: string; sort?: string }) => {
    const p = new URLSearchParams();
    const nextSub = overrides.sub ?? sub.id;
    const nextSort = overrides.sort ?? sort;
    if (nextSub !== "all") p.set("sub", nextSub);
    if (nextSort !== "latest") p.set("sort", nextSort);
    const s = p.toString();
    return s ? `/town?${s}` : "/town";
  };

  return (
    <PageShell>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="rise-in text-[22px] font-extrabold text-ink">
          동네이야기
        </h1>
        <Link
          href="/town/write"
          className="btn-primary btn-cta hidden px-4 py-[9px] text-[13px] md:block"
        >
          글쓰기
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-[1fr_340px]">
        {/* ---------- 피드 ---------- */}
        <div className="flex flex-col gap-3.5">
          <div className="rise-in flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {countBySub.map((c) => (
              <Link
                key={c.id}
                href={hrefFor({ sub: c.id })}
                className={`chip shrink-0 px-3.5 py-2 text-[13px] ${
                  sub.id === c.id
                    ? "chip-active"
                    : "border border-[#e2e7ee] bg-surface text-text-2"
                }`}
              >
                {c.label}
                <span
                  className={`ml-1 text-[11px] ${
                    sub.id === c.id ? "text-white/75" : "text-text-3"
                  }`}
                >
                  {c.count}
                </span>
              </Link>
            ))}
            <div className="flex-1" />
            <Link
              href={hrefFor({ sort: sort === "latest" ? "popular" : "latest" })}
              className="shrink-0 self-center text-[13px] font-semibold text-text-3"
            >
              {sort === "latest" ? "최신순 ▾" : "인기순 ▾"}
            </Link>
          </div>

          {feed.map((p, i) => {
            const byline = p.isAutomated
              ? p.sourceName || "뉴스 자동수집"
              : p.authorLabel;
            const region =
              p.city && p.district ? `${p.city} ${p.district}` : p.city || "전국";
            return (
              <Link key={p.id} href={`/town/news/${p.id}`}>
                <article
                  className={`card card-hover rise-in-${Math.min(i + 1, 6)} flex flex-col gap-2.5 rounded-[18px] px-6 py-5`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-md px-2 py-[3px] text-[11px] font-bold ${badgeStyle(p.category)}`}
                    >
                      {p.category}
                    </span>
                    <span className="truncate text-xs text-text-3">
                      {byline} · {region} · {relativeTime(displayTimeIso(p))}
                    </span>
                    {usingFallback && <ExampleBadge />}
                  </div>
                  <h2 className="text-base font-bold leading-[1.45] text-ink">
                    {p.title}
                  </h2>
                  {p.body && (
                    <p className="line-clamp-2 text-sm leading-[1.55] text-text-2">
                      {p.body}
                    </p>
                  )}
                  <div className="flex gap-4 text-xs text-text-3">
                    <span>공감 {p.likeCount}</span>
                    <span>댓글 {p.commentCount}</span>
                    <span>조회 {p.viewCount}</span>
                  </div>
                </article>
              </Link>
            );
          })}

          {feed.length === 0 && (
            /* 12j 빈 상태 규격: 일러스트 52px + 제목 + 한 줄 + CTA 1개 */
            <div className="card flex flex-col items-center gap-2 rounded-[18px] px-6 py-10 text-center">
              <div
                className="h-[52px] w-[52px] rounded-2xl"
                style={{
                  background:
                    "repeating-linear-gradient(45deg,#e2e8f2,#e2e8f2 5px,#eef2f8 5px,#eef2f8 10px)",
                }}
              />
              <div className="text-sm font-bold text-text-1">
                {sub.label} 게시판에 아직 글이 없어요
              </div>
              <div className="text-xs text-text-3">
                첫 글을 남기면 이웃들에게 가장 먼저 보여요
              </div>
              <Link
                href="/town/write"
                className="btn-primary mt-1 rounded-[10px] px-4 py-2 text-xs"
              >
                첫 글 쓰기
              </Link>
            </div>
          )}
        </div>

        {/* ---------- 사이드바 ---------- */}
        <aside className="flex flex-col gap-4">
          <div className="rise-in-2 card flex flex-col gap-3 rounded-[18px] p-5">
            <div className="text-sm font-extrabold text-ink">내 관심 지역</div>
            <div className="flex flex-wrap gap-2">
              {myRegions.map((r) => (
                <span
                  key={r}
                  className="chip-soft inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs"
                >
                  {r}
                  {regionsFallback && <ExampleBadge />}
                </span>
              ))}
              <span className="rounded-full bg-[#f2f4f8] px-3 py-1.5 text-xs font-semibold text-text-2">
                ＋ 추가
              </span>
            </div>
          </div>

          <div className="rise-in-3 card flex flex-col gap-2.5 rounded-[18px] p-5">
            <div className="text-sm font-extrabold text-ink">
              이번 주 임장 모임
            </div>
            {weekGroups.map((g) => (
              <Link
                key={g.title}
                href={g.id ? `/town/groups/${g.id}` : "/town/groups"}
                className="rounded-xl bg-bg px-3.5 py-3 transition-colors hover:bg-[#eef2f8]"
              >
                <div className="flex items-center gap-1.5 text-[13px] font-bold text-ink">
                  <span className="min-w-0 truncate">{g.title}</span>
                  {groupsFallback && <ExampleBadge />}
                </div>
                <div className="mt-[3px] text-[11px] text-text-3">{g.meta}</div>
              </Link>
            ))}
          </div>

          <div className="rise-in-4 ai-panel flex flex-col gap-2 rounded-[18px] p-5">
            <div className="text-[13px] font-extrabold text-white">
              검증된 전문가 상담
            </div>
            <p className="text-xs leading-[1.55] text-ai-text">
              중개사·세무사에게 노트를 첨부해 바로 질문하세요
            </p>
            <Link
              href="/town/experts"
              className="btn-primary mt-1 rounded-[10px] p-2.5 text-center text-xs"
            >
              전문가 찾기
            </Link>
          </div>
        </aside>
      </div>

      {/* 모바일 글쓰기 FAB (6e) */}
      <Link
        href="/town/write"
        aria-label="글쓰기"
        className="btn-primary fixed bottom-28 right-[18px] z-40 flex h-[52px] w-[52px] items-center justify-center rounded-full text-[22px] md:hidden"
        style={{ boxShadow: "0 10px 24px rgba(29,79,216,.45)" }}
      >
        ✎
      </Link>
    </PageShell>
  );
}
