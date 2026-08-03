import Link from "next/link";
import { listLatestTemperatures } from "@/lib/market/temperature-archive";
import { logger } from "@/lib/log";

/* ============================================================
   고도화 9 — 시장 온도 홈 위젯.

   /analysis/temperature 에만 있던 주간 온도 스냅샷(0~100 · 50 중립)을 홈에서
   요약으로 보여준다. 데이터는 이미 크론이 매주 계산해 아카이브에 쌓는 실측치라
   새 계산이 없다.

   사실 우선:
   - 기준 주(week_start)를 반드시 표기한다 — 기준 없는 온도는 숫자 장식이다.
   - 조회 실패·기록 없음이면 위젯을 그리지 않는다(거리뷰·좌표와 같은 판단:
     곁다리 위젯은 조용히 접히는 쪽이 "실패를 0점처럼 그리는" 것보다 정직하다).
     실패 사실은 서버 로그에 남긴다.
   - 지난주 대비(Δ)는 지난주 기록이 실재할 때만 표기한다.
   ============================================================ */

function fmtWeek(weekStart: string): string {
  // "2026-07-27" → "7.27 주"
  const m = weekStart.match(/^\d{4}-(\d{2})-(\d{2})$/);
  if (!m) return weekStart;
  return `${Number(m[1])}.${m[2]} 주`;
}

function tone(score: number): string {
  if (score >= 60) return "text-[#d13f3f]"; // 과열 쪽
  if (score <= 40) return "text-[#2e6fd8]"; // 냉각 쪽
  return "text-text-1";
}

export async function MarketTempWidget({ className }: { className?: string }) {
  let weekStart: string | null = null;
  let rows: Awaited<ReturnType<typeof listLatestTemperatures>>["rows"] = [];
  try {
    const res = await listLatestTemperatures();
    weekStart = res.weekStart;
    rows = res.rows;
  } catch (e) {
    logger.error(
      "[home] 시장 온도 위젯 조회 실패 — 위젯을 접습니다:",
      e instanceof Error ? e.message : String(e),
    );
    return null;
  }
  if (!weekStart || rows.length === 0) return null;

  // 가장 뜨거운 2곳 + 가장 차가운 1곳 — "지금 어디가 움직이나"의 최소 요약
  const hottest = rows.slice(0, 2);
  const coldest = rows.length > 2 ? [rows[rows.length - 1]] : [];
  const picks = [...hottest, ...coldest];

  return (
    <div className={`card flex flex-col gap-2 rounded-2xl px-5 py-4 ${className ?? ""}`}>
      <div className="flex items-center justify-between">
        <span className="accent-underline text-[13px] font-extrabold text-ink">
          시장 온도{" "}
          <span className="text-[10px] font-medium text-text-3">
            {fmtWeek(weekStart)} 기준 · 50 중립
          </span>
        </span>
        <Link
          href="/analysis/temperature"
          className="text-[11px] text-text-3 transition-colors hover:text-primary"
        >
          전체 지역
        </Link>
      </div>
      <div className="flex flex-col">
        {picks.map((r) => {
          const delta = r.previous ? r.current.score - r.previous.score : null;
          return (
            <Link
              key={r.current.regionId}
              href={`/analysis/temperature/${encodeURIComponent(r.current.regionId)}`}
              className="press flex items-center justify-between gap-2 border-b border-[#f0f3f8] py-[7px] text-xs no-underline last:border-0"
            >
              <span className="truncate font-semibold text-text-1">
                {r.current.regionLabel}
              </span>
              <span className="flex shrink-0 items-baseline gap-1.5">
                <span className={`t-num text-[14px] font-extrabold ${tone(r.current.score)}`}>
                  {r.current.score}
                </span>
                {delta !== null && delta !== 0 && (
                  <span className="text-[10px] text-text-3">
                    {delta > 0 ? "▲" : "▼"}
                    {Math.abs(delta)}
                  </span>
                )}
              </span>
            </Link>
          );
        })}
      </div>
      <p className="text-[10px] leading-relaxed text-text-3">
        실거래 지수 모멘텀 + 거래량 추이 기반 주간 산출 · 투자 권유 아님
      </p>
    </div>
  );
}
