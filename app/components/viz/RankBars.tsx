import Link from "next/link";
import { normalize } from "@/lib/viz/geometry";

export interface RankRow {
  key: string;
  label: string;
  value: number;
  /** 값 옆에 붙는 보조 표기 (예: "2026.07") */
  note?: string;
  href?: string;
}

/* 가로 랭킹 막대 — "표 대신" 쓰는 순위 시각화.
   전세가율·거래량 랭킹처럼 20~30행짜리 표는 숫자를 다 읽어야 순서가 보인다.
   막대는 그 순서를 길이로 먼저 보여 준다. */
export function RankBars({
  rows,
  suffix = "",
  max: maxOverride,
  className,
}: {
  rows: readonly RankRow[];
  suffix?: string;
  max?: number;
  className?: string;
}) {
  if (rows.length === 0) return null;
  const values = rows.map((r) => r.value);
  const ratios = maxOverride
    ? values.map((v) => (maxOverride > 0 ? Math.min(1, v / maxOverride) : 0))
    : normalize(values);
  return (
    <ol className={`flex flex-col gap-1 ${className ?? ""}`}>
      {rows.map((r, i) => {
        const pct = Math.max(3, Math.round((ratios[i] ?? 0) * 100));
        const body = (
          <>
            <span className="t-caption w-5 shrink-0 text-right text-text-3">{i + 1}</span>
            <span className="t-sub min-w-0 flex-1 truncate font-bold text-ink">{r.label}</span>
            <span className="rank-track">
              <span className="rank-fill" style={{ width: `${pct}%` }} />
            </span>
            <span className="t-num t-sub w-16 shrink-0 text-right text-ink">
              {(Math.round(r.value * 10) / 10).toLocaleString("ko-KR")}
              {suffix}
            </span>
          </>
        );
        return (
          <li key={r.key}>
            {r.href ? (
              <Link href={r.href} className="rank-row no-underline">
                {body}
              </Link>
            ) : (
              <span className="rank-row">{body}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
