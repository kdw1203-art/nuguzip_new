"use client";

import { ThemeProvider as NextThemeProvider } from "next-themes";

/** #16 다크 모드 — next-themes 래퍼.
 *  attribute="class" → <html class="dark"> 토글, globals.css .dark 토큰 오버라이드와 연동.
 *  기본값 light · 수동 토글(시스템 자동 전환은 표면 감사 후 활성화). */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      disableTransitionOnChange
    >
      {children}
    </NextThemeProvider>
  );
}
