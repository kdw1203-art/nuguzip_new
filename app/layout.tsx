import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SwRegister } from "./components/SwRegister";
import { AdSenseLoader } from "./components/AdSenseLoader";

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
    <html lang="ko" className="h-full antialiased">
      <head>
        {/* 비애플 기기 폰트 폴백 — Pretendard Variable (dynamic subset) */}
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body className="min-h-full flex flex-col">
        {children}
        <SwRegister />
        <AdSenseLoader />
      </body>
    </html>
  );
}
