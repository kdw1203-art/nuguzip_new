"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/* ============================================================
   최근 본 단지 (호갱노노 벤치마크 — 재방문 동선 단축)
   localStorage nz_recent_complexes · 최대 8개 · 최신순
   - RecentComplexRecorder: /complex/[id] 방문 시 기록 (렌더 없음)
   - RecentComplexChips: /search 등에서 칩 행 노출 (기록 있을 때만)
   ============================================================ */

const KEY = "nz_recent_complexes";
const MAX = 8;

export interface RecentComplex {
  id: string;
  name: string;
  region?: string;
  /** 마지막 방문 시각 (epoch ms) */
  at: number;
}

function readRecents(): RecentComplex[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const arr: unknown = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter(
        (v): v is RecentComplex =>
          !!v &&
          typeof v === "object" &&
          typeof (v as RecentComplex).id === "string" &&
          typeof (v as RecentComplex).name === "string" &&
          typeof (v as RecentComplex).at === "number",
      )
      .slice(0, MAX);
  } catch {
    return []; // 파싱 실패·프라이빗 모드 — 조용히 무시
  }
}

function writeRecents(list: RecentComplex[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    // 저장 불가 환경 — no-op
  }
}

/** /complex/[id] 방문 기록 — 목업 폴백(id가 mock-*)은 기록하지 않음 */
export function RecentComplexRecorder({
  id,
  name,
  region,
}: {
  id: string;
  name: string;
  region?: string;
}) {
  useEffect(() => {
    if (!id || id.startsWith("mock")) return;
    const next: RecentComplex[] = [
      { id, name, region, at: Date.now() },
      ...readRecents().filter((r) => r.id !== id),
    ];
    writeRecents(next);
  }, [id, name, region]);
  return null;
}

/** 최근 본 단지 칩 행 — 기록이 있을 때만 렌더 */
export function RecentComplexChips({ className }: { className?: string }) {
  const [items, setItems] = useState<RecentComplex[]>([]);

  useEffect(() => {
    setItems(readRecents());
  }, []);

  const remove = (id: string) => {
    setItems((prev) => {
      const next = prev.filter((r) => r.id !== id);
      writeRecents(next);
      return next;
    });
  };

  if (items.length === 0) return null;

  return (
    <div className={`rise-in flex flex-col gap-1.5 ${className ?? ""}`}>
      <div className="px-1 text-xs font-extrabold text-text-3">최근 본 단지</div>
      <div className="flex flex-wrap gap-[5px]">
        {items.map((r) => (
          <span
            key={r.id}
            className="chip flex items-center gap-1.5 border border-line bg-bg px-3 py-1.5 text-[11px] text-text-2"
          >
            <Link
              href={`/complex/${encodeURIComponent(r.id)}`}
              className="font-semibold text-text-1"
            >
              {r.name}
              {r.region ? <span className="ml-1 text-text-3">{r.region}</span> : null}
            </Link>
            <button
              type="button"
              onClick={() => remove(r.id)}
              aria-label={`최근 본 단지 ${r.name} 삭제`}
              className="text-text-3"
            >
              ✕
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}
