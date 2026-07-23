"use client";

import { useState } from "react";
import Link from "next/link";
import { PageShell } from "../components/PageShell";
import { ExampleBadge } from "../components/ExampleBadge";
import { EmptyState } from "@/app/components/ui/EmptyState";
import { CoverImage } from "@/app/components/CoverImage";
import { Icon } from "@/app/components/Icon";

/* 공개 임장노트 — 인스타그램 피드형(세로 단일 컬럼 포스트 카드) */

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
  popularity: number;
  interested: boolean;
  /** 인스타 피드 커버 이미지(첫 사진). 없으면 그라디언트 타일 폴백 */
  coverUrl?: string | null;
  /** 단지 허브(/complex/[id]) 링크 — 실 id를 못 찾으면 undefined → 링크 숨김 */
  complexHref?: string;
  /** 더미 1개 원칙: 실데이터 0건일 때만 노출되는 테스트용 샘플 표시 */
  isExample?: boolean;
};

const FILTERS = ["최신", "인기", "내 관심 지역"] as const;
type Filter = (typeof FILTERS)[number];

/** 시드 문자열 → 결정적 그라디언트(사진 없는 노트 커버/아바타용) */
function seedGradient(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  const hue2 = (hue + 42) % 360;
  return `linear-gradient(135deg, hsl(${hue} 58% 60%), hsl(${hue2} 62% 48%))`;
}

/** 사진 없는 노트의 커버 타일 — 그라디언트 + 단지명 + 점수 (피드 시각 일관성 유지) */
function CoverTile({ note }: { note: FeedNote }) {
  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 px-7 text-center text-white"
      style={{ background: seedGradient(note.id) }}
    >
      <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/85">
        임장노트
      </span>
      <span className="line-clamp-3 text-[23px] font-extrabold leading-[1.25] drop-shadow-sm">
        {note.title}
      </span>
      <span className="mt-1 rounded-full bg-white/22 px-3.5 py-1 text-[12px] font-extrabold backdrop-blur-sm">
        임장 점수 {note.score}
      </span>
    </div>
  );
}

/** 인스타 스타일 포스트 카드 */
function PostCard({ n }: { n: FeedNote }) {
  const detailHref = `/notes/${n.id}`;
  return (
    <article className="mx-auto w-full max-w-[468px] overflow-hidden rounded-[16px] border border-line bg-surface shadow-[0_1px_2px_rgba(16,28,54,.04),0_10px_26px_rgba(16,28,54,.05)]">
      {/* 헤더: 아바타 + 작성자 + 위치 + 점수 */}
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

      {/* 정사각 커버 이미지 (사진 없으면 그라디언트 타일) */}
      <Link
        href={detailHref}
        aria-label={`${n.title} 노트 보기`}
        className="relative block aspect-square bg-bg"
      >
        <CoverImage
          src={n.coverUrl}
          imgClassName="absolute inset-0 h-full w-full object-cover"
          fallback={<CoverTile note={n} />}
        />
      </Link>

      {/* 액션 아이콘 행 */}
      <div className="flex items-center gap-4 px-3.5 pt-3 text-text-1">
        <Link href={detailHref} aria-label="좋아요" className="press">
          <Icon name="heart" size={23} />
        </Link>
        <Link href={detailHref} aria-label="댓글" className="press">
          <Icon name="messages-square" size={22} />
        </Link>
        {n.complexHref && (
          <Link
            href={n.complexHref}
            className="text-[12px] font-bold text-primary no-underline"
          >
            단지 허브 ›
          </Link>
        )}
        <Link href={detailHref} aria-label="저장" className="press ml-auto">
          <Icon name="bookmark" size={22} />
        </Link>
      </div>

      {/* 캡션 + 해시태그 + 메타 */}
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

export function NotesFeedClient({ notes }: { notes: FeedNote[] }) {
  const [filter, setFilter] = useState<Filter>("최신");
  // 더미 1개 원칙: 실데이터 0건이면 서버가 예시 샘플 1건만 내려보냄
  const exampleOnly = notes.length > 0 && notes.every((n) => n.isExample);

  const visible =
    filter === "인기"
      ? [...notes].sort((a, b) => b.popularity - a.popularity)
      : filter === "내 관심 지역"
        ? notes.filter((n) => n.interested)
        : notes;

  return (
    <PageShell>
      <div className="flex flex-col gap-4">
        {/* 피드 헤더 + 필터 칩 */}
        <div className="mx-auto flex w-full max-w-[468px] flex-col gap-3 px-1">
          <div>
            <h1 className="text-[22px] font-extrabold text-ink md:text-[26px]">
              공개 임장노트
            </h1>
            <p className="mt-1.5 text-sm text-text-2">
              이웃들의 실제 임장 기록 — 실회원 기록만 노출돼요
            </p>
          </div>
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 text-[13px] [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`chip press shrink-0 px-4 py-2 ${
                  filter === f
                    ? "chip-active"
                    : "border border-[#e2e7ee] bg-surface text-text-2"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* 더미 1개 원칙: 예시 샘플만 있을 때 안내 캡션 */}
        {exampleOnly && (
          <div className="mx-auto flex w-full max-w-[468px] items-center gap-1.5 rounded-[12px] border border-line bg-surface px-3.5 py-2.5 text-[11px] text-text-3">
            <ExampleBadge />
            <span>
              아직 공개된 임장노트가 없어 샘플 1건을 보여드려요 — 실데이터가
              쌓이면 자동으로 교체됩니다.
            </span>
          </div>
        )}

        {/* 인스타 피드 (세로 단일 컬럼) */}
        {visible.length === 0 ? (
          <div className="mx-auto w-full max-w-[468px]">
            <EmptyState
              icon="file-text"
              title="해당 필터에 맞는 노트가 아직 없어요"
              desc="필터를 바꾸거나, 첫 임장노트를 직접 작성해 보세요."
              action={{ label: "임장노트 쓰기", href: "/notes/new" }}
            />
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {visible.map((n) => (
              <PostCard key={n.id} n={n} />
            ))}
          </div>
        )}

        {/* 모바일 전용 노트 쓰기 CTA (데스크탑은 헤더 CTA 사용) */}
        <Link
          href="/notes/new"
          className="btn-primary rise-in-2 mx-auto w-full max-w-[468px] rounded-2xl p-[15px] text-center text-base md:hidden"
          style={{ boxShadow: "0 10px 26px rgba(29,79,216,.35)" }}
        >
          노트 쓰기
        </Link>
      </div>

      {/* 모바일 노트 쓰기 FAB — 탭바 중앙 '노트'가 /notes 목록으로 연결되므로 쓰기 진입 보장 */}
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
