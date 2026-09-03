"use client";

import { useEffect, useState } from "react";
import {
  isInCompareTray,
  promoteCompareItemToServer,
  removeCompareItemFromServer,
  subscribeCompareTray,
  toggleCompareTray,
} from "@/lib/newui/compare-tray";

/* 비교 담기 버튼 — lib/newui/compare-tray (localStorage, 최대 5개).
 *
 * 번들 분리(#412, 2026-08-16): 원래 단지 허브의 hub-client.tsx 안에 있었는데,
 * /map 이 이 버튼 하나를 쓰려고 hub-client 전체(가격 차트·AI 패널·허브 탭)를
 * 정적으로 끌고 왔다. 버튼만 독립 모듈로 빼서 /map 라우트 청크에서 허브
 * 코드를 떼어낸다. hub-client 는 하위 호환을 위해 재수출한다.
 */
export function CompareTrayButton({
  complexId,
  name,
  region,
}: {
  complexId: string;
  name: string;
  region?: string;
}) {
  const [inTray, setInTray] = useState(false);
  const [full, setFull] = useState(false);

  useEffect(() => {
    setInTray(isInCompareTray(complexId));
    return subscribeCompareTray(() => setInTray(isInCompareTray(complexId)));
  }, [complexId]);

  useEffect(() => {
    if (!full) return;
    const t = setTimeout(() => setFull(false), 2000);
    return () => clearTimeout(t);
  }, [full]);

  const onClick = () => {
    const r = toggleCompareTray({ id: complexId, name, region });
    setInTray(r.inTray);
    setFull(r.full);
    // #46 로그인 상태면 서버 user_watchlist에도 반영 (실패 시 localStorage만 유지)
    if (r.inTray) promoteCompareItemToServer({ id: complexId, name });
    else if (!r.full) removeCompareItemFromServer(complexId);
  };

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={inTray}
      className={`flex-1 rounded-[10px] p-3 text-center text-[13px] transition-colors ${
        inTray ? "bg-brand-navy font-extrabold text-surface" : "btn-secondary"
      }`}
    >
      {full ? "최대 5개까지 담겨요" : inTray ? "비교 담김 ✓" : "비교 담기"}
    </button>
  );
}
