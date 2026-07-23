"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";

/* 공용 토스트 (#42) — 동작 후 확인 피드백을 사이트 전역에서 일관되게.
   기존 globals.css `.toast`(잉크 배경·toastIn 애니메이션) 재사용.
   스펙: 동시 1개 · 3초 · 모바일 탭바 위 · 액션 링크 최대 1개.
   Provider 밖에서 useToast()가 호출돼도 no-op으로 안전. */

export type ToastAction = { label: string; href: string };
type ToastContextValue = {
  showToast: (message: string, action?: ToastAction) => void;
};
type ToastState = { id: number; message: string; action?: ToastAction };

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  return ctx ?? { showToast: () => {} };
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idRef = useRef(0);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const showToast = useCallback((message: string, action?: ToastAction) => {
    const msg = message?.trim();
    if (!msg) return;
    idRef.current += 1;
    setToast({ id: idRef.current, message: msg, action });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="pointer-events-none fixed inset-x-0 z-[80] flex justify-center px-4"
        style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 84px)" }}
      >
        {toast && (
          <div
            key={toast.id}
            role="status"
            className="toast pointer-events-auto flex max-w-[calc(100vw-32px)] items-center gap-3 px-4 py-3 text-[13px] font-semibold"
          >
            <span className="min-w-0 truncate">{toast.message}</span>
            {toast.action && (
              <a
                href={toast.action.href}
                className="toast-action shrink-0 whitespace-nowrap no-underline"
              >
                {toast.action.label}
              </a>
            )}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}

export default ToastProvider;
