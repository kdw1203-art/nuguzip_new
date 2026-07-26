import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SwRegister } from "./components/SwRegister";
import { InstallPrompt } from "./components/InstallPrompt";
import { AdSenseLoader } from "./components/AdSenseLoader";
import { WebVitalsReporter } from "./components/WebVitalsReporter";
import { ThemeProvider } from "./components/ThemeProvider";
import { ToastProvider } from "./components/toast/ToastProvider";
import { SoftSignupProvider } from "./components/soft-signup/SoftSignupProvider";
import { ReferralRedeem } from "@/components/ReferralRedeem";
import { SiteJsonLd } from "./components/SiteJsonLd";
import { CookieConsentBanner } from "@/components/consent/cookie-consent-banner";
import { Ga4GtagLoader } from "@/components/ga4-gtag-loader";
import { ViewportGroupTracker } from "./components/ViewportGroupTracker";
import { Analytics } from "@vercel/analytics/next";

export const metadata: Metadata = {
  metadataBase: new URL("https://nuguzip.com"),
  manifest: "/manifest.webmanifest",
  /* S2·S3 — 검색엔진 소유 확인 메타태그 (2026-07-25 소유자 제공 토큰).
     구글: 정식 도메인 속성 인증은 Vercel DNS 의 TXT 레코드로 하고, 이 태그는
     URL 접두어 속성용 폴백. 네이버: 서치어드바이저 HTML 태그 방식(정식).
     검증 토큰은 공개돼도 되는 값이다(시크릿 아님). */
  verification: {
    google: "d4jn9bf7SyTraz2EEnn4aNIPemHwz-Bqqflre4DEuXU",
    other: { "naver-site-verification": "411fe0d67e731e16c96f4994d904f6160e4927af" },
  },
  title: "누구집 — 임장 기록이 판단 근거가 됩니다",
  description:
    "3분 기록 → AI 정리 → 지도 비교. 부동산 임장노트 플랫폼 누구집. 로그인 없이 시작하세요.",
  openGraph: {
    title: "누구집 — 임장 기록이 판단 근거가 됩니다",
    description: "3분 기록 → AI 정리 → 지도 비교. 부동산 임장노트 플랫폼 누구집.",
    siteName: "누구집",
    locale: "ko_KR",
    type: "website",
    // S4 — 기본 공유 카드(/og-image). 페이지 전용 카드가 있으면 각 페이지가 덮어쓴다.
    images: [{ url: "/og-image", width: 1200, height: 630, alt: "누구집" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#f7f9fc",
  viewportFit: "cover", // 세이프에어리어(env safe-area-inset-*) 활성화
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full antialiased" suppressHydrationWarning>
      <head>
        {/* G7 — 폰트 CDN 사전 연결.
            아래 Pretendard stylesheet 은 렌더 블로킹이라, 이 한 줄이 늦으면 첫
            화면 전체가 늦는다. preconnect 없이는 DNS→TCP→TLS 세 왕복이 링크를
            만난 뒤에야 시작된다. 미리 열어 두면 그 왕복이 HTML 파싱과 겹친다.
            crossOrigin 은 필수 — 폰트는 CORS 로 받으므로 이게 없으면 연결이
            재사용되지 않고 따로 하나 더 열린다. */}
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="anonymous" />
        {/* N3 — RSS 자동 발견. 리더·크롤러는 이 태그로 피드를 찾는다. 메타데이터
            규약(alternates.types)에 두지 않은 이유는, 페이지가 canonical 을
            지정하면 alternates 객체가 통째로 덮여 피드 링크가 사라지기 때문이다.
            여기 두면 모든 페이지에 남는다. */}
        <link
          rel="alternate"
          type="application/rss+xml"
          title="누구집 — 실거래 리포트·임장노트"
          href="https://nuguzip.com/feed.xml"
        />
        {/* 비애플 기기 폰트 폴백 — Pretendard Variable (dynamic subset) */}
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
        {/* #19 PWA — iOS 홈 화면 아이콘 · 웹앱 메타
            G9: .svg → .png 로 교체했다. Safari 는 apple-touch-icon 으로 SVG 를
            받지 않는다 — 지금까지 iOS 에서 홈 화면에 추가하면 아이콘이 아니라
            페이지 스크린샷 축소판이 박혔다는 뜻이다(조용히 실패해서 티가 안 났다). */}
        <link rel="apple-touch-icon" sizes="192x192" href="/icons/icon-192.png" />
        {/* S16/G16 — Organization·WebSite JSON-LD (정적 값만, 데이터 페칭 없음) */}
        <SiteJsonLd />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="누구집" />
      </head>
      <body className="min-h-full flex flex-col">
        {/* #18 a11y — 본문 바로가기 (키보드 첫 Tab) */}
        <a href="#main-content" className="sr-only">
          본문 바로가기
        </a>
        <ThemeProvider>
          <ToastProvider>
            {/* A3 비로그인 액션 → 소프트 가입 프롬프트 (401 즉시 리다이렉트 대체) */}
            <SoftSignupProvider>
              {children}
              {/* 친구 추천 리딤 트리거 (ref_code 쿠키 → 리딤, 렌더 없음) */}
              <ReferralRedeem />
              <SwRegister />
              {/* G9 — 설치 프롬프트. 브라우저가 beforeinstallprompt 를 보낼 때만 뜬다
                  (안 오면 아무것도 렌더하지 않는다). SwRegister 바로 뒤에 둔 건
                  순서 의존이 아니라 읽는 사람 편의 — 둘 다 PWA 관련이다. */}
              <InstallPrompt />
              <AdSenseLoader />
              <WebVitalsReporter />
              {/* S22 — 쿠키 동의 배너 + 동의 게이트 GA4 (동의 전에는 스크립트
                  로드 자체가 없다). NEXT_PUBLIC_GA4_ID 미설정 시 GA4는 무동작. */}
              <CookieConsentBanner />
              <Ga4GtagLoader />
              {/* 반응형 QA — viewport_group_change 계측 (그룹 경계 통과 시에만) */}
              <ViewportGroupTracker />
              {/* Vercel Web Analytics — 프로덕션(Vercel 배포)에서만 수집,
                  로컬에서는 아무것도 전송하지 않는다. */}
              <Analytics />
            </SoftSignupProvider>
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
