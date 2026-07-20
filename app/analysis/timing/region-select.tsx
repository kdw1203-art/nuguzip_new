"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

/* 시세·타이밍 지역 선택 — 선택 시 ?region= 로 서버 재렌더 (실데이터 시리즈 로드) */
export function TimingRegionSelect({
  options,
  value,
}: {
  options: { id: string; label: string }[];
  value: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <select
      value={value}
      disabled={pending}
      onChange={(e) => {
        const id = e.target.value;
        startTransition(() => {
          router.replace(`/analysis/timing?region=${encodeURIComponent(id)}`, {
            scroll: false,
          });
        });
      }}
      aria-label="분석 지역 선택"
      className="rounded-[10px] border border-line bg-surface px-2.5 py-2 text-xs font-bold text-ink disabled:opacity-60"
    >
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
