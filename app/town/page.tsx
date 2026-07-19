"use client";

import { useState } from "react";
import Link from "next/link";
import { PageShell } from "../components/PageShell";

/* 시안 6d(동네이야기 데스크탑) + 6e(동네이야기 모바일) */

const CATEGORIES = ["전체", "질문", "임장후기", "시장·정책"] as const;
type Category = (typeof CATEGORIES)[number];

type Post = {
  category: Exclude<Category, "전체">;
  badge: string;
  meta: string;
  title: string;
  body?: string;
  stats: string[];
};

const BADGE_STYLE: Record<Post["category"], string> = {
  임장후기: "bg-[#edf2fe] text-primary",
  질문: "bg-[#fdf3e7] text-[#c07a3a]",
  "시장·정책": "bg-[#f2f4f8] text-text-2",
};

const POSTS: Post[] = [
  {
    category: "임장후기",
    badge: "임장후기",
    meta: "안양 관양동 · 2시간 전",
    title: "공작아파트 3번째 임장 다녀왔어요 — 주차가 관건이네요",
    body: "저녁 8시에 가보니 이중주차가 꽤 많았습니다. 채광이랑 학군은 확실히 좋은데…",
    stats: ["공감 12", "댓글 8", "첨부 임장노트 첨부"],
  },
  {
    category: "질문",
    badge: "질문",
    meta: "서울 마포구 · 5시간 전",
    title: "마포 신축 vs 구축 리모델링, 첫 집으로 어떤 게 나을까요?",
    stats: ["공감 24", "댓글 17"],
  },
  {
    category: "시장·정책",
    badge: "시장·정책",
    meta: "전국 · 어제",
    title: "“청년 82.6% 세입자 시대…월세 부담 낮춰야”",
    stats: ["공감 31", "댓글 6"],
  },
];

const MY_REGIONS = ["안양 관양동", "서울 마포구"];

const WEEK_GROUPS = [
  { title: "과천지식정보타운 같이 봐요", meta: "7.25 (토) 10:00 · 4/6명" },
  { title: "마포 구축 리모델링 스터디", meta: "7.26 (일) 14:00 · 2/4명" },
];

export default function TownPage() {
  const [category, setCategory] = useState<Category>("전체");
  const posts =
    category === "전체" ? POSTS : POSTS.filter((p) => p.category === category);

  return (
    <PageShell>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="rise-in text-[22px] font-extrabold text-ink">
          동네이야기
        </h1>
        <button
          type="button"
          className="btn-primary btn-cta hidden px-4 py-[9px] text-[13px] md:block"
        >
          글쓰기
        </button>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-[1fr_340px]">
        {/* ---------- 피드 ---------- */}
        <div className="flex flex-col gap-3.5">
          <div className="rise-in flex items-center gap-2">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={`chip px-4 py-2 text-[13px] ${
                  category === c
                    ? "chip-active"
                    : "border border-[#e2e7ee] bg-surface text-text-2"
                }`}
              >
                {c}
              </button>
            ))}
            <div className="flex-1" />
            <span className="self-center text-[13px] text-text-3">
              최신순 ▾
            </span>
          </div>

          {posts.map((p, i) => (
            <article
              key={p.title}
              className={`card card-hover rise-in-${i + 1} flex flex-col gap-2.5 rounded-[18px] px-6 py-5`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`rounded-md px-2 py-[3px] text-[11px] font-bold ${BADGE_STYLE[p.category]}`}
                >
                  {p.badge}
                </span>
                <span className="text-xs text-text-3">{p.meta}</span>
              </div>
              <h2 className="text-base font-bold text-ink">{p.title}</h2>
              {p.body && (
                <p className="text-sm leading-[1.55] text-text-2">{p.body}</p>
              )}
              <div className="flex gap-4 text-xs text-text-3">
                {p.stats.map((s) => (
                  <span key={s}>{s}</span>
                ))}
              </div>
            </article>
          ))}
        </div>

        {/* ---------- 사이드바 ---------- */}
        <aside className="flex flex-col gap-4">
          <div className="rise-in-2 card flex flex-col gap-3 rounded-[18px] p-5">
            <div className="text-sm font-extrabold text-ink">내 관심 지역</div>
            <div className="flex flex-wrap gap-2">
              {MY_REGIONS.map((r) => (
                <span
                  key={r}
                  className="chip-soft rounded-full px-3 py-1.5 text-xs"
                >
                  {r}
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
            {WEEK_GROUPS.map((g) => (
              <Link
                key={g.title}
                href="/town/groups"
                className="rounded-xl bg-bg px-3.5 py-3 transition-colors hover:bg-[#eef2f8]"
              >
                <div className="text-[13px] font-bold text-ink">{g.title}</div>
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
      <button
        type="button"
        aria-label="글쓰기"
        className="btn-primary fixed bottom-28 right-[18px] z-40 flex h-[52px] w-[52px] items-center justify-center rounded-full text-[22px] md:hidden"
        style={{ boxShadow: "0 10px 24px rgba(29,79,216,.45)" }}
      >
        ✎
      </button>
    </PageShell>
  );
}
