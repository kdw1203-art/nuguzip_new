"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * 화면이 바뀌는 순간의 **연결감**.
 *
 * App Router 는 경로가 바뀌어도 화면이 그냥 툭 갈린다. 그 사이에 아무 변화가
 * 없으면 사용자는 "새 화면"이 아니라 "화면이 깜빡였다"로 읽는다. 여기서는
 * 경로가 바뀔 때마다 `<body>` 에 짧은 페이드를 한 번 걸어 준다.
 *
 * 왜 `template.tsx` 가 아니라 이 방식인가:
 * 루트 `template.tsx` 를 쓰면 이동할 때마다 트리 전체가 다시 마운트된다.
 * 그러면 `/map` 처럼 쿼리만 바꿔 필터링하는 화면이 매번 지도를 처음부터 다시
 * 그린다 — 연출을 얻으려고 기능을 깎는 셈이다. body 에 클래스만 붙이면
 * 리마운트가 없다.
 *
 * 왜 이동/확대가 아니라 **불투명도만** 쓰는가:
 * transform·filter 는 자손 `position: fixed` 의 컨테이닝 블록을 만든다.
 * 하단 탭바가 fixed 라, 애니메이션이 도는 동안 탭바가 뷰포트가 아니라 문서
 * 박스를 기준으로 잡히면서 긴 페이지에서는 화면 밖으로 밀려난다. opacity 는
 * 쌓임 맥락만 만들고 컨테이닝 블록은 만들지 않아 안전하다. 실제 "움직임"은
 * 안쪽 콘텐츠(.rise-in-*, [data-reveal])가 맡는다.
 */
export function PageTransition() {
  const pathname = usePathname();

  useEffect(() => {
    const body = document.body;
    body.classList.remove("page-enter");
    /* 같은 클래스를 떼자마자 다시 붙이면 브라우저는 변화를 못 알아채고
       애니메이션을 재생하지 않는다. 레이아웃 값을 한 번 읽어 리플로우를
       강제해야 두 번째 이동부터도 정상적으로 다시 재생된다. */
    void body.offsetWidth;
    body.classList.add("page-enter");

    /* 끝난 애니메이션 클래스를 남겨 두지 않는다. 남겨 두면 다음 사람이
       body 스타일을 디버깅할 때 "왜 항상 이 클래스가 붙어 있지?"를 먼저
       풀어야 한다. */
    const timer = window.setTimeout(() => {
      body.classList.remove("page-enter");
    }, 600);

    return () => window.clearTimeout(timer);
  }, [pathname]);

  return null;
}

export default PageTransition;
