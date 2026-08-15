"use client";

import { useRouter } from "next/navigation";

/* 지역 선택 → /analysis/price?region=<slug> 로 이동(서버 컴포넌트가 다시 계산).
   실거래 셀이 있는 지역만 서버에서 넘겨받는다(빈 지역을 고를 수 없다). */
export function RegionSelect({
  regions,
  current,
}: {
  regions: { slug: string; name: string; txCount: number }[];
  current: string;
}) {
  const router = useRouter();
  return (
    <select
      value={current}
      onChange={(e) => {
        const slug = e.target.value;
        router.push(`/analysis/price?region=${encodeURIComponent(slug)}`);
      }}
      aria-label="지역 선택"
      className="max-w-[220px] rounded-[10px] border border-line bg-surface px-2.5 py-2 text-[13px] font-bold text-ink"
    >
      {regions.map((r) => (
        <option key={r.slug} value={r.slug}>
          {r.name} ({r.txCount.toLocaleString("ko-KR")}건)
        </option>
      ))}
    </select>
  );
}
