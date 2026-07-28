"use client";

import { useState } from "react";
import Link from "next/link";
import { PageShell } from "../components/PageShell";
import { ExampleBadge } from "../components/ExampleBadge";
import { EmptyState } from "@/app/components/ui/EmptyState";
import { CoverImage } from "@/app/components/CoverImage";
import { Icon } from "@/app/components/Icon";

/* 공개 임장노트 — 인스타그램형(스토리 줄 + 3열 그리드 ⇄ 피드 전환) */

export type TagTone = "pos" | "neg";

export type FeedNote = {
  id: string;
  author: string;
  meta: string;
  score: number; // 0~100
  scoreTone: "primary" | "muted";
  title: string;
  excerpt: string;
  tags: { label: string; tone: TagTone }[];
  footer: string[];
  /** 서버에서 사용자의 지역 알림 구독과 대조해 채운다 (전에는 전부 false 고정이었다) */
  interested: boolean;
  region?: string;
  /** 커버 이미지(첫 사진). 없으면 그라디언트 타일 폴백 */
  coverUrl?: string | null;
  /** 단지 허브(/complex/[id]) 링크 — 실 id를 못 찾으면 undefined → 링크 숨김 */
  complexHref?: string;
  /** 더미 1개 원칙: 실데이터 0건일 때만 노출되는 테스트용 샘플 표시 */
  isExample?: boolean;
};

/* 정렬·필터 칩.
   "인기" 였던 칩은 "점수순" 으로 바꿨다 — 정렬 키가 작성자 본인이 매긴 임장 점수라
   조회·좋아요·저장 같은 반응 신호가 하나도 섞여 있지 않았기 때문이다. 노트에는 저장
   기능 자체가 없어(bookmarks 의 target_type 에 note 가 없다) 실참여 수치를 넣을 수도
   없으므로, 없는 인기를 만들어 내는 대신 라벨을 실제 정렬 기준에 맞췄다. */
const FILTERS = ["최신", "점수순", "내 관심 지역"] as const;
type Filter = (typeof FILTERS)[number];
type ViewMode = "grid" | "feed";

/** 시드 문자열 → 결정적 그라디언트(사진 없는 노트 커버/아바타용) */
function seedGradient(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  const hue2 = (hue + 42) % 360;
  return `linear-gradient(135deg, hsl(${hue} 58% 60%), hsl(${hue2} 62% 48%))`;
}

/** 지역명에서 짧은 라벨(구/동) 추출 — 스토리·타일 라벨용 */
function shortLabel(n: FeedNote): string {
  const r = (n.region ?? "").trim();
  if (r) {
    const tokens = r.split(/\s+/).filter(Boolean);
    return tokens[tokens.length - 1] ?? r;
  }
  return n.title.slice(0, 6);
}

/* ── 상단 스토리 줄 (최근 임장 · 인스타 스토리 느낌) ── */
function StoryRail({ notes }: { notes: FeedNote[] }) {
  const IG_RING =
    "linear-gradient(45deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)";
  return (
    <div className="-mx-5 overflow-x-auto px-5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:mx-0 md:rounded-2xl md:border md:border-line md:bg-surface md:px-4 md:py-3">
      <div className="flex gap-3.5 pb-1 md:pb-0">
        {/* 내 스토리 = 노트 쓰기 */}
        <Link
          href="/notes/new"
          className="flex w-[64px] shrink-0 flex-col items-center gap-1.5"
        >
          <span className="flex h-[62px] w-[62px] items-center justify-center rounded-full border-2 border-dashed border-[#d5dceb] text-primary">
            <Icon name="plus" size={22} />
          </span>
          <span className="w-full truncate text-center text-[10px] text-text-2">
            노트 쓰기
          </span>
        </Link>
        {notes.slice(0, 14).map((n) => (
          <Link
            key={n.id}
            href={`/notes/${n.id}`}
            className="flex w-[64px] shrink-0 flex-col items-center gap-1.5"
          >
            <span
              className="h-[62px] w-[62px] rounded-full p-[2.5px]"
              style={{ background: IG_RING }}
            >
              <span className="block h-full w-full overflow-hidden rounded-full border-2 border-surface bg-bg">
                <CoverImage
                  src={n.coverUrl}
                  imgClassName="h-full w-full object-cover"
                  fallback={
                    <span
                      className="flex h-full w-full items-center justify-center text-[15px] font-extrabold text-white"
                      style={{ background: seedGradient(n.id) }}
                    >
                      {shortLabel(n).slice(0, 2)}
                    </span>
                  }
                />
              </span>
            </span>
            <span className="w-full truncate text-center text-[10px] text-text-2">
              {shortLabel(n)}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

/* ── 그리드 타일 (탐색·프로필 그리드) ── */
function GridTile({ n }: { n: FeedNote }) {
  return (
    <Link
      href={`/notes/${n.id}`}
      aria-label={`${n.title} 노트 보기`}
      className="group relative block aspect-[3/4] overflow-hidden bg-bg md:rounded-2xl md:shadow-[0_1px_2px_rgba(16,28,54,.05),0_8px_20px_rgba(16,28,54,.06)] md:transition-transform md:duration-200 md:hover:-translate-y-1"
    >
      <CoverImage
        src={n.coverUrl}
        imgClassName="absolute inset-0 h-full w-full object-cover md:transition-transform md:duration-300 md:group-hover:scale-[1.06]"
        fallback={
          <span
            className="absolute inset-0"
            style={{ background: seedGradient(n.id) }}
          />
        }
      />
      {/* 점수 배지 (인스타 조회수/캐러셀 인디케이터 위치) */}
      <span className="absolute right-1.5 top-1.5 rounded-md bg-black/45 px-1.5 py-0.5 text-[10px] font-extrabold text-white backdrop-blur-sm md:right-2.5 md:top-2.5 md:text-[11px]">
        {n.score}점
      </span>
      {n.isExample && (
        <span className="absolute left-1.5 top-1.5 rounded bg-black/45 px-1.5 py-0.5 text-[9px] font-bold text-white backdrop-blur-sm">
          예시
        </span>
      )}
      {/* 하단 스크림 + 제목·지역 오버레이 */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/78 via-black/25 to-transparent px-2 pb-2 pt-7 md:px-3 md:pb-3">
        <p className="line-clamp-2 text-[11.5px] font-bold leading-[1.25] text-white drop-shadow-sm md:text-[14px]">
          {n.title}
        </p>
        {n.region && (
          <p className="mt-0.5 truncate text-[9.5px] text-white/85 md:mt-1 md:text-[11.5px]">
            {n.region}
          </p>
        )}
      </div>
    </Link>
  );
}

/* ── 피드 포스트 카드 (홈 피드) ── */
function PostCard({ n }: { n: FeedNote }) {
  const detailHref = `/notes/${n.id}`;
  return (
    <article className="mx-auto w-full max-w-[468px] overflow-hidden rounded-[16px] border border-line bg-surface shadow-[0_1px_2px_rgba(16,28,54,.04),0_10px_26px_rgba(16,28,54,.05)]">
      <div className="flex items-center gap-2.5 px-3.5 py-2.5">
        <div
          className="h-8 w-8 shrink-0 rounded-full ring-2 ring-primary-soft"
          style={{ background: seedGradient(n.author) }}
          aria-hidden="true"
        />
        <div className="min-w-0">
          <div className="flex items-center gap-1 text-[13px] font-bold text-ink">
            <span className="truncate">{n.author}</span>
            {n.isExample && <ExampleBadge />}
          </div>
          <div className="truncate text-[11px] text-text-3">{n.title}</div>
        </div>
        <span
          className={`ml-auto shrink-0 rounded-full px-2.5 py-1 text-[11px] font-extrabold ${
            n.scoreTone === "primary"
              ? "bg-primary-soft text-primary"
              : "bg-[rgba(127,140,158,.12)] text-text-3"
          }`}
        >
          {n.score}점
        </span>
      </div>
      <Link
        href={detailHref}
        aria-label={`${n.title} 노트 보기`}
        className="relative block aspect-square bg-bg"
      >
        <CoverImage
          src={n.coverUrl}
          imgClassName="absolute inset-0 h-full w-full object-cover"
          fallback={
            <div
              className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 px-7 text-center text-white"
              style={{ background: seedGradient(n.id) }}
            >
              <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/85">
                임장노트
              </span>
              <span className="line-clamp-3 text-[23px] font-extrabold leading-[1.25] drop-shadow-sm">
                {n.title}
              </span>
              <span className="mt-1 rounded-full bg-white/22 px-3.5 py-1 text-[12px] font-extrabold backdrop-blur-sm">
                임장 점수 {n.score}
              </span>
            </div>
          }
        />
      </Link>
      {/* 하트·댓글·북마크 아이콘 제거 — 기능이 없는 장식은 두지 않는다. 상세 진입은 카드/자세히 보기로 충분 */}
      {n.complexHref && (
        <div className="flex items-center px-3.5 pt-3">
          <Link
            href={n.complexHref}
            className="text-[12px] font-bold text-primary no-underline"
          >
            단지 허브 ›
          </Link>
        </div>
      )}
      <div className="px-3.5 pb-3.5 pt-2">
        <p className="text-[13px] leading-[1.55] text-text-1">
          <span className="font-bold text-ink">{n.author}</span>{" "}
          <span className="text-text-2">{n.excerpt}</span>
        </p>
        {n.tags.length > 0 && (
          <p className="mt-1.5 flex flex-wrap gap-x-1.5 gap-y-0.5 text-[12px] font-semibold text-primary">
            {n.tags.map((t) => (
              <span key={t.label}>#{t.label.replace(/\s/g, "")}</span>
            ))}
          </p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-x-2 text-[11px] text-text-3">
          <span>{n.meta}</span>
          {n.footer.map((f) => (
            <span key={f}>· {f}</span>
          ))}
        </div>
        <Link
          href={detailHref}
          className="mt-2 inline-block text-[12px] font-semibold text-text-3 no-underline"
        >
          자세히 보기 ›
        </Link>
      </div>
    </article>
  );
}

/* 그리드/피드 전환 아이콘 (인라인 SVG) */
function GridGlyph({ active }: { active: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {[3, 10, 17].map((x) =>
        [3, 10, 17].map((y) => (
          <rect
            key={`${x}-${y}`}
            x={x}
            y={y}
            width="4"
            height="4"
            rx="1"
            fill={active ? "currentColor" : "#c3cad6"}
          />
        )),
      )}
    </svg>
  );
}
function FeedGlyph({ active }: { active: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {[4, 14].map((y) => (
        <rect
          key={y}
          x="3"
          y={y}
          width="18"
          height="6"
          rx="1.5"
          fill={active ? "currentColor" : "#c3cad6"}
        />
      ))}
    </svg>
  );
}

export function NotesFeedClient({
  notes,
  mine = false,
  loadError = null,
  showInterestFilter = false,
}: {
  notes: FeedNote[];
  /** 내 노트 뷰(?mine=1) — 세션 사용자의 노트(비공개 포함) */
  mine?: boolean;
  /** 조회 자체가 실패했을 때의 사유. "노트가 없다" 와 반드시 구분해 표시한다. */
  loadError?: string | null;
  /** 지역 알림 구독이 1건 이상일 때만 true. false 면 "내 관심 지역" 칩을 아예 감춘다 */
  showInterestFilter?: boolean;
}) {
  const [filter, setFilter] = useState<Filter>("최신");
  const [view, setView] = useState<ViewMode>("grid");
  const exampleOnly = notes.length > 0 && notes.every((n) => n.isExample);

  /* 구독 지역이 없으면 "내 관심 지역" 은 무엇을 눌러도 0건이라 칩 자체를 숨긴다.
     비활성 상태로 남겨 두면 눌리는데 아무 일도 안 하는 컨트롤이 된다. */
  const filters = FILTERS.filter((f) => f !== "내 관심 지역" || showInterestFilter);
  const activeFilter = filters.includes(filter) ? filter : "최신";

  const visible =
    activeFilter === "점수순"
      ? [...notes].sort((a, b) => b.score - a.score)
      : activeFilter === "내 관심 지역"
        ? notes.filter((n) => n.interested)
        : notes;

  return (
    <PageShell>
      <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-4 md:gap-5">
        {/* 헤더 */}
        <div className="px-1">
          <h1 className="text-[22px] font-extrabold text-ink md:text-[26px]">
            {mine ? "내 임장노트" : "공개 임장노트"}
          </h1>
          <p className="mt-1.5 text-sm text-text-2">
            {mine
              ? "내가 남긴 임장 기록 — 비공개 노트도 여기서만 보여요"
              : "이웃들의 실제 임장 기록 — 실회원 기록만 노출돼요"}
          </p>
          {!mine && (
            <p className="mt-2 text-[12px]">
              <Link href="/notes/best" className="font-bold text-primary underline">
                이달의 공개 임장노트 — 선정 기준까지 공개 ›
              </Link>
            </p>
          )}
        </div>

        {/* 조회 실패 — 이 경우 "노트가 없다" 고 읽히면 안 되므로 빈 상태와 분리한다 */}
        {loadError && (
          <div className="rounded-[12px] border border-line bg-surface px-3.5 py-3 text-[12px] leading-[1.6] text-text-2">
            {mine ? "내 임장노트를" : "공개 임장노트를"}{" "}
            <strong className="text-ink">불러오지 못했습니다</strong>. 노트가 없다는 뜻이 아니라
            조회 자체가 실패했다는 뜻입니다. 잠시 후 다시 확인해 주세요.
          </div>
        )}

        {/* 스토리 줄 */}
        {visible.length > 0 && <StoryRail notes={visible} />}

        {/* 필터 칩 + 뷰 전환 */}
        <div className="flex items-center justify-between gap-2 px-1">
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 text-[13px] [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {filters.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`chip press shrink-0 px-4 py-2 ${
                  activeFilter === f
                    ? "chip-active"
                    : "border border-[#e2e7ee] bg-surface text-text-2"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              aria-label="그리드 보기"
              aria-pressed={view === "grid"}
              onClick={() => setView("grid")}
              className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                view === "grid" ? "bg-primary-soft text-primary" : "text-text-3"
              }`}
            >
              <GridGlyph active={view === "grid"} />
            </button>
            <button
              type="button"
              aria-label="피드 보기"
              aria-pressed={view === "feed"}
              onClick={() => setView("feed")}
              className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                view === "feed" ? "bg-primary-soft text-primary" : "text-text-3"
              }`}
            >
              <FeedGlyph active={view === "feed"} />
            </button>
          </div>
        </div>

        {/* 예시 안내 */}
        {exampleOnly && (
          <div className="flex items-center gap-1.5 rounded-[12px] border border-line bg-surface px-3.5 py-2.5 text-[11px] text-text-3">
            <ExampleBadge />
            <span>
              아직 공개된 임장노트가 없어 샘플 1건을 보여드려요 — 실데이터가
              쌓이면 자동으로 교체됩니다.
            </span>
          </div>
        )}

        {/* 본문: 그리드 / 피드 / 빈 상태 */}
        {visible.length === 0 ? (
          /* 빈 상태를 한 문장으로 뭉뚱그리면 "노트가 없다"와 "필터가 걸러 냈다"가
             섞인다. 노트는 있는데 필터 결과만 0건인 경우를 따로 적는다. */
          notes.length > 0 ? (
            <EmptyState
              icon="file-text"
              title={
                activeFilter === "내 관심 지역"
                  ? "구독한 지역의 노트는 아직 없어요"
                  : "해당 필터에 맞는 노트가 아직 없어요"
              }
              desc={
                activeFilter === "내 관심 지역"
                  ? `노트 ${notes.length}건 중 내가 구독한 지역과 겹치는 건 없었어요. 필터를 '최신'으로 바꾸면 전체를 볼 수 있어요.`
                  : "필터를 바꾸면 다른 노트를 볼 수 있어요."
              }
              action={{ label: "임장노트 쓰기", href: "/notes/new" }}
            />
          ) : (
            <EmptyState
              icon="file-text"
              title={
                mine
                  ? "아직 작성한 임장노트가 없어요"
                  : "아직 공개된 임장노트가 없어요"
              }
              desc={
                mine
                  ? "첫 임장노트를 작성하면 비공개 노트까지 여기에 모여요."
                  : "첫 임장노트를 직접 작성해 보세요."
              }
              action={{ label: "임장노트 쓰기", href: "/notes/new" }}
            />
          )
        ) : view === "grid" ? (
          // 모바일: 가장자리까지 붙는 촘촘한 3열(인스타 앱). 데스크탑: 넓은 4~5열 보드(둥근 카드·호버·여백)
          <div className="-mx-5 grid grid-cols-3 gap-0.5 md:mx-0 md:grid-cols-4 md:gap-3.5 xl:grid-cols-5">
            {visible.map((n) => (
              <GridTile key={n.id} n={n} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {visible.map((n) => (
              <PostCard key={n.id} n={n} />
            ))}
          </div>
        )}

        {/* 모바일 전용 노트 쓰기 CTA */}
        <Link
          href="/notes/new"
          className="btn-primary rise-in-2 mx-auto w-full max-w-[468px] rounded-2xl p-[15px] text-center text-base md:hidden"
          style={{ boxShadow: "0 10px 26px rgba(29,79,216,.35)" }}
        >
          노트 쓰기
        </Link>
      </div>

      {/* 모바일 노트 쓰기 FAB */}
      <Link
        href="/notes/new"
        aria-label="노트 쓰기"
        className="btn-primary fixed right-[18px] z-40 flex h-[52px] w-[52px] items-center justify-center rounded-full text-[24px] md:hidden"
        style={{
          boxShadow: "0 10px 24px rgba(29,79,216,.45)",
          bottom: "calc(env(safe-area-inset-bottom, 0px) + 96px)",
        }}
      >
        ＋
      </Link>
    </PageShell>
  );
}
