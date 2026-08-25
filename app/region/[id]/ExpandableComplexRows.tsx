"use client";

import { useState, type ReactNode } from "react";

/**
 * 단지별 현황 12↔30 확장 토글 (클라이언트 상태).
 *
 * 예전에는 `?complexes=30` 링크로 확장했는데, searchParams 를 읽는 순간 이
 * 페이지 전체가 요청마다 서버 렌더(`private, no-cache, no-store`)가 되어
 * 61개 지역 랜딩의 CDN 재사용률이 0이 됐다 — 2026-07-28 함수 호출 소진
 * 사고의 남은 자리였다. 30개를 서버에서 미리 렌더해 두고 여기서는 보여줄
 * 범위만 바꾼다. 두 벌 모두 실데이터 서버 렌더 결과라 내용 차이는 없다.
 */
export function ExpandableComplexRows({
  collapsed,
  expanded,
  canExpand,
}: {
  collapsed: ReactNode;
  expanded: ReactNode;
  /** 13개 이상 있을 때만 토글을 그린다 — 있지도 않은 "더 보기"는 그리지 않는다. */
  canExpand: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {open ? expanded : collapsed}
      {canExpand && !open && (
        <div className="mt-2 text-right">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="press t-sub font-bold text-primary"
          >
            더 보기
          </button>
        </div>
      )}
    </>
  );
}
