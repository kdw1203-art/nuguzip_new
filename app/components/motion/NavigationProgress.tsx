"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 상단 이동 진행바.
 *
 * 링크를 누른 뒤 새 화면이 그려지기까지는 데이터 조회만큼의 공백이 있다.
 * 그 구간이 완전히 비어 있으면 사용자는 눌린 줄 모르고 같은 링크를 또 누른다
 * (그리고 두 번째 클릭은 첫 번째 이동을 취소한다). 여기서는 그 공백에
 * 브랜드 그라데이션 막대를 한 줄 띄운다.
 *
 * ── 완료 판정을 왜 `useSearchParams` 로 하지 않는가 ─────────────────────
 * 그게 가장 정확하지만, 클라이언트에서 `useSearchParams()` 를 부르면 그 트리는
 * 정적 렌더에서 빠진다. 이 컴포넌트는 루트 레이아웃에 있으므로 그 대가가
 * 사이트 전체에 붙는다(이 저장소는 ISR·프리렌더 예산을 게이트로 지키고 있다).
 * 그래서 훅 대신 `location.href` 를 짧은 주기로 비교한다 — App Router 는
 * 이동이 커밋된 뒤에 주소를 바꾸므로, 주소가 바뀌었다는 것은 새 화면이
 * 붙었다는 뜻이다.
 *
 * 안전장치: 어떤 이유로든 주소가 끝내 안 바뀌면(같은 주소로의 이동, 서버 오류,
 * 사용자가 중간에 멈춤) 막대가 영원히 남는 편이 최악이다. 상한 시간을 두고
 * 무조건 걷는다.
 */

/** 주소 변화를 확인하는 주기 */
const POLL_MS = 90;
/** 이 시간이 지나면 결과와 무관하게 막대를 걷는다 */
const MAX_MS = 6000;
/** 완료 표시 후 실제로 제거하기까지 (사라지는 트랜지션 시간) */
const FADE_MS = 260;

export function NavigationProgress() {
  /* run 이 0 이면 아무것도 그리지 않는다. 값이 바뀔 때마다 key 가 바뀌면서
     CSS 애니메이션이 처음부터 다시 재생된다. */
  const [run, setRun] = useState(0);
  const [done, setDone] = useState(false);
  const timers = useRef<number[]>([]);

  const clearTimers = useCallback(() => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
  }, []);

  const start = useCallback(() => {
    clearTimers();
    setDone(false);
    setRun((n) => n + 1);

    const from = window.location.href;
    const startedAt = Date.now();
    let poll = 0;

    const finish = () => {
      window.clearInterval(poll);
      setDone(true);
      timers.current.push(
        window.setTimeout(() => {
          setRun(0);
          setDone(false);
        }, FADE_MS),
      );
    };

    poll = window.setInterval(() => {
      if (window.location.href !== from || Date.now() - startedAt > MAX_MS) {
        finish();
      }
    }, POLL_MS);

    timers.current.push(
      window.setTimeout(() => window.clearInterval(poll), MAX_MS + POLL_MS),
    );
  }, [clearTimers]);

  useEffect(() => {
    /* 캡처 단계에서 듣는다. 앱 코드가 preventDefault 를 하기 **전**에
       봐야 실제로 이동이 일어날 클릭인지 판단할 수 있다. */
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented) return;
      if (e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      const target = e.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a");
      if (!(anchor instanceof HTMLAnchorElement)) return;

      const href = anchor.getAttribute("href");
      if (!href) return;
      /* 같은 문서 안 앵커·메일·전화·다운로드·새 탭은 이동이 아니다 */
      if (href.startsWith("#")) return;
      if (anchor.hasAttribute("download")) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.dataset.noProgress === "true") return;
      if (anchor.origin !== window.location.origin) return;
      if (
        anchor.pathname === window.location.pathname &&
        anchor.search === window.location.search
      ) {
        return;
      }
      start();
    };

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [start]);

  useEffect(() => clearTimers, [clearTimers]);

  if (run === 0) return null;

  return (
    <div
      key={run}
      className="nav-progress"
      data-done={done ? "true" : "false"}
      aria-hidden="true"
    >
      <div className="nav-progress-bar" />
    </div>
  );
}

export default NavigationProgress;
