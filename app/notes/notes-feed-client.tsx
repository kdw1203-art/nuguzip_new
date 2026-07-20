"use client";

import { useState } from "react";
import Link from "next/link";
import { PageShell } from "../components/PageShell";
import { ExampleBadge } from "../components/ExampleBadge";

/* 시안 7a — 공개 임장노트 피드 (데스크탑 피드 + 필터 칩) */

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
  /** 단지 허브(/complex/[id]) 링크 — 실 id를 못 찾으면 undefined → 링크 숨김 */
  complexHref?: string;
  /** 더미 1개 원칙: 실데이터 0건일 때만 노출되는 테스트용 샘플 표시 */
  isExample?: boolean;
};

const FILTERS = ["최신", "인기", "내 관심 지역"] as const;
type Filter = (typeof FILTERS)[number];

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
        <div className="rise-in flex flex-col gap-3 px-1 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-[22px] font-extrabold text-ink md:text-[26px]">
              공개 임장노트
            </h1>
            <p className="mt-1.5 text-sm text-text-2">
              이웃들의 실제 임장 기록 — 실회원 기록만 노출돼요
            </p>
          </div>
          <div className="flex gap-2 text-[13px]">
            {FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`chip px-4 py-2 ${
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
          <div className="rise-in-1 flex items-center gap-1.5 rounded-[12px] border border-line bg-surface px-3.5 py-2.5 text-[11px] text-text-3">
            <ExampleBadge />
            <span>
              아직 공개된 임장노트가 없어 샘플 1건을 보여드려요 — 실데이터가
              쌓이면 자동으로 교체됩니다.
            </span>
          </div>
        )}

        {/* 노트 카드 그리드 */}
        {visible.length === 0 ? (
          <div className="rise-in-1 card rounded-[20px] p-8 text-center text-sm text-text-2">
            해당 필터에 맞는 노트가 아직 없어요.
          </div>
        ) : (
          <div className="rise-in-1 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visible.map((n) => (
              <div
                key={n.id}
                className="card card-hover relative flex flex-col gap-2.5 rounded-[20px] p-5"
              >
                <Link
                  href={`/notes/${n.id}`}
                  aria-label={`${n.title} 노트 보기`}
                  className="absolute inset-0 rounded-[20px]"
                />
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className="h-7 w-7 rounded-full"
                      style={{
                        background:
                          "repeating-linear-gradient(45deg,#e2e8f2,#e2e8f2 5px,#eef2f8 5px,#eef2f8 10px)",
                      }}
                    />
                    <div>
                      <div className="flex items-center gap-1.5 text-xs font-bold text-ink">
                        {n.author}
                        {n.isExample && <ExampleBadge />}
                      </div>
                      <div className="text-[10px] text-text-3">{n.meta}</div>
                    </div>
                  </div>
                  <span
                    className={`text-xs font-extrabold ${
                      n.scoreTone === "primary" ? "text-primary" : "text-text-3"
                    }`}
                  >
                    {n.score}점
                  </span>
                </div>
                <div className="text-[15px] font-extrabold text-ink">{n.title}</div>
                <div className="text-[13px] leading-[1.55] text-text-2">
                  {n.excerpt}
                </div>
                {n.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {n.tags.map((t) => (
                      <span
                        key={t.label}
                        className={`rounded-full px-2 py-[3px] text-[11px] ${
                          t.tone === "pos"
                            ? "bg-primary-soft text-primary"
                            : "bg-danger-soft text-danger"
                        }`}
                      >
                        {t.label}
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex items-center justify-between border-t border-[#f0f3f8] pt-2.5">
                  <div className="flex gap-3.5 text-[11px] text-text-3">
                    {n.footer.map((f) => (
                      <span key={f}>{f}</span>
                    ))}
                  </div>
                  {n.complexHref && (
                    <Link
                      href={n.complexHref}
                      className="relative z-[1] text-[11px] font-extrabold text-primary"
                    >
                      단지 허브 ›
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 모바일 전용 노트 쓰기 CTA (데스크탑은 헤더 CTA 사용) */}
        <Link
          href="/notes/new"
          className="btn-primary rise-in-2 rounded-2xl p-[15px] text-center text-base md:hidden"
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
