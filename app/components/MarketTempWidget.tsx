import Link from "next/link";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import {
  listLatestTemperatures,
  listRegionTemperatureHistory,
} from "@/lib/market/temperature-archive";
import { logger } from "@/lib/log";

/* ------------------------------------------------------------------
   최적화 27·33 — 이 위젯의 조회를 두 겹으로 접는다.

   27) 홈은 이 위젯을 **한 번 그릴 때 두 번** 렌더한다(모바일 본문 블록과
       데스크톱 사이드바 — CSS 로 한쪽만 보이지만 서버는 둘 다 실행한다).
       그래서 같은 조회가 통째로 두 벌 나갔다: 최신 주 2회 + 지역 이력 3회씩
       두 벌 = 10회. React `cache()` 로 **요청 범위** 1회로 접는다.

   33) 값은 주간 크론이 쌓는 아카이브다 — 일주일에 한 번 바뀐다. 그런데 홈은
       ISR 300초라 5분마다 재생성되면서 같은 주의 같은 행을 다시 읽었다.
       `unstable_cache` 1시간으로 12분의 1이 된다. 기준 주(week_start)는 화면에
       그대로 표기되므로 캐시가 기준시점을 흐리지 않는다.

   단, **실패와 "기록 없음"은 캐시하지 않는다**. 값으로 돌려주면 unstable_cache
   가 한 시간 붙들어서, 크론이 첫 스냅샷을 쌓은 뒤에도 위젯이 최대 1시간 접힌
   채로 남는다(lib/newui/digest.ts 가 같은 이유로 쓰는 수법 — 던지면 캐시에
   남지 않고 다음 요청이 다시 시도한다).
   ------------------------------------------------------------------ */

/** "기록이 아직 없음" 신호 — 조회 실패와 구분해야 로그가 거짓말을 하지 않는다. */
const NO_ARCHIVE = "__nz_no_temperature_archive__";

type LatestTemperatures = Awaited<ReturnType<typeof listLatestTemperatures>>;

const loadLatestTemperatures = cache(
  unstable_cache(
    async (): Promise<LatestTemperatures> => {
      const res = await listLatestTemperatures(); // 조회 실패 시 throw (캐시 안 됨)
      if (!res.weekStart || res.rows.length === 0) throw new Error(NO_ARCHIVE);
      return res;
    },
    ["home-market-temp-latest-v1"],
    { revalidate: 3600 },
  ),
);

/** 4주 스파크라인용 이력. 실패는 던져서 캐시에 남기지 않는다(선 없이 렌더). */
const loadRegionHistory = cache(
  unstable_cache(
    (regionId: string) => listRegionTemperatureHistory(regionId, 4),
    ["home-market-temp-history-v1"],
    { revalidate: 3600 },
  ),
);

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

/* 웹14 — 4주 미니 스파크라인. 실측 주간 점수만 그린다(보간·외삽 없음 —
   기록이 2주 미만이면 선을 그리지 않는다). y 축은 0~100 고정이 아니라
   시계열 최소~최대 ±2 로 잡는다: 온도가 48→52 로 움직인 주는 0~100 축에서
   평평한 직선이 되어 "변화 없음"으로 잘못 읽힌다. 축을 밝히는 대신 숫자
   Δ가 옆에 이미 있으므로 막대는 방향 보조로만 쓴다. */
function Sparkline({ scores }: { scores: number[] }) {
  if (scores.length < 2) return null;
  const w = 44;
  const h = 14;
  const min = Math.min(...scores) - 2;
  const max = Math.max(...scores) + 2;
  const span = max - min || 1;
  const pts = scores
    .map((s, i) => {
      const x = (i / (scores.length - 1)) * (w - 2) + 1;
      const y = h - 1 - ((s - min) / span) * (h - 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      aria-hidden
      className="hidden shrink-0 lg:block"
    >
      <polyline
        points={pts}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-text-3"
      />
    </svg>
  );
}

export async function MarketTempWidget({ className }: { className?: string }) {
  let weekStart: string | null = null;
  let rows: LatestTemperatures["rows"] = [];
  try {
    const res = await loadLatestTemperatures();
    weekStart = res.weekStart;
    rows = res.rows;
  } catch (e) {
    /* 기록 없음(크론 미실행)과 조회 실패는 화면 결과가 같아도 원인이 다르다.
       로그에서 섞이면 "위젯이 안 보인다"를 추적할 수 없어 갈라 적는다. */
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === NO_ARCHIVE) {
      logger.warn("[home] 시장 온도 아카이브에 기록이 없어 위젯을 접습니다");
    } else {
      logger.error("[home] 시장 온도 위젯 조회 실패 — 위젯을 접습니다:", msg);
    }
    return null;
  }
  if (!weekStart || rows.length === 0) return null;

  // 가장 뜨거운 2곳 + 가장 차가운 1곳 — "지금 어디가 움직이나"의 최소 요약
  const hottest = rows.slice(0, 2);
  const coldest = rows.length > 2 ? [rows[rows.length - 1]] : [];
  const picks = [...hottest, ...coldest];

  /* 웹14 — 노출되는 지역(최대 3곳)만 4주 이력을 추가 조회한다. 실패해도
     위젯 본체는 살린다 — 스파크라인은 보조 시각화라 없으면 없이 그린다. */
  const historyByRegion = new Map<string, number[]>();
  try {
    const histories = await Promise.all(
      picks.map((r) => loadRegionHistory(r.current.regionId)),
    );
    picks.forEach((r, i) => {
      historyByRegion.set(
        r.current.regionId,
        histories[i].map((s) => s.score),
      );
    });
  } catch (e) {
    logger.error(
      "[home] 시장 온도 스파크라인 이력 조회 실패 — 선 없이 렌더:",
      e instanceof Error ? e.message : String(e),
    );
  }

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
              className="press flex items-center justify-between gap-2 border-b border-[#f0f3f8] py-[6px] text-xs no-underline last:border-0"
            >
              <span className="flex-1 truncate font-semibold text-text-1">
                {r.current.regionLabel}
              </span>
              <Sparkline scores={historyByRegion.get(r.current.regionId) ?? []} />
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
