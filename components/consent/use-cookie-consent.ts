"use client";

/**
 * S22 — 쿠키 동의 상태 훅.
 *
 * 저장소: localStorage `nz_cookie_consent` = { analytics: boolean, decidedAt: ISO }.
 * 기본값은 "결정 안 함"이며, 결정 전에는 분석 스크립트를 싣지 않는다
 * (개인정보 보호 기본값 — 동의 없이는 GA4 로드 자체가 없다).
 * 서버 저장 없음: 동의 여부는 이 브라우저에만 남는 값이다.
 */
import { useCallback, useEffect, useState } from "react";

const KEY = "nz_cookie_consent";

export type CookieConsent = {
  analytics: boolean;
  decidedAt: string;
};

type ConsentState =
  | { status: "loading" }
  | { status: "undecided" }
  | { status: "decided"; consent: CookieConsent };

function readStored(): CookieConsent | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<CookieConsent>;
    if (typeof v.analytics !== "boolean") return null;
    return { analytics: v.analytics, decidedAt: String(v.decidedAt ?? "") };
  } catch {
    return null;
  }
}

export function useCookieConsent(): {
  state: ConsentState;
  decide: (analytics: boolean) => void;
} {
  const [state, setState] = useState<ConsentState>({ status: "loading" });

  useEffect(() => {
    const stored = readStored();
    setState(stored ? { status: "decided", consent: stored } : { status: "undecided" });
    // 다른 탭에서 결정하면 이 탭도 따라간다
    const onStorage = (e: StorageEvent) => {
      if (e.key !== KEY) return;
      const v = readStored();
      setState(v ? { status: "decided", consent: v } : { status: "undecided" });
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const decide = useCallback((analytics: boolean) => {
    const consent: CookieConsent = { analytics, decidedAt: new Date().toISOString() };
    try {
      localStorage.setItem(KEY, JSON.stringify(consent));
    } catch {
      /* 저장 실패해도 이번 세션 동안은 상태 유지 */
    }
    setState({ status: "decided", consent });
  }, []);

  return { state, decide };
}
