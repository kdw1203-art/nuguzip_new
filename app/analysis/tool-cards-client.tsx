"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { listCompareTray } from "@/lib/newui/compare-tray";

/* 분석 허브 항목별 고유 기능(#411) — 클라이언트 조각 3종.
 *
 * 1) ToolLink: 카드 클릭 시 "마지막 사용 도구"를 localStorage 에 기록.
 * 2) LastToolChip: 다음 방문 때 "최근 사용 도구 이어가기" 칩 (기록 없으면 없음).
 * 3) CompareTrayCount: 비교 카드 티저 — 지금 담겨 있는 후보 수(실카운트).
 *    0개면 아무것도 그리지 않는다(빈 트레이에 숫자 배지는 소음이다).
 */

const LAST_TOOL_KEY = "nz_last_analysis_tool";

interface LastTool {
  href: string;
  title: string;
  at: number;
}

function readLastTool(): LastTool | null {
  try {
    const raw = window.localStorage.getItem(LAST_TOOL_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as Partial<LastTool>;
    if (typeof o.href !== "string" || typeof o.title !== "string") return null;
    return { href: o.href, title: o.title, at: Number(o.at) || 0 };
  } catch {
    return null;
  }
}

export function ToolLink({
  href,
  title,
  className,
  children,
}: {
  href: string;
  title: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={className}
      onClick={() => {
        try {
          window.localStorage.setItem(
            LAST_TOOL_KEY,
            JSON.stringify({ href, title, at: Date.now() } satisfies LastTool),
          );
        } catch {
          /* 저장 실패는 기능 자체(이동)에 영향 없음 */
        }
      }}
    >
      {children}
    </Link>
  );
}

export function LastToolChip() {
  const [last, setLast] = useState<LastTool | null>(null);
  useEffect(() => {
    setLast(readLastTool());
  }, []);
  if (!last) return null;
  return (
    <Link
      href={last.href}
      className="chip inline-flex items-center gap-1.5 bg-primary-soft px-3.5 py-2 text-xs font-bold text-primary no-underline"
    >
      ↻ 최근 사용 · {last.title} 이어가기 ›
    </Link>
  );
}

export function CompareTrayCount() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    try {
      setCount(listCompareTray().length);
    } catch {
      setCount(0);
    }
  }, []);
  if (count <= 0) return null;
  return (
    <span className="t-num inline-flex w-fit items-baseline gap-1.5 rounded-xl bg-bg px-3 py-1.5">
      <span className="text-[15px] font-extrabold text-ink">{count}개</span>
      <span className="text-[10.5px] text-text-3">담은 후보 — 바로 비교 가능</span>
    </span>
  );
}
