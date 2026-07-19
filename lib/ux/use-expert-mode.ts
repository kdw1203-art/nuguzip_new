"use client";

/**
 * 전문가 모드 hook.
 * - localStorage 기반 (`woodong:expert-mode:v1`)
 * - SSR 안전 (window 가드 + try/catch)
 * - 같은 탭 내 다른 컴포넌트도 동기화되도록 custom event(`woodong:expert-mode`) 디스패치
 *
 * 기본값은 `false` — 즉 사용자에게는 쉬운 모드만 보임.
 */

import { useCallback, useEffect, useState } from "react";

const KEY = "woodong:expert-mode:v1";
const EVT = "woodong:expert-mode";

export function readExpertMode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function writeExpertMode(next: boolean): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, next ? "1" : "0");
    window.dispatchEvent(new Event(EVT));
  } catch {
    /* 권한 거부 등 */
  }
}

export function useExpertMode(): {
  enabled: boolean;
  set: (next: boolean) => void;
  toggle: () => void;
} {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    setEnabled(readExpertMode());
    const onChange = () => setEnabled(readExpertMode());
    window.addEventListener(EVT, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(EVT, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  const set = useCallback((next: boolean) => {
    setEnabled(next);
    writeExpertMode(next);
  }, []);

  const toggle = useCallback(() => {
    set(!readExpertMode());
  }, [set]);

  return { enabled, set, toggle };
}
