"use client";

import { ThemeProvider as NextThemeProvider } from "next-themes";

/** #16 다크 모드 — next-themes 래퍼.
 *  attribute="class" → <html class="dark"> 토글, globals.css .dark 토큰 오버라이드와 연동.
 *
 *  [966] enableSystem — 설정(/my/settings 계정 탭)에서 "시스템" 을 고를 수 있게 켠다.
 *  기본값은 여전히 light 다: 전체 메뉴의 ThemeToggle 은 resolvedTheme 기준으로
 *  light↔dark 만 오가므로 기본을 system 으로 바꾸면 OS 가 다크인 사용자가 첫 방문부터
 *  다크를 보게 되고(표면 감사 전), 토글 한 번이 "시스템 따르기" 를 조용히 해제한다.
 *  시스템 추종은 사용자가 설정에서 명시적으로 고른 경우에만 적용한다. */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemeProvider>
  );
}
