"use client";

/**
 * S22 — 쿠키 동의 배너.
 *
 * 결정 전에만 표시되고, "필수만 허용"이 시각적으로 동등한 선택지다
 * (다크 패턴 금지 — 거절 버튼을 흐리게 만들지 않는다). 분석 쿠키는
 * 동의한 경우에만 GA4 로더(components/ga4-gtag-loader.tsx)가 싣는다.
 */
import Link from "next/link";
import { useCookieConsent } from "./use-cookie-consent";

export function CookieConsentBanner() {
  const { state, decide } = useCookieConsent();
  if (state.status !== "undecided") return null;

  return (
    <div
      role="region"
      aria-label="쿠키 사용 동의"
      /* 제안 웹1(2026-08-03): 데스크탑에서 중앙 하단 배치가 모든 화면의 본문·CTA
         를 가렸다(캡처 6장 전부). md+ 는 우하단 코너 카드로 내리고, 모바일은
         탭바 위 중앙 유지. */
      /* 모바일6 — 결정 전에는 탭바가 접히므로(TabBar 조기 반환) 88px 띄울
         이유가 없다. 탭바 자리(bottom 16px)로 내려 하단이 한 층이 된다.
         md+ 는 탭바가 없어 원래도 무관 — 코너 카드 유지. */
      className="fixed inset-x-0 z-[70] px-4 md:inset-x-auto md:right-5 md:px-0"
      style={{ bottom: "max(16px, env(safe-area-inset-bottom, 0px))" }}
    >
      {/* 모바일 실측(2026-08-02): 글래스 60% 불투명이라 밑 본문 글자가 배너 문구와
          겹쳐 읽혔고, 패딩까지 더해 화면 하단 1/3 을 차지했다. 동의는 법적 행위의
          UI 다 — 배경을 사실상 불투명(94%)으로 올리고 여백을 줄인다. */}
      <div className="mx-auto flex max-w-[560px] flex-col gap-2 rounded-2xl border border-line bg-[rgba(255,255,255,.94)] p-3.5 shadow-[0_12px_32px_rgba(15,23,42,.18)] backdrop-blur-md md:max-w-[360px]">
        <p className="text-[12px] leading-[1.55] text-text-1">
          누구집은 서비스 운영에 필요한 필수 쿠키를 사용해요. 이용 통계 분석 쿠키는{" "}
          <b>동의하신 경우에만</b> 사용합니다.{" "}
          <Link href="/legal/privacy" className="font-bold text-primary underline">
            개인정보처리방침
          </Link>
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => decide(false)}
            className="flex-1 rounded-[10px] border border-line bg-surface px-3 py-2 text-[12px] font-bold text-text-1"
          >
            필수만 허용
          </button>
          <button
            type="button"
            onClick={() => decide(true)}
            className="btn-primary flex-1 rounded-[10px] px-3 py-2 text-[12px]"
          >
            모두 허용
          </button>
        </div>
      </div>
    </div>
  );
}
