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
        className="brand-photo-frame relative w-full min-w-0 overflow-hidden rounded-[14px] outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <div className="flex h-[248px] w-full items-center justify-center sm:h-[340px] lg:h-[400px]">
          {isFailed ? (
            <div className="flex flex-col items-center gap-1 px-6 text-center">
              <span className="t-body font-extrabold text-[var(--brand-hanji)]">
                사진을 불러오지 못했어요
              </span>
              <span className="t-sub text-[rgba(246,241,231,.6)]">
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
              className="brand-photo-chip absolute left-2 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full t-section leading-none backdrop-blur-sm transition"
            >
              ‹
            </span>
            <span
              aria-hidden
              onClick={() => go(1)}
              className="brand-photo-chip absolute right-2 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full t-section leading-none backdrop-blur-sm transition"
            >
              ›
            </span>
          </>
        )}

        {/* 매수 표시 — 몇 장 중 몇 번째인지 숨기지 않는다.
            aria-live: 스크린리더도 장 전환을 들을 수 있게 (조용한 상태 변경 금지) */}
        <span
          aria-live="polite"
          className="brand-photo-chip pointer-events-none absolute bottom-2 right-2 z-10 rounded-full px-2.5 py-1 t-sub font-extrabold"
        >
          {idx + 1} / {total}
        </span>

        {!isFailed && (
          <button
            type="button"
            onClick={() => setZoom(true)}
            aria-label="사진 전체화면으로 보기"
            className="brand-photo-chip absolute right-2 top-2 z-10 rounded-full px-2.5 py-1 t-sub font-extrabold backdrop-blur-sm transition"
          >
            <span className="njn-dot mr-1.5 inline-block h-[7px] w-[7px] align-middle" aria-hidden="true" />크게 보기
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
                  ? "border-[var(--brand-red)] opacity-100"
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

      {/* ── 크게 보기 팝업 ─────────────────────────────────────────
          [951] 예전엔 화면 전체를 검게 덮고 <img max-h-full> 을 넣었는데, 부모가
          flex-1 이면서 min-height:auto 라 이미지 원본 높이만큼 늘어나 세로가 긴
          차트 이미지는 위아래가 잘린 채 나갔다(소유자 캡처: "너무 크게 나와").
          이제 가운데 팝업 카드 안에 넣고, 이미지 최대 높이를 뷰포트 기준(dvh)으로
          못 박아 **한 화면에 전부** 들어오게 한다. 배경 클릭·Esc 로 닫힌다. */}
      {zoom && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${label} 크게 보기`}
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 p-3 sm:p-6"
          onClick={() => setZoom(false)}
        >
          <div
            className="brand-photo-frame flex max-h-[calc(100dvh-24px)] w-full max-w-[1100px] min-w-0 flex-col overflow-hidden rounded-2xl shadow-[0_24px_64px_rgba(11,37,69,.55)] sm:max-h-[calc(100dvh-48px)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between px-4 py-2.5 text-[var(--brand-hanji)]">
              <span className="t-body font-extrabold">
                <span className="njn-dot mr-2 inline-block h-[8px] w-[8px] align-middle" aria-hidden="true" />
                {label} {idx + 1} / {total}
              </span>
              <button
                type="button"
                onClick={() => setZoom(false)}
                className="brand-photo-chip rounded-full px-3 py-1.5 t-sub font-extrabold transition"
              >
                닫기 (Esc)
              </button>
            </div>
            <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 pb-3">
              {isFailed ? (
                <span className="t-body text-[var(--brand-hanji)]">
                  사진을 불러오지 못했어요
                </span>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={src}
                  alt={`${label} ${idx + 1} / ${total}`}
                  decoding="async"
                  onError={() => markFailed(idx)}
                  /* 높이 상한을 뷰포트로 직접 잰다 — 부모 max-h 만으로는 이미지가
                     min-height:auto 를 타고 원본 크기로 커진다(위 주석). */
                  className="max-h-[calc(100dvh-96px)] max-w-full rounded-lg object-contain sm:max-h-[calc(100dvh-120px)]"
                />
              )}
              {total > 1 && (
                <>
                  <button
                    type="button"
                    aria-label="이전 사진"
                    onClick={() => go(-1)}
                    className="brand-photo-chip absolute left-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full t-title transition"
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    aria-label="다음 사진"
                    onClick={() => go(1)}
                    className="brand-photo-chip absolute right-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full t-title transition"
                  >
                    ›
                  </button>
                </>
              )}
            </div>
            {/* 팝업 안 썸네일 — 닫지 않고 다음 장으로 건너뛴다 */}
            {total > 1 && (
              <div className="flex shrink-0 gap-1.5 overflow-x-auto px-3 pb-3">
                {photos.map((p, i) => (
                  <button
                    key={`z-${i}`}
                    type="button"
                    aria-label={`${i + 1}번째 사진 보기`}
                    aria-current={i === idx ? "true" : undefined}
                    onClick={() => setIdx(i)}
                    className={`h-[40px] w-[58px] shrink-0 overflow-hidden rounded-md border-2 bg-[rgba(246,241,231,.06)] ${
                      i === idx ? "border-[var(--brand-red-on-dark)]" : "border-transparent opacity-70 hover:opacity-100"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p} alt="" loading="lazy" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default NotePhotoCarousel;
