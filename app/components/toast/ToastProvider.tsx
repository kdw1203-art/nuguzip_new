"use client";

import Link from "next/link";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";

/* 공용 토스트 (#42 · 961 브랜드 모션) — 동작 후 확인 피드백을 사이트 전역에서 일관되게.
   스펙: 동시 1개 · 3초(액션 있으면 5초) · 모바일 탭바 위 · 액션 최대 1개.
   961: 네이비 면 + 한지 글자 + 앞의 숨쉬는 온점(모션 시스템 07). 액션은 링크(href)뿐
   아니라 **되돌리기 같은 콜백(onClick)** 도 받는다 — 삭제 같은 파괴적 동작에 확인 모달을
   띄우는 대신 흐름을 끊지 않고 되돌릴 길을 준다(인터랙션 라이브러리 06).
   Provider 밖에서 useToast()가 호출돼도 no-op으로 안전. */

export type ToastAction =
  | { label: string; href: string; onClick?: never }
  | { label: string; onClick: () => void; href?: never };
type ToastContextValue = {
  showToast: (message: string, action?: ToastAction) => void;
};
type ToastState = { id: number; message: string; action?: ToastAction; leaving: boolean };

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  return ctx ?? { showToast: () => {} };
}

const HOLD_MS = 3000;
const HOLD_WITH_ACTION_MS = 5000;
const LEAVE_MS = 200;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timers = useRef<number[]>([]);
  const idRef = useRef(0);

  const clearTimers = useCallback(() => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  const dismiss = useCallback(() => {
    clearTimers();
    setToast((prev) => (prev ? { ...prev, leaving: true } : prev));
    timers.current.push(window.setTimeout(() => setToast(null), LEAVE_MS));
  }, [clearTimers]);

  const showToast = useCallback(
    (message: string, action?: ToastAction) => {
      const msg = message?.trim();
      if (!msg) return;
      clearTimers();
      idRef.current += 1;
      setToast({ id: idRef.current, message: msg, action, leaving: false });
      const hold = action ? HOLD_WITH_ACTION_MS : HOLD_MS;
      timers.current.push(
        window.setTimeout(() => {
          setToast((prev) => (prev ? { ...prev, leaving: true } : prev));
        }, hold),
      );
      timers.current.push(window.setTimeout(() => setToast(null), hold + LEAVE_MS));
    },
    [clearTimers],
  );

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="pointer-events-none fixed inset-x-0 z-[80] flex justify-center px-4"
        style={{ bottom: "var(--nz-toast-bottom)" }}
      >
        {toast && (
          <div
            key={toast.id}
            role="status"
            data-leaving={toast.leaving ? "true" : "false"}
            className="toast pointer-events-auto flex max-w-[calc(100vw-32px)] items-center gap-2.5 px-4 py-3 t-body font-semibold"
          >
            <span className="toast-dot" aria-hidden="true" />
            <span className="min-w-0 truncate">{toast.message}</span>
            {toast.action &&
              (toast.action.href ? (
                <Link
                  href={toast.action.href}
                  className="toast-action shrink-0 whitespace-nowrap no-underline"
                >
                  {toast.action.label}
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    toast.action?.onClick?.();
                    dismiss();
                  }}
                  className="toast-action shrink-0 whitespace-nowrap"
                >
                  {toast.action.label}
                </button>
              ))}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}

export default ToastProvider;
