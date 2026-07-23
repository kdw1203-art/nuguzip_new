import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SwRegister } from "./components/SwRegister";
import { AdSenseLoader } from "./components/AdSenseLoader";
import { ThemeProvider } from "./components/ThemeProvider";
import { ToastProvider } from "./components/toast/ToastProvider";
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
        {/* 비애플 기기 폰트 폴백 — Pretendard Variable (dynamic subset) */}
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
        {/* #19 PWA — iOS 홈 화면 아이콘 · 웹앱 메타 */}
        <link rel="apple-touch-icon" href="/icons/icon-192.svg" />
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
            {children}
            {/* 친구 추천 리딤 트리거 (ref_code 쿠키 → 리딤, 렌더 없음) */}
            <ReferralRedeem />
            <SwRegister />
            <AdSenseLoader />
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
