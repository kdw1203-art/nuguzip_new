"use client";

import { useEffect, useRef } from "react";

/**
 * 초대 리딤 트리거 (렌더링 없음).
 *
 * 어디든(예: 루트 레이아웃) 마운트되어 있다가, ref_code 쿠키가 있으면
 * /api/referral/redeem 로 POST 한다.
 *  - 로그인 상태: 서버가 리딤 → 2xx → 쿠키 정리
 *  - 비로그인:   401 → 쿠키 유지(로그인 후 다음 마운트 때 재시도)
 * 모든 오류는 조용히 무시한다.
 */

const COOKIE_NAME = "ref_code";

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${name}=([^;]*)`),
  );
  return m ? decodeURIComponent(m[1]) : null;
}

function clearCookie(name: string): void {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=; path=/; max-age=0; samesite=lax`;
}

export function ReferralRedeem() {
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;

    const code = readCookie(COOKIE_NAME);
    if (!code) return;

    void (async () => {
      try {
        const res = await fetch("/api/referral/redeem", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ code }),
        });
        // 2xx 면 종료 상태(리딤됨/자기추천/이미/코드무효) → 쿠키 제거.
        // 401 등은 쿠키를 남겨 로그인 후 재시도한다.
        if (res.ok) clearCookie(COOKIE_NAME);
      } catch {
        /* 네트워크 오류 등은 무시 (쿠키 유지) */
      }
    })();
  }, []);

  return null;
}

export default ReferralRedeem;
