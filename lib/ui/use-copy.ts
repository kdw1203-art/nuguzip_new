"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/app/components/toast/ToastProvider";
import { INLINE_CONFIRM_MS } from "@/lib/ui/feedback-timing";
import { COPY_FAIL_MESSAGE, copyText } from "@/lib/ui/copy";

/**
 * [966] 복사 훅 — copyText + 토스트 + 버튼 자리의 "복사됨" 상태를 한 번에.
 *
 * copied 는 INLINE_CONFIRM_MS 동안만 true — 이 값이 화면마다 달랐던 역사가
 * lib/ui/feedback-timing 에 적혀 있다. 성공·실패 문구도 여기서 한 번만 정한다.
 * Provider 밖에서 쓰여도 useToast 가 no-op 이라 안전하다.
 */
export function useCopy(successMessage = "복사했어요") {
  const { showToast } = useToast();
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const copy = useCallback(
    async (text: string, message?: string): Promise<boolean> => {
      const ok = await copyText(text);
      if (timer.current !== null) window.clearTimeout(timer.current);
      if (ok) {
        setCopied(true);
        timer.current = window.setTimeout(() => setCopied(false), INLINE_CONFIRM_MS);
        showToast(message ?? successMessage);
      } else {
        setCopied(false);
        showToast(COPY_FAIL_MESSAGE);
      }
      return ok;
    },
    [showToast, successMessage],
  );

  return { copy, copied };
}
