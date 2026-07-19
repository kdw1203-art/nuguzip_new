"use client";

import { useEffect } from "react";

/** PWA 서비스워커 등록 — 프로덕션에서만 /sw.js 등록 (구 sw-register.tsx 참고, 경량화) */
export function SwRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .catch(() => {
          /* 등록 실패는 치명적이지 않음 — 무시 */
        });
    };

    if (document.readyState === "complete") register();
    else {
      window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
  }, []);

  return null;
}
