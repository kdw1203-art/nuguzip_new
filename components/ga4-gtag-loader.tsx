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
import {
  googleAdsId,
  purchaseConversionLabel,
  sendAdsConversion,
  signupConversionLabel,
} from "@/lib/analytics/google-ads";

/* 측정 ID — 2026-07-26 소유자 제공(G-XEJPECJM53). 측정 ID는 모든 방문자의
   페이지 HTML에 노출되도록 설계된 공개 값이라(시크릿 아님) 코드 기본값으로 둔다.
   교체가 필요하면 Vercel 환경변수 NEXT_PUBLIC_GA4_ID 가 이 값을 덮어쓴다.
   ※ 구글 안내문은 <head>에 무조건 삽입하라고 하지만, 우리는 의도적으로
   쿠키 동의를 거친 뒤에만 로드한다 — 동의 없이 로드하지 않는 것이 방침이다. */
const GA4_ID = process.env.NEXT_PUBLIC_GA4_ID?.trim() || "G-XEJPECJM53";

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
    /* 구글 광고 태그 — 같은 gtag 에 config 만 얹는다(리마케팅 모수 수집).
       NEXT_PUBLIC_GOOGLE_ADS_ID(AW-…) 미설정이면 무동작. 동의 게이트는 이
       로더 전체에 이미 걸려 있다 — 동의 없이는 이 줄까지 오지 않는다. */
    const awId = googleAdsId();
    if (awId) window.gtag("config", awId);
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

  /* 광고 전환 이벤트 — 페이지 컴포넌트를 건드리지 않고 URL 로 판정한다.
     (결제 성공·가입 완료 페이지는 다른 세션들이 활발히 고치는 파일이라
     여기 로더 한 곳에서 잡는 편이 충돌도 적고 누락도 없다.)

     /payment/success: 토스 successUrl 리다이렉트 쿼리(orderId·amount)를 그대로
     쓴다 — 광고 성과 집계용 표시 값이고, 실제 승인 금액 검증은 서버 confirm 이
     별도로 한다(여기 값으로 돈이 움직이지 않는다). transaction_id=orderId 라
     새로고침해도 구글 쪽에서 중복 전환으로 집계되지 않지만, 같은 세션의
     이벤트 재발사 자체도 sessionStorage 로 한 번 더 막는다. */
  useEffect(() => {
    if (!enabled || !window.gtag || !pathname) return;
    try {
      if (pathname === "/payment/success") {
        const sp = new URLSearchParams(window.location.search);
        const orderId = sp.get("orderId") ?? "";
        const amount = Number(sp.get("amount"));
        if (!orderId) return;
        const onceKey = `nz_conv_purchase_${orderId}`;
        if (sessionStorage.getItem(onceKey)) return;
        sessionStorage.setItem(onceKey, "1");
        window.gtag("event", "purchase", {
          transaction_id: orderId,
          ...(Number.isFinite(amount) && amount > 0
            ? { value: amount, currency: "KRW" }
            : {}),
        });
        sendAdsConversion(window.gtag, purchaseConversionLabel(), {
          ...(Number.isFinite(amount) && amount > 0 ? { value: amount } : {}),
          transactionId: orderId,
        });
      } else if (pathname === "/welcome") {
        const onceKey = "nz_conv_signup";
        if (sessionStorage.getItem(onceKey)) return;
        sessionStorage.setItem(onceKey, "1");
        window.gtag("event", "sign_up", { method: "site" });
        sendAdsConversion(window.gtag, signupConversionLabel(), {});
      }
    } catch {
      /* storage 접근 불가(프라이빗 모드 등) — 전환 집계는 광고 최적화용
         부가 신호라, 실패해도 화면 흐름에는 아무 영향을 주지 않는다. */
    }
  }, [enabled, pathname]);

  return null;
}
