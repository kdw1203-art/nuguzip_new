"use client";

/**
 * 임장노트 카드 덱 뷰어.
 *
 * 화면 형식은 인스타그램·오늘의집 카드처럼 4:5 비율의 세로 카드를 옆으로 넘기는
 * 방식이다. 넘김은 CSS scroll-snap 이 담당한다 — 캐러셀 라이브러리를 얹지 않는
 * 이유는 (1) 스크롤 자체가 이미 접근성·터치·관성 스크롤을 다 갖추고 있고,
 * (2) JS 가 죽어도 카드가 그대로 읽히기 때문이다.
 *
 * 본문은 서버에서 만든 `NoteDeck` 을 그대로 그린다. 이 파일은 문장을 만들지
 * 않는다. 카드 하단의 출처 각주(`page.source`)도 서버가 정한 값을 그대로 쓴다 —
 * "이 문장이 내가 쓴 것인지 AI 가 쓴 것인지"를 카드마다 알 수 있어야 한다.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { CoverImage } from "@/app/components/CoverImage";
import type { DeckPage, DeckTheme, NoteDeck } from "@/lib/inspection/note-deck";

/** 카드 배경·글자색 프리셋. 대비는 globals.css 토큰 규칙(본문 4.5:1)을 따른다. */
const THEME: Record<DeckTheme, { card: string; eyebrow: string; title: string; body: string }> = {
  cover: {
    card: "bg-ink text-surface",
    eyebrow: "text-white/70",
    title: "text-white",
    body: "text-white/85",
  },
  ink: {
    card: "bg-ink text-surface",
    eyebrow: "text-white/70",
    title: "text-white",
    body: "text-white/85",
  },
  tint: {
    card: "bg-primary-soft",
    eyebrow: "text-primary",
    title: "text-ink",
    body: "text-text-1",
  },
  light: {
    card: "bg-surface",
    eyebrow: "text-primary",
    title: "text-ink",
    body: "text-text-1",
  },
  photo: {
    card: "bg-ink text-surface",
    eyebrow: "text-white/80",
    title: "text-white",
    body: "text-white/85",
  },
};

function ScoreBars({ scores, dark }: { scores: DeckPage["scores"]; dark: boolean }) {
  return (
    <div className="flex w-full flex-col gap-2.5">
      {scores.map((s) => (
        <div key={s.label} className="flex items-center gap-2.5">
          <span
            className={`w-[52px] shrink-0 text-[12px] font-bold ${dark ? "text-white/85" : "text-text-2"}`}
          >
            {s.label}
          </span>
          <span
            className={`h-2 flex-1 overflow-hidden rounded-full ${dark ? "bg-white/20" : "bg-white"}`}
          >
            <span
              className={`block h-full rounded-full ${dark ? "bg-white" : "bg-primary"}`}
              style={{ width: `${Math.round((s.value / s.max) * 100)}%` }}
            />
          </span>
          <span
            className={`w-[34px] shrink-0 text-right text-[12px] font-extrabold tabular-nums ${
              dark ? "text-white" : "text-ink"
            }`}
          >
            {s.value}/{s.max}
          </span>
        </div>
      ))}
    </div>
  );
}

function DeckCard({ page, index, total }: { page: DeckPage; index: number; total: number }) {
  const t = THEME[page.theme];
  const dark = page.theme === "ink" || page.theme === "cover" || page.theme === "photo";
  const full = page.kind === "cover" || page.kind === "photo";

  return (
    <li
      className="relative w-[min(84vw,400px)] shrink-0 snap-center md:w-[400px]"
      aria-label={`${index + 1} / ${total}`}
    >
      <div
        className={`relative flex aspect-[4/5] flex-col overflow-hidden rounded-[24px] border border-border shadow-sm ${t.card}`}
      >
        {/* 배경 사진 — 표지·사진 카드만 전면 사용 */}
        {full && page.photo && (
          <span className="absolute inset-0">
            <CoverImage
              src={page.photo}
              alt=""
              imgClassName="absolute inset-0 h-full w-full object-cover"
            />
            <span
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "linear-gradient(180deg, rgba(0,0,0,.45) 0%, rgba(0,0,0,.15) 42%, rgba(0,0,0,.72) 100%)",
              }}
            />
          </span>
        )}

        <div className="relative flex h-full flex-col p-6">
          <div
            className={`flex min-h-0 flex-1 flex-col gap-3 ${
              full || page.kind === "closing" ? "justify-end" : "justify-center"
            }`}
          >
          {page.eyebrow && (
            <p className={`text-[11.5px] font-extrabold tracking-wide ${t.eyebrow}`}>
              {page.eyebrow}
            </p>
          )}

          {page.title && (
            <h2
              className={`text-[19px] font-extrabold leading-[1.35] ${t.title} ${
                page.kind === "cover" ? "text-[23px]" : ""
              }`}
            >
              {page.title}
            </h2>
          )}

          {page.body.length > 0 && (
            <div className={`flex flex-col gap-2 text-[13.5px] leading-relaxed ${t.body}`}>
              {page.body.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          )}

          {page.bullets.length > 0 && (
            <ul className={`flex flex-col gap-2 text-[13.5px] leading-relaxed ${t.body}`}>
              {page.bullets.map((b, i) => (
                <li key={i} className="flex gap-2">
                  <span aria-hidden className={dark ? "text-white/60" : "text-primary"}>
                    •
                  </span>
                  <span className="min-w-0">{b}</span>
                </li>
              ))}
            </ul>
          )}

          {page.scores.length > 0 && <ScoreBars scores={page.scores} dark={dark} />}

          {page.checks.length > 0 && (
            <ul className="flex flex-col gap-1.5 t-body">
              {page.checks.map((c, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span
                    aria-hidden
                    className={`mt-px shrink-0 font-extrabold ${
                      c.done ? "text-success" : dark ? "text-white/40" : "text-text-3"
                    }`}
                  >
                    {c.done ? "✓" : "○"}
                  </span>
                  <span className={c.done ? t.body : dark ? "text-white/55" : "text-text-3"}>
                    {c.label}
                  </span>
                  <span className="sr-only">{c.done ? "확인함" : "미확인"}</span>
                </li>
              ))}
            </ul>
          )}

          {page.chips.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {page.chips.map((c) => (
                <span
                  key={c}
                  className={`rounded-full px-2.5 py-1 text-[12px] font-bold ${
                    dark ? "bg-white/15 text-white" : "bg-white text-primary"
                  }`}
                >
                  {page.kind === "keywords" ? `#${c}` : c}
                </span>
              ))}
            </div>
          )}

          </div>

          <div className="flex items-center justify-between pt-3">
            <span className={`text-[11px] font-bold ${dark ? "text-white/60" : "text-text-3"}`}>
              출처 · {page.source}
            </span>
            <span
              className={`text-[11px] font-extrabold tabular-nums ${
                dark ? "text-white/60" : "text-text-3"
              }`}
            >
              {index + 1}/{total}
            </span>
          </div>
        </div>
      </div>
    </li>
  );
}

export function DeckViewer({ deck }: { deck: NoteDeck }) {
  const railRef = useRef<HTMLUListElement | null>(null);
  const [active, setActive] = useState(0);
  const total = deck.pages.length;

  /** 현재 보이는 카드 계산 — 스크롤 위치로만 판단한다(라이브러리 없음). */
  const onScroll = useCallback(() => {
    const el = railRef.current;
    if (!el) return;
    const child = el.children[0] as HTMLElement | undefined;
    if (!child) return;
    const step = child.getBoundingClientRect().width + 16;
    const i = Math.round(el.scrollLeft / step);
    setActive(Math.max(0, Math.min(total - 1, i)));
  }, [total]);

  const goTo = useCallback((i: number) => {
    const el = railRef.current;
    if (!el) return;
    const child = el.children[i] as HTMLElement | undefined;
    if (!child) return;
    el.scrollTo({ left: child.offsetLeft - el.offsetLeft, behavior: "smooth" });
  }, []);

  useEffect(() => {
    const el = railRef.current;
    if (!el) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight") goTo(Math.min(total - 1, active + 1));
      if (e.key === "ArrowLeft") goTo(Math.max(0, active - 1));
    }
    el.addEventListener("keydown", onKey);
    return () => el.removeEventListener("keydown", onKey);
  }, [active, goTo, total]);

  return (
    <div className="flex flex-col gap-4">
      <ul
        ref={railRef}
        onScroll={onScroll}
        tabIndex={0}
        aria-label={`카드 ${total}장 — 좌우로 넘겨 보세요`}
        className="-mx-5 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-1 outline-none [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {deck.pages.map((p, i) => (
          <DeckCard key={p.id} page={p} index={i} total={total} />
        ))}
      </ul>

      <div className="flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => goTo(Math.max(0, active - 1))}
          disabled={active === 0}
          aria-label="이전 카드"
          className="press flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface t-section text-text-1 disabled:opacity-35"
        >
          ‹
        </button>

        {/* 장수가 많으면 점을 20개 넘게 찍는 대신 진행 막대로 바꾼다 —
            점이 배경(--bg)과 구분되지 않을 만큼 작고 촘촘해지면 표시가 아니라 잡음이다. */}
        {total <= 10 ? (
          <div className="flex items-center justify-center gap-1.5">
            {deck.pages.map((p, i) => (
              <button
                key={p.id}
                type="button"
                onClick={() => goTo(i)}
                aria-label={`${i + 1}번째 카드로 이동`}
                aria-current={i === active ? "true" : undefined}
                className={`h-2 rounded-full transition-all ${
                  i === active ? "w-5 bg-primary" : "w-2 bg-text-3/45"
                }`}
              />
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden
              className="block h-1.5 w-[140px] overflow-hidden rounded-full bg-text-3/25"
            >
              <span
                className="block h-full rounded-full bg-primary transition-all"
                style={{ width: `${Math.round(((active + 1) / total) * 100)}%` }}
              />
            </span>
            <span className="t-sub font-extrabold tabular-nums text-text-2">
              {active + 1} / {total}
            </span>
          </div>
        )}

        <button
          type="button"
          onClick={() => goTo(Math.min(total - 1, active + 1))}
          disabled={active === total - 1}
          aria-label="다음 카드"
          className="press flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface t-section text-text-1 disabled:opacity-35"
        >
          ›
        </button>
      </div>
    </div>
  );
}
