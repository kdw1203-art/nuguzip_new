"use client";

import { useState } from "react";

/**
 * 오프라인 폴백의 "다시 시도" — location.reload() 한 줄이 전부다.
 * confirm()/alert() 같은 모달 다이얼로그는 쓰지 않는다(자동화·접근성 양쪽에서 막힌다).
 */
export function RetryButton() {
  const [tried, setTried] = useState(false);

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={() => {
          setTried(true);
          window.location.reload();
        }}
        className="press inline-flex min-h-[48px] items-center justify-center rounded-2xl bg-primary px-6 text-sm font-bold text-white"
      >
        다시 시도
      </button>
      {/* 눌렀는데도 이 화면이 그대로면 아직 연결이 안 된 것 — 그 사실만 알려준다 */}
      <p aria-live="polite" className="min-h-[18px] text-[12px] text-slate-500">
        {tried ? "아직 연결되지 않았어요. 잠시 후 다시 눌러 주세요." : ""}
      </p>
    </div>
  );
}
