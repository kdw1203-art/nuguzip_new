"use client";

/**
 * `<meta name="theme-color">` 를 지금 켜져 있는 테마에 맞춘다 (standalone 점검 337).
 *
 * ── 무엇이 문제였나 ──────────────────────────────────────────────────────
 * app/layout.tsx 의 `viewport.themeColor` 가 `#f7f9fc` 한 값으로 박혀 있었다.
 * 이 값은 브라우저·OS 가 **웹앱 바깥 크롬**을 칠하는 데 쓴다 — 안드로이드
 * 크롬의 상태바, 홈 화면에 추가한 PWA 의 시스템 바가 여기서 색을 가져간다.
 * 그런데 이 앱은 다크 모드를 손으로 켤 수 있고(.dark → --bg: #0e1116),
 * 켜면 화면은 까만데 그 위 시스템 바만 밝은 회색으로 남았다. standalone 에서는
 * 브라우저 UI 가 없어 그 띠가 곧 앱의 테두리라 더 눈에 띈다.
 *
 * ── 왜 prefers-color-scheme 미디어쿼리로 안 했나 ──────────────────────────
 * `themeColor: [{ media: "(prefers-color-scheme: dark)", color: ... }]` 로
 * 적는 게 흔한 방법이지만, 여기서는 **틀린 답이 된다.** ThemeProvider 가
 * `enableSystem={false}` 라 이 앱의 테마는 OS 설정을 따라가지 않는다. OS 는
 * 다크인데 앱은 라이트인 경우(기본값!)와 그 반대가 둘 다 정상 상태이고,
 * 미디어쿼리는 그 두 경우에 정확히 반대 색을 칠한다. 지금보다 나빠진다.
 *
 * ── 왜 useTheme() 이 아니라 MutationObserver 인가 ────────────────────────
 * 처음엔 `useTheme()` 의 resolvedTheme 을 의존성으로 걸었다. 새로고침으로는
 * 잘 됐는데(next-themes 의 인라인 스크립트가 하이드레이션 전에 클래스를 이미
 * 붙여 놓으니까), **화면에서 토글을 누르는 실제 경로에서는 안 됐다.** 실측:
 * `<html class>` 는 dark 로 바뀌었는데 meta 는 #f7f9fc 그대로였다.
 * 리액트 이펙트는 자식이 먼저 돈다 — 이 컴포넌트는 NextThemeProvider 의
 * 자식이라, 클래스를 붙이는 부모 이펙트보다 **먼저** 실행돼 아직 안 바뀐 색을
 * 읽었다. 순서에 기대는 대신 색을 실제로 결정하는 것(=html 의 class)을 직접
 * 본다. 이러면 next-themes 를 안 거치는 경로가 생겨도 따라간다.
 *
 * ── 색을 여기 적지 않는 이유 ─────────────────────────────────────────────
 * 실제로 칠해진 `--bg` 를 읽어서 넣는다. 색값을 이 파일에 복사해 두면
 * globals.css 의 토큰이 바뀔 때 조용히 어긋난다 — 저장소 다른 곳에서 이미
 * 여러 번 그랬다(지도 레인 오프셋). 정하는 데는 한 군데(globals.css)뿐이고
 * 여기서는 읽기만 한다.
 *
 * SSR/첫 페인트용 기본값은 layout 의 viewport.themeColor 가 계속 담당한다
 * (defaultTheme 이 light 라 그 값이 맞다). 이 컴포넌트는 그 뒤를 따라간다.
 */
import { useEffect } from "react";

export function ThemeColorMeta() {
  useEffect(() => {
    const sync = () => {
      const bg = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
      /* 못 읽으면 건드리지 않는다 — 빈 값을 써 넣으면 브라우저가 기본색으로
         떨어지면서 지금 맞는 색까지 잃는다. 모르는 것보다 틀린 게 나쁘다. */
      if (!bg) return;
      let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
      if (!meta) {
        meta = document.createElement("meta");
        meta.name = "theme-color";
        document.head.appendChild(meta);
      }
      if (meta.content !== bg) meta.content = bg;
    };

    sync();
    const ob = new MutationObserver(sync);
    ob.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => ob.disconnect();
  }, []);

  return null;
}
