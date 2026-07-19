"use client";

import { useState } from "react";
import Link from "next/link";
import { PageShell } from "../components/PageShell";

/* 시안 7a — 공개 임장노트 피드 (데스크탑 피드 + 필터 칩) */

type TagTone = "pos" | "neg";

type FeedNote = {
  id: number;
  author: string;
  meta: string;
  score: number;
  scoreTone: "primary" | "muted";
  title: string;
  excerpt: string;
  tags: { label: string; tone: TagTone }[];
  likes: number;
  comments: number;
  saves: number;
  interested: boolean;
};

const NOTES: FeedNote[] = [
  {
    id: 1,
    author: "관양동 이웃",
    meta: "2시간 전 · 3번째 방문",
    score: 78,
    scoreTone: "primary",
    title: "공작아파트 302동 84A",
    excerpt: "“오후 채광 좋음, 단지 뒤 도로 소음 약간. 주차는 저녁 이중주차…”",
    tags: [
      { label: "채광 좋음", tone: "pos" },
      { label: "초품아", tone: "pos" },
      { label: "이중주차", tone: "neg" },
    ],
    likes: 12,
    comments: 5,
    saves: 8,
    interested: true,
  },
  {
    id: 2,
    author: "마포 이웃",
    meta: "5시간 전 · 첫 방문",
    score: 82,
    scoreTone: "primary",
    title: "마포래미안 115동 59A",
    excerpt: "“역까지 실측 도보 7분. 커뮤니티 시설이 기대 이상, 관리비는…”",
    tags: [
      { label: "역세권", tone: "pos" },
      { label: "커뮤니티", tone: "pos" },
    ],
    likes: 24,
    comments: 11,
    saves: 19,
    interested: false,
  },
  {
    id: 3,
    author: "과천 이웃",
    meta: "어제 · 2번째 방문",
    score: 64,
    scoreTone: "muted",
    title: "과천 위버필드 204동",
    excerpt: "“경사가 생각보다 심함. 유모차 동선은 후문 쪽만 가능…”",
    tags: [
      { label: "경사 심함", tone: "neg" },
      { label: "신축감", tone: "pos" },
    ],
    likes: 7,
    comments: 3,
    saves: 4,
    interested: true,
  },
];

const FILTERS = ["최신", "인기", "내 관심 지역"] as const;
type Filter = (typeof FILTERS)[number];

export default function NotesFeedPage() {
  const [filter, setFilter] = useState<Filter>("최신");

  const visible =
    filter === "인기"
      ? [...NOTES].sort((a, b) => b.likes - a.likes)
      : filter === "내 관심 지역"
        ? NOTES.filter((n) => n.interested)
        : NOTES;

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
              이웃들의 실제 임장 기록 — 샘플·시드 없이 실회원 기록만
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

        {/* 노트 카드 그리드 */}
        <div className="rise-in-1 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((n) => (
            <Link
              key={n.id}
              href={`/notes/${n.id}`}
              className="card card-hover flex flex-col gap-2.5 rounded-[20px] p-5"
            >
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
                    <div className="text-xs font-bold text-ink">{n.author}</div>
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
              <div className="flex gap-3.5 border-t border-[#f0f3f8] pt-2.5 text-[11px] text-text-3">
                <span>공감 {n.likes}</span>
                <span>댓글 {n.comments}</span>
                <span>저장 {n.saves}</span>
              </div>
            </Link>
          ))}
        </div>

        {/* 모바일 전용 노트 쓰기 CTA (데스크탑은 헤더 CTA 사용) */}
        <Link
          href="/notes/new"
          className="btn-primary rise-in-2 rounded-2xl p-[15px] text-center text-base md:hidden"
          style={{ boxShadow: "0 10px 26px rgba(29,79,216,.35)" }}
        >
          노트 쓰기
        </Link>
      </div>
    </PageShell>
  );
}
