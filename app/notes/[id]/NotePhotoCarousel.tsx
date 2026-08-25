"use client";

/* 현장 사진 캐러셀 — 이전에는 110×78 썸네일을 가로로 늘어놓기만 해서
   차트가 섞인 사진은 사실상 읽을 수 없었다. 큰 무대 + 좌우 클릭 전환 +
   전체화면으로 바꾼다.

   설계 근거 (실측):
   · 썸네일 10장을 가로로 붙이면 min-content 가 1172px 이 된다. 부모 그리드의
     `1fr` 은 `minmax(auto, 1fr)` 이라 그 폭 아래로 안 줄고, 400px 사이드바가
     통째로 컨테이너 밖(문서 scrollWidth 1690 vs 뷰포트 1296)으로 밀려났다.
     그래서 이 컴포넌트의 뿌리에 min-w-0 / w-full 을 박아 두고, 부모 그리드는
     minmax(0,1fr) 로 고친다. 둘 중 하나만 고치면 다시 밀린다.
   · 사진 대부분이 차트라 object-cover 로 자르면 숫자가 잘린다 → object-contain.
   · 로드 실패와 "사진 없음" 을 같은 회색 박스로 보여 주지 않는다. 실패는
     실패라고 적는다.
*/

import { useCallback, useEffect, useRef, useState } from "react";

type Props = {
  photos: string[];
  /** 스크린리더용 이름 (예: "현장 사진") */
  label?: string;
};

export function NotePhotoCarousel({ photos, label = "현장 사진" }: Props) {
  const total = photos.length;
  const [idx, setIdx] = useState(0);
  const [zoom, setZoom] = useState(false);
  const [failed, setFailed] = useState<Record<number, boolean>>({});
  const stageRef = useRef<HTMLDivElement | null>(null);
  const railRef = useRef<HTMLDivElement | null>(null);
  const touchX = useRef<number | null>(null);

  const go = useCallback(
    (delta: number) => {
      if (total < 1) return;
      setIdx((i) => (i + delta + total) % total);
    },
    [total],
  );

  // 활성 썸네일이 레일 밖으로 나가면 따라 스크롤시킨다. 안 그러면 5장째부터
  // "지금 몇 번째인지" 를 볼 수 없다.
  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const el = rail.querySelector<HTMLElement>(`[data-thumb="${idx}"]`);
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [idx]);

  // 전체화면일 때만 문서 전역 키를 잡는다. 평소엔 무대에 포커스가 있을 때만.
  useEffect(() => {
    if (!zoom) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setZoom(false);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "ArrowRight") go(1);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [zoom, go]);

  // 인접 사진 프리로드 — 넘길 때마다 원본을 그때 받기 시작하면 큰 차트
  // 이미지에서 빈 무대가 눈에 띈다. 다음·이전 한 장씩만 미리 받는다.
  useEffect(() => {
    if (total < 2) return;
    for (const i of [(idx + 1) % total, (idx - 1 + total) % total]) {
      const img = new Image();
      img.src = photos[i];
    }
  }, [idx, total, photos]);

  if (total === 0) return null;

  const src = photos[idx];
  const isFailed = failed[idx];

  const markFailed = (i: number) =>
    setFailed((f) => (f[i] ? f : { ...f, [i]: true }));

  const stageKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      go(-1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      go(1);
    }
  };

  return (
    <div className="flex w-full min-w-0 flex-col gap-2">
      {/* ── 무대 ─────────────────────────────────────────────── */}
      <div
        ref={stageRef}
        role="group"
        aria-roledescription="캐러셀"
        aria-label={`${label} ${total}장`}
        tabIndex={0}
        onKeyDown={stageKey}
        onTouchStart={(e) => {
          touchX.current = e.touches[0]?.clientX ?? null;
        }}
        onTouchEnd={(e) => {
          const start = touchX.current;
          touchX.current = null;
          const end = e.changedTouches[0]?.clientX;
          if (start == null || end == null) return;
          const dx = end - start;
          if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
        }}
        className="relative w-full min-w-0 overflow-hidden rounded-[14px] border border-line bg-[#0e1420] outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <div className="flex h-[248px] w-full items-center justify-center sm:h-[340px] lg:h-[400px]">
          {isFailed ? (
            <div className="flex flex-col items-center gap-1 px-6 text-center">
              <span className="t-body font-extrabold text-white/85">
                사진을 불러오지 못했어요
              </span>
              <span className="t-sub text-white/55">
                {idx + 1}번째 사진 · 원본 주소에 접근하지 못했습니다
              </span>
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={src}
              src={src}
              alt={`${label} ${idx + 1} / ${total}`}
              // 첫 장은 바로 보여야 하므로 lazy 를 걸지 않는다.
              loading={idx === 0 ? "eager" : "lazy"}
              decoding="async"
              onError={() => markFailed(idx)}
              className="max-h-full max-w-full object-contain"
            />
          )}
        </div>

        {total > 1 && (
          <>
            {/* 좌·우 절반 클릭으로 넘긴다 — 화살표를 정확히 누르지 않아도 된다.
                버튼 위에 겹치지 않도록 화살표를 뒤에 더 높은 z 로 올린다. */}
            <button
              type="button"
              aria-label="이전 사진"
              onClick={() => go(-1)}
              className="absolute inset-y-0 left-0 w-[38%] cursor-pointer bg-transparent"
            />
            <button
              type="button"
              aria-label="다음 사진"
              onClick={() => go(1)}
              className="absolute inset-y-0 right-0 w-[38%] cursor-pointer bg-transparent"
            />

            <span
              aria-hidden
              onClick={() => go(-1)}
              className="absolute left-2 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-black/45 t-section leading-none text-white backdrop-blur-sm transition hover:bg-black/70"
            >
              ‹
            </span>
            <span
              aria-hidden
              onClick={() => go(1)}
              className="absolute right-2 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-black/45 t-section leading-none text-white backdrop-blur-sm transition hover:bg-black/70"
            >
              ›
            </span>
          </>
        )}

        {/* 매수 표시 — 몇 장 중 몇 번째인지 숨기지 않는다.
            aria-live: 스크린리더도 장 전환을 들을 수 있게 (조용한 상태 변경 금지) */}
        <span
          aria-live="polite"
          className="pointer-events-none absolute bottom-2 right-2 z-10 rounded-full bg-black/55 px-2.5 py-1 t-sub font-extrabold text-white"
        >
          {idx + 1} / {total}
        </span>

        {!isFailed && (
          <button
            type="button"
            onClick={() => setZoom(true)}
            aria-label="사진 전체화면으로 보기"
            className="absolute right-2 top-2 z-10 rounded-full bg-black/55 px-2.5 py-1 t-sub font-extrabold text-white backdrop-blur-sm transition hover:bg-black/75"
          >
            크게 보기
          </button>
        )}
      </div>

      {/* ── 썸네일 레일 ──────────────────────────────────────── */}
      {total > 1 && (
        <div
          ref={railRef}
          className="flex w-full min-w-0 gap-1.5 overflow-x-auto pb-1"
        >
          {photos.map((p, i) => (
            <button
              key={`${p}-${i}`}
              type="button"
              data-thumb={i}
              onClick={() => setIdx(i)}
              aria-label={`${i + 1}번째 사진 보기`}
              aria-current={i === idx ? "true" : undefined}
              className={`h-[52px] w-[74px] shrink-0 overflow-hidden rounded-lg border-2 bg-bg transition ${
                i === idx
                  ? "border-primary opacity-100"
                  : "border-transparent opacity-60 hover:opacity-100"
              }`}
            >
              {failed[i] ? (
                <span className="flex h-full w-full items-center justify-center bg-bg t-caption font-bold text-text-3">
                  실패
                </span>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  onError={() => markFailed(i)}
                  className="h-full w-full object-cover"
                />
              )}
            </button>
          ))}
        </div>
      )}

      {/* ── 전체화면 ─────────────────────────────────────────── */}
      {zoom && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${label} 전체화면`}
          className="fixed inset-0 z-[120] flex flex-col bg-black/92"
          onClick={() => setZoom(false)}
        >
          <div className="flex items-center justify-between px-4 py-3 text-white">
            <span className="t-body font-extrabold">
              {label} {idx + 1} / {total}
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setZoom(false);
              }}
              className="rounded-full bg-white/15 px-3 py-1.5 t-sub font-extrabold text-white hover:bg-white/25"
            >
              닫기 (Esc)
            </button>
          </div>
          <div
            className="relative flex flex-1 items-center justify-center px-2 pb-4"
            onClick={(e) => e.stopPropagation()}
          >
            {isFailed ? (
              <span className="t-body text-white/80">
                사진을 불러오지 못했어요
              </span>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={src}
                alt={`${label} ${idx + 1} / ${total}`}
                decoding="async"
                onError={() => markFailed(idx)}
                className="max-h-full max-w-full object-contain"
              />
            )}
            {total > 1 && (
              <>
                <button
                  type="button"
                  aria-label="이전 사진"
                  onClick={() => go(-1)}
                  className="absolute left-3 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 t-title text-white hover:bg-white/30"
                >
                  ‹
                </button>
                <button
                  type="button"
                  aria-label="다음 사진"
                  onClick={() => go(1)}
                  className="absolute right-3 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 t-title text-white hover:bg-white/30"
                >
                  ›
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default NotePhotoCarousel;
