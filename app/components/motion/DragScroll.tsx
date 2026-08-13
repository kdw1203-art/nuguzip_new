"use client";

import { useEffect } from "react";

/**
 * 가로 스크롤 영역 전역 드래그 인터랙션 (마우스 전용).
 *
 * 칩 행·카드 레일·비교 표처럼 `overflow-x: auto` 인 영역을 데스크톱에서
 * 마우스로 "잡아 끌어" 스크롤할 수 있게 한다. 터치는 브라우저 네이티브
 * 스크롤이 이미 이 역할을 하므로 건드리지 않는다(pointerType === "mouse" 만).
 *
 * 설계 원칙:
 *  - 개별 컴포넌트 수정 없이 문서 위임 한 곳에서 처리한다 — 새 화면이
 *    생겨도 자동으로 적용되고, 빠뜨린 레일이 생기지 않는다.
 *  - 6px 임계값 전에는 아무것도 하지 않는다 — 클릭·텍스트 선택과 충돌 금지.
 *  - 드래그가 성립한 뒤의 click 은 캡처 단계에서 1회 삼킨다 — 끌다가 놓은
 *    자리의 카드가 열리는 오동작 방지.
 *  - 입력 요소(input·textarea·select)·슬라이더 위에서는 시작하지 않는다.
 */
export function DragScroll() {
  useEffect(() => {
    let el: HTMLElement | null = null;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let engaged = false;

    const SKIP = /^(input|textarea|select|option|video|audio)$/i;

    function scrollableAncestor(target: EventTarget | null): HTMLElement | null {
      let node = target instanceof Element ? target : null;
      while (node && node !== document.body) {
        if (node instanceof HTMLElement) {
          if (SKIP.test(node.tagName) || node.isContentEditable) return null;
          if (node.hasAttribute("data-no-drag-scroll")) return null;
          if (node.scrollWidth > node.clientWidth + 4) {
            const ox = getComputedStyle(node).overflowX;
            if (ox === "auto" || ox === "scroll") return node;
          }
        }
        node = node.parentElement;
      }
      return null;
    }

    function swallowNextClick() {
      const swallow = (e: MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
      };
      document.addEventListener("click", swallow, { capture: true, once: true });
      /* 드래그 후 click 이 아예 발생하지 않는 브라우저 경로도 있다 — 리스너가
         남아 다음 진짜 클릭을 삼키지 않도록 짧게 뒤 해제한다. */
      window.setTimeout(
        () => document.removeEventListener("click", swallow, { capture: true }),
        120,
      );
    }

    function onPointerDown(e: PointerEvent) {
      if (e.pointerType !== "mouse" || e.button !== 0) return;
      const target = scrollableAncestor(e.target);
      if (!target) return;
      el = target;
      startX = e.clientX;
      startY = e.clientY;
      startLeft = target.scrollLeft;
      engaged = false;
    }

    function onPointerMove(e: PointerEvent) {
      if (!el) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (!engaged) {
        /* 세로 의도가 더 크면 드래그 스크롤로 뺏지 않는다(페이지 스크롤 우선) */
        if (Math.abs(dx) < 6 || Math.abs(dy) > Math.abs(dx)) return;
        engaged = true;
        document.documentElement.setAttribute("data-drag-scrolling", "");
      }
      el.scrollLeft = startLeft - dx;
      e.preventDefault();
    }

    function onPointerUp() {
      if (engaged) swallowNextClick();
      engaged = false;
      el = null;
      document.documentElement.removeAttribute("data-drag-scrolling");
    }

    /* 레일 안의 링크·이미지는 draggable 기본값이 true 라, 버튼을 누른 채
       움직이면 네이티브 드래그(dragstart)가 시작되며 포인터 이벤트가 끊긴다
       — 실측: 한 스텝만 스크롤되고 멈췄다. 레일 프레스 중에만 네이티브
       드래그를 막는다(그 외의 드래그 동작은 그대로). */
    function onDragStart(e: DragEvent) {
      if (el) e.preventDefault();
    }

    document.addEventListener("pointerdown", onPointerDown, { passive: true });
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp, { passive: true });
    document.addEventListener("pointercancel", onPointerUp, { passive: true });
    document.addEventListener("dragstart", onDragStart);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
      document.removeEventListener("pointercancel", onPointerUp);
      document.removeEventListener("dragstart", onDragStart);
      document.documentElement.removeAttribute("data-drag-scrolling");
    };
  }, []);

  return null;
}

export default DragScroll;
