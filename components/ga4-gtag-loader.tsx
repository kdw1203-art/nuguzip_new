"use client";

/**
 * S22 — GA4 로더 (동의 게이트).
 *
 * 동작 조건 두 가지가 모두 참일 때만 gtag 를 싣는다:
 *   1) NEXT_PUBLIC_GA4_ID 설정 (예: G-XXXXXXX) — 없으면 아무것도 안 함
 *   2) 쿠키 동의 배너에서 "모두 허용" 선택 (useCookieConsent)
 * 동의 전·거절 시에는 스크립트 로드 자체가 없다 — 로드해 놓고 이벤트만
 * 안 보내는 방식이 아니라, 요청 한 번도 나가지 않는 방식이다.
 *
 * G24 — AI 검색 유입(chatgpt.com·perplexity.ai 등)은 GA4 리퍼러 리포트에서
 * 세그먼트로 분리해 본다(코드 아님, 콘솔 설정).
 */
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useCookieConsent } from "./consent/use-cookie-consent";

const GA4_ID = process.env.NEXT_PUBLIC_GA4_ID?.trim() || "";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

export function Ga4GtagLoader() {
  const { state } = useCookieConsent();
  const pathname = usePathname();
  const enabled = GA4_ID !== "" && state.status === "decided" && state.consent.analytics;

  // 최초 로드 (동의 시 1회)
  useEffect(() => {
    if (!enabled || window.gtag) return;
    window.dataLayer = window.dataLayer ?? [];
    window.gtag = function gtag(...args: unknown[]) {
      window.dataLayer?.push(args);
    };
    window.gtag("js", new Date());
    // SPA 라우팅이라 page_view 는 아래 pathname effect 에서 수동 전송
    window.gtag("config", GA4_ID, { send_page_view: false, anonymize_ip: true });
    const s = document.createElement("script");
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA4_ID)}`;
    document.head.appendChild(s);
  }, [enabled]);

  // 라우트 변경마다 page_view
  useEffect(() => {
    if (!enabled || !window.gtag || !pathname) return;
    window.gtag("event", "page_view", {
      page_path: pathname,
      page_location: window.location.href,
    });
  }, [enabled, pathname]);

  return null;
}
