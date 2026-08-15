"use client";

import type { CardTheme } from "@/lib/notes/card-themes";
import type { FrameContent } from "@/lib/notes/card-frames";

/**
 * 카드 한 장(프레임) HTML 렌더 — 테마 색을 인라인 스타일로 그린다(테마 hex 는
 * 동적이라 Tailwind 클래스로 못 박는다). satori 이미지가 아니라 화면·미리보기용.
 * 세로 4:5 비율. 모든 장이 같은 테마 배경을 공유해 캐러셀이 한 벌로 읽힌다.
 */

const TONE_DOT: Record<"good" | "mid" | "bad", string> = {
  good: "#22c55e",
  mid: "#eab308",
  bad: "#ef4444",
};

export function CardFrameView({
  content,
  theme,
  index,
  total,
}: {
  content: FrameContent;
  theme: CardTheme;
  index?: number;
  total?: number;
}) {
  return (
    <div
      className="relative flex aspect-[4/5] w-full flex-col justify-between overflow-hidden rounded-[20px] p-6"
      style={{ background: theme.bg, color: theme.ink }}
    >
      {/* 상단 브랜드 표식 + 페이지 인디케이터 */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-extrabold tracking-tight" style={{ color: theme.accent }}>
          누구집 임장노트
        </span>
        {typeof index === "number" && typeof total === "number" && (
          <span className="text-[10px] font-bold" style={{ color: theme.sub }}>
            {index + 1} / {total}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col justify-center py-3">
        <FrameBody content={content} theme={theme} />
      </div>

      {/* 마무리 장이 아니면 하단에 얇은 브랜드 라인 */}
      {content.kind !== "cta" && (
        <div className="text-[10px] font-semibold" style={{ color: theme.sub }}>
          nuguzip.com
        </div>
      )}
    </div>
  );
}

function FrameBody({ content, theme }: { content: FrameContent; theme: CardTheme }) {
  switch (content.kind) {
    case "cover":
      return (
        <div className="flex flex-col gap-2">
          {content.region && (
            <span className="text-[12px] font-bold" style={{ color: theme.sub }}>
              {content.region}
              {content.visit ? ` · ${content.visit}` : ""}
            </span>
          )}
          <span className="text-[26px] font-extrabold leading-tight" style={{ color: theme.ink }}>
            {content.apt}
          </span>
          {content.verdict && (
            <span className="mt-1 text-[14px] font-semibold leading-snug" style={{ color: theme.accent }}>
              “{content.verdict}”
            </span>
          )}
        </div>
      );

    case "scoreRing":
      return (
        <div className="flex flex-col items-center gap-2">
          <div
            className="flex h-[128px] w-[128px] flex-col items-center justify-center rounded-full"
            style={{ border: `8px solid ${theme.accent}`, background: theme.panel }}
          >
            <span className="text-[44px] font-extrabold leading-none" style={{ color: theme.accent }}>
              {content.score}
            </span>
            <span className="text-[11px] font-bold" style={{ color: theme.sub }}>
              / 100
            </span>
          </div>
          <span className="text-[15px] font-extrabold" style={{ color: theme.ink }}>
            {content.grade}
          </span>
        </div>
      );

    case "scoreBars":
      return (
        <div className="flex flex-col gap-2.5">
          <span className="mb-1 text-[13px] font-extrabold" style={{ color: theme.ink }}>
            항목별 점수
          </span>
          {content.bars.map((b) => (
            <div key={b.label} className="flex items-center gap-2">
              <span className="w-14 shrink-0 text-[12px] font-bold" style={{ color: theme.sub }}>
                {b.label}
              </span>
              <div className="h-2.5 flex-1 overflow-hidden rounded-full" style={{ background: theme.panel }}>
                <div
                  className="h-full rounded-full"
                  style={{ width: `${Math.max(4, Math.min(100, b.value))}%`, background: theme.accent }}
                />
              </div>
              <span className="w-7 shrink-0 text-right text-[12px] font-extrabold" style={{ color: theme.ink }}>
                {b.value}
              </span>
            </div>
          ))}
        </div>
      );

    case "summary":
      return (
        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-extrabold" style={{ color: theme.accent }}>
            {content.heading}
          </span>
          <span className="text-[18px] font-bold leading-relaxed" style={{ color: theme.ink }}>
            {content.body}
          </span>
        </div>
      );

    case "checklist":
      return (
        <div className="flex flex-col gap-2">
          <span className="mb-1 text-[13px] font-extrabold" style={{ color: theme.ink }}>
            현장 체크
          </span>
          {content.items.map((it, i) => (
            <div key={i} className="flex items-start justify-between gap-2">
              <span className="flex min-w-0 items-start gap-2 text-[12.5px] font-semibold leading-snug" style={{ color: theme.ink }}>
                <span
                  className="mt-[5px] inline-block h-2 w-2 shrink-0 rounded-full"
                  style={{ background: it.rating ? TONE_DOT[it.tone] : theme.accent }}
                />
                <span className="min-w-0">{it.label}</span>
              </span>
              {it.rating && (
                <span className="shrink-0 text-[12px] font-bold" style={{ color: theme.sub }}>
                  {it.rating}
                </span>
              )}
            </div>
          ))}
        </div>
      );

    case "list":
      return (
        <div className="flex flex-col gap-2">
          <span
            className="text-[13px] font-extrabold"
            style={{ color: content.tone === "pos" ? theme.accent : "#f87171" }}
          >
            {content.heading}
          </span>
          <div className="flex flex-col gap-1.5">
            {content.items.map((it, i) => (
              <span key={i} className="text-[14px] font-semibold leading-snug" style={{ color: theme.ink }}>
                {content.tone === "pos" ? "▲ " : "▽ "}
                {it}
              </span>
            ))}
          </div>
        </div>
      );

    case "context":
      return (
        <div className="flex flex-col gap-3">
          {content.rows.map((r) => (
            <div key={r.label} className="flex flex-col gap-0.5">
              <span className="text-[11px] font-bold" style={{ color: theme.sub }}>
                {r.label}
              </span>
              <span className="text-[17px] font-extrabold" style={{ color: theme.ink }}>
                {r.value}
              </span>
            </div>
          ))}
        </div>
      );

    case "tags":
      return (
        <div className="flex flex-col gap-3">
          <span className="text-[13px] font-extrabold" style={{ color: theme.ink }}>
            {content.heading}
          </span>
          <div className="flex flex-wrap gap-2">
            {content.tags.map((t) => (
              <span
                key={t}
                className="rounded-full px-3 py-1.5 text-[13px] font-bold"
                style={{ background: theme.chipBg, color: theme.chipInk }}
              >
                #{t}
              </span>
            ))}
          </div>
        </div>
      );

    case "cta":
      return (
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="text-[19px] font-extrabold leading-snug" style={{ color: theme.ink }}>
            {content.heading}
          </span>
          <span
            className="rounded-full px-4 py-1.5 text-[13px] font-extrabold"
            style={{ background: theme.chipBg, color: theme.chipInk }}
          >
            {content.sub}
          </span>
        </div>
      );
  }
}
