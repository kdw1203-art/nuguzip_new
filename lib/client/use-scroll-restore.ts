"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

const PREFIX = "scroll:";

/**
 * [966] 목록 → 상세 → 뒤로가기 때 스크롤 위치를 되돌린다.
 *
 * 브라우저 자체 복원은 popstate 순간에 도는데, 그때는 아직 이전 화면(상세)이
 * 그려져 있거나 목록이 짧아 원하는 높이까지 못 내려간다. 그래서 목록이 실제로
 * 그려진 뒤(ready) 우리가 한 번 더 내린다. 이 컴포넌트가 떠 있는 동안만
 * history.scrollRestoration 을 manual 로 두고, 내려가면 auto 로 되돌린다 —
 * 다른 화면의 복원까지 건드리지 않는다.
 *
 * 저장은 스크롤 이벤트마다 ref 에 받아 두고, pagehide·언마운트 때 sessionStorage
 * 에 쓴다. 언마운트 시점에 window.scrollY 를 읽지 않는 이유: 앱 라우터가 새 화면을
 * 붙이며 맨 위로 올린 **뒤에** 정리 함수가 돌 수 있어 0 이 저장된다.
 *
 * @param key   저장 키 — 경로 + 검색 문자열(useScrollRestoreKey 또는 직접 조립)
 * @param ready 첫 페이지 항목이 렌더된 뒤 true — 그 순간 한 번만 복원한다
 */
export function useScrollRestore(key: string, ready: boolean) {
  const lastY = useRef(0);
  const keyRef = useRef(key);
  keyRef.current = key;
  const restoredRef = useRef(false);

  /* 브라우저 복원은 떠 있는 동안만 끈다. 되돌릴 때 이전 값이 아니라 auto 로 고정 —
     피드에서 피드로 옮길 때 마운트·언마운트 순서에 따라 manual 이 눌러붙는 걸 막는다. */
  useEffect(() => {
    if (!("scrollRestoration" in window.history)) return;
    window.history.scrollRestoration = "manual";
    return () => {
      window.history.scrollRestoration = "auto";
    };
  }, []);

  useLayoutEffect(() => {
    const onScroll = () => {
      lastY.current = window.scrollY;
    };
    const persist = () => {
      const y = Math.round(lastY.current);
      try {
        if (y > 0) window.sessionStorage.setItem(PREFIX + keyRef.current, String(y));
        else window.sessionStorage.removeItem(PREFIX + keyRef.current);
      } catch {
        /* 저장소 차단(프라이빗 모드) — 복원만 못 할 뿐 */
      }
    };
    lastY.current = window.scrollY;
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pagehide", persist);
    /* 레이아웃 정리 단계는 DOM 이 떼어지기 전·새 화면이 올라오기 전이라 값이 살아 있다 */
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pagehide", persist);
      persist();
    };
  }, []);

  useEffect(() => {
    if (!ready || restoredRef.current) return;
    let saved = 0;
    try {
      saved = Number(window.sessionStorage.getItem(PREFIX + key) ?? 0);
    } catch {
      /* 저장소 차단 — 복원 없음 */
    }
    if (!Number.isFinite(saved) || saved <= 0) {
      restoredRef.current = true;
      return;
    }
    /* 두 프레임 — 첫 프레임은 커밋 직후라 이미지·폰트 폭이 아직 잡히기 전일 수 있다.
       키 삭제는 실제로 내린 뒤에 한다 — 그 전에 정리(개발 StrictMode 이중 실행·키 변경)
       되면 다음 실행이 다시 읽을 수 있어야 한다. */
    let done = false;
    let raf = window.requestAnimationFrame(() => {
      raf = window.requestAnimationFrame(() => {
        done = true;
        restoredRef.current = true;
        try {
          window.sessionStorage.removeItem(PREFIX + key);
        } catch {
          /* no-op */
        }
        window.scrollTo(0, saved);
        lastY.current = saved;
      });
    });
    return () => {
      if (!done) window.cancelAnimationFrame(raf);
    };
  }, [ready, key]);
}

/**
 * [966] 기본 키 — 경로 + 마운트 시점의 검색 문자열.
 * useSearchParams 를 안 쓰는 이유: 정적/ISR 페이지에서는 Suspense 경계가 없으면
 * 빌드가 막힌다. 여기서는 마운트 때 한 번 읽은 값이면 충분하다(뒤로가기로 돌아올 때
 * 새로 마운트되며 그때의 URL 을 다시 읽는다). 검색 문자열이 마운트 뒤에 바뀌는
 * 화면(/search)은 키를 직접 조립한다.
 */
export function useScrollRestoreKey(): string {
  const pathname = usePathname();
  const [search] = useState(() =>
    typeof window === "undefined" ? "" : window.location.search,
  );
  return `${pathname}${search}`;
}
