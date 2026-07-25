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

export const metadata: Metadata = {
  metadataBase: new URL("https://nuguzip.com"),
  manifest: "/manifest.webmanifest",
  title: "누구집 — 임장 기록이 판단 근거가 됩니다",
  description:
    "3분 기록 → AI 정리 → 지도 비교. 부동산 임장노트 플랫폼 누구집. 로그인 없이 시작하세요.",
  openGraph: {
    title: "누구집 — 임장 기록이 판단 근거가 됩니다",
    description: "3분 기록 → AI 정리 → 지도 비교. 부동산 임장노트 플랫폼 누구집.",
    siteName: "누구집",
    locale: "ko_KR",
    type: "website",
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
            </SoftSignupProvider>
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
