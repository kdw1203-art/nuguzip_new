"use client";

import { useEffect, useState } from "react";

/**
 * [961] 스플래시 — 모션 시스템 v1.0 §01 "로고가 그려지는 순간".
 * 처마가 그어지고(0.62s) → 온점이 떨어지고(0.5s) → 이름이 뜬다(0.5s). 총 1.36초, 1.5초에 사라진다.
 *
 * 언제만: **홈 화면에 설치한 앱(standalone)으로 실행했을 때, 세션당 한 번**.
 * 브라우저 탭에서는 첫 화면을 1.5초 가리는 것이 곧 이탈이라 띄우지 않는다.
 * reduced-motion 이면 CSS 가 통째로 숨긴다(display:none). SSR 에서는 아무것도 그리지 않는다.
 */
export function BrandSplash() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      const standalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true;
      if (!standalone) return;
      if (sessionStorage.getItem("njn-splash") === "1") return;
      sessionStorage.setItem("njn-splash", "1");
      setShow(true);
      const t = window.setTimeout(() => setShow(false), 1900);
      return () => window.clearTimeout(t);
    } catch {
      /* 저장소 접근 불가(프라이빗 모드 등) — 스플래시 없이 진행 */
    }
  }, []);

  if (!show) return null;
  return (
    <div className="njn-splash" aria-hidden="true">
      <svg width="96" height="88" viewBox="0 0 120 120">
        <path
          className="sp-eave"
          d="M14 46 C 38 64, 82 64, 106 46"
          fill="none"
          stroke="#F6F1E7"
          strokeWidth="7"
          strokeLinecap="round"
        />
        <path
          className="sp-eave"
          d="M52 28 L68 28"
          fill="none"
          stroke="#F6F1E7"
          strokeWidth="7"
          strokeLinecap="round"
        />
        <circle className="sp-dot" cx="60" cy="86" r="8.5" fill="#E0563A" />
      </svg>
      <div className="sp-wm">내집나우</div>
    </div>
  );
}

export default BrandSplash;
