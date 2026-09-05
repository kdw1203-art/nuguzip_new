"use client";

import { useEffect } from "react";

/**
 * [966] 저장 안 한 입력이 있을 때 새로고침·탭 닫기·주소창 이동을 한 번 묻는다.
 *
 * beforeunload 는 브라우저가 문구를 직접 정한다(크롬·사파리는 우리 문장을 안
 * 보여 준다) — preventDefault 와 returnValue 가 "묻겠다"는 신호일 뿐이다.
 * message 는 그 신호에 실어 보내는 값이고, 아직 문장을 보여 주는 구형 브라우저에서만
 * 읽힌다. 앱 안의 이동(router.push·Link)에는 이 이벤트가 안 온다 — 그건 각 폼의
 * 임시저장(localStorage)이 맡는다.
 *
 * dirty 가 false 인 동안은 리스너를 아예 달지 않는다 — 달아 두고 안에서 분기하면
 * 브라우저가 bfcache 에서 페이지를 빼 뒤로가기가 느려진다.
 */
export function useUnsavedGuard(
  dirty: boolean,
  message = "저장하지 않은 내용이 있어요. 나가시겠어요?",
) {
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      /* 구형 크롬/엣지(<119)·파이어폭스는 returnValue 가 있어야 대화상자를 띄운다 */
      e.returnValue = message;
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty, message]);
}

/**
 * [966] 지금 값이 기준값과 다른가 — 폼 스냅샷 비교용.
 * JSON.stringify 비교라 순환 참조·함수는 못 넣지만, 폼 상태(문자열·숫자·배열·평면
 * 객체)에는 충분하고 매 렌더 돌려도 싸다. 되돌리면 다시 false 가 된다.
 */
export function useDirtyTracker<T>(value: T, initial: T): boolean {
  return JSON.stringify(value) !== JSON.stringify(initial);
}
