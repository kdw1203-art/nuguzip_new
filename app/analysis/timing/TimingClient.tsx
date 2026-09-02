"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
// 서버 전용 체인이 있는 모듈들 — 타입만 가져온다(컴파일에서 소거).
import type { TrendResult, MarketTemp } from "@/lib/market/temperature";
import type { RegionMonthlyVolumeRow } from "@/lib/market/store";
import { Icon } from "@/app/components/Icon";
import { ToolHero, type HeroKpi } from "@/app/components/analysis/ToolHero";
import { TrendChart } from "@/app/components/viz/TrendChart";
import { Bars } from "@/app/components/viz/Bars";
import { Gauge } from "@/app/components/viz/Gauge";
import { Spark } from "@/app/components/viz/Spark";
import { CountUp } from "@/app/components/motion/CountUp";
import { SkBlock } from "@/app/components/ui/Skeleton";
import { TimingRegionSelect } from "./region-select";
import { TimingComplexPicker } from "./complex-picker";
import { AnalysisCrossLinks } from "../AnalysisCrossLinks";
import { pickRegionByAnyName } from "@/lib/regions/param";

/**
 * /analysis/timing 클라이언트 셸 (사용량 절감 13차 — ISR 전환의 클라이언트 절반).
 *
 * 서버(ISR)는 기본 지역 한 곳만 계산해 SSR 로 그린다. ?region= 은 마운트 후
 * location.search 에서 읽고, 지역 전환은 pushState + /api/timing(CDN 캐시)
 * 페치다 — auctions 와 같은 삼분할(ISR 기본 화면 + 캐시 API + 클라 상태).
 * 62개 지역 전량을 페이지에 실으면 재생성마다 124회 쿼리라 이 구조를 골랐다.
 *
 * 페치 실패는 "데이터 없음"과 구별해 그린다(0건이 아니라 조회 실패).
 */

export type TimingData = {
  trend: TrendResult | null;
  volume: RegionMonthlyVolumeRow[];
  temp: MarketTemp | null;
};

type RegionOption = { id: string; label: string };

function periodLabel(period: string): string {
  // "2025-07-01" → "25.07"
  const m = /^(\d{4})-(\d{2})/.exec(period);
  return m ? `${m[1].slice(2)}.${m[2]}` : period;
}

/** 이번 달 yyyymm — 서버 값으로 하이드레이션 후 마운트에서 재계산(월 경계 대비) */
function clientYyyymm(): string {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * [D62] `?region=` 을 **어느 말로 와도** 내 지역 목록에서 찾는다.
 *
 * 예전에는 받은 문자열을 그대로 지역 id 로 믿고 /api/timing?region= 에 보냈다.
 * 그런데 지도·홈은 "서울 강남구"(한글 이름)를, 실거래 화면은 "서울-강남구"
 * (슬러그)를 쓴다 — 그 링크를 타고 오면 API 가 그런 id 를 모르니 빈 화면이
 * 떴다. 화면끼리 잇는 링크가 조용히 죽어 있던 자리다.
 *
 * 목록(regions)은 이미 이 컴포넌트가 prop 으로 들고 있으므로 새 의존이 없다.
 */
function readRegionFromLocation(fallback: string, regions: RegionOption[]): string {
  const raw = (new URLSearchParams(window.location.search).get("region") ?? "").trim();
  if (!raw) return fallback;
  return pickRegionByAnyName(raw, regions)?.id ?? fallback;
}

export function TimingClient({
  regions,
  defaultRegionId,
  initialData,
  builtYyyymm,
}: {
  regions: RegionOption[];
  defaultRegionId: string;
  initialData: TimingData;
  builtYyyymm: string;
}) {
  const [regionId, setRegionId] = useState(defaultRegionId);
  const [data, setData] = useState<TimingData>(initialData);
  const [status, setStatus] = useState<"ok" | "loading" | "error">("ok");
  const [nowYm, setNowYm] = useState(builtYyyymm);
  /* 딥링크 ?complexId=/?apt= — SSR 은 없이 그리고, 마운트 후 읽어 피커를
     리마운트한다(initial* 는 마운트 시점에만 반영되므로 key 로 강제). */
  const [deep, setDeep] = useState<{ c: string | null; a: string | null }>({ c: null, a: null });
  const cache = useRef(new Map<string, TimingData>([[defaultRegionId, initialData]]));
  const reqSeq = useRef(0);

  const load = (id: string) => {
    const hit = cache.current.get(id);
    if (hit) {
      setData(hit);
      setStatus("ok");
      return;
    }
    const seq = ++reqSeq.current;
    setStatus("loading");
    fetch(`/api/timing?region=${encodeURIComponent(id)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: { ok: boolean } & TimingData) => {
        if (seq !== reqSeq.current) return; // 뒤늦게 온 이전 요청은 버린다
        if (!j.ok) throw new Error("not_ok");
        const d = { trend: j.trend, volume: j.volume, temp: j.temp };
        cache.current.set(id, d);
        setData(d);
        setStatus("ok");
      })
      .catch(() => {
        if (seq !== reqSeq.current) return;
        setStatus("error");
      });
  };

  useEffect(() => {
    setNowYm(clientYyyymm());
    const usp = new URLSearchParams(window.location.search);
    setDeep({ c: usp.get("complexId"), a: usp.get("apt") });
    const initial = readRegionFromLocation(defaultRegionId, regions);
    if (initial !== defaultRegionId) {
      setRegionId(initial);
      load(initial);
    } else if (!initialData.trend && !initialData.temp && initialData.volume.length === 0) {
      /* SSR 초깃값이 전부 빈 값이면 API 로 즉시 재조회 — 자기 회복.
         실측(2026-08-16): 강남 지수 94점·거래량 8개월이 DB 에 있는데도
         ISR 빌드/재생성이 빈 화면을 구웠고, 같은 계산을 하는 force-dynamic
         /api/timing 은 정상 응답했다. 원인(정적 생성 컨텍스트의 서비스 키)
         추적과 별개로, 사용자는 이 경로로 수백 ms 안에 실데이터를 본다.
         기본 지역에 정말 데이터가 없는 경우엔 API 도 같은 빈 값을 돌려주므로
         화면은 그대로 정직한 빈 상태다(추가 호출 1회는 CDN 30분 캐시). */
      cache.current.delete(defaultRegionId);
      load(defaultRegionId);
    }
    const onPop = () => {
      const id = readRegionFromLocation(defaultRegionId, regions);
      setRegionId(id);
      load(id);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectRegion = (id: string) => {
    if (id === regionId) return;
    setRegionId(id);
    window.history.pushState(
      null,
      "",
      id === defaultRegionId
        ? "/analysis/timing"
        : `/analysis/timing?region=${encodeURIComponent(id)}`,
    );
    load(id);
  };

  const selected = regions.find((r) => r.id === regionId) ?? regions[0];
  const { trend, volume, temp } = data;
  const loading = status === "loading";

  /* ── 차트 입력 ──────────────────────────────────────────────────────────
     예전엔 div 높이 %로 막대를 쌓고 색을 #1d4fd8 / #c9d4e5 로 박아 두었다.
     다크 모드에서 그 색이 그대로 나오고(토큰을 안 타서), 지수는 "선"이 아니라
     막대라 방향이 안 읽혔다. SVG 차트 컴포넌트로 옮기고 색은 currentColor 로
     계열 토큰을 타게 한다. */
  const idxValues = trend?.points.map((p) => p.value) ?? [];
  const idxLabels = trend?.points.map((p) => periodLabel(p.period)) ?? [];
  const volValues = volume.map((v) => v.count);
  const volLabels = volume.map((v) => `${v.month.slice(2, 4)}.${v.month.slice(4)}`);
  const lastVol = volume.length ? volume[volume.length - 1] : null;
  const prevVol = volume.length > 1 ? volume[volume.length - 2] : null;
  const volDeltaPct =
    lastVol && prevVol && prevVol.count > 0
      ? Math.round(((lastVol.count - prevVol.count) / prevVol.count) * 1000) / 10
      : null;

  /* 첫 화면이 "제목 → 빈 카드"였다. 이 도구가 내는 숫자를 먼저 세운다.
     값이 없으면 그 칸은 **아예 만들지 않는다**(빈 칸을 "—"로 채우지 않는다). */
  const kpis: HeroKpi[] = [];
  if (trend) {
    kpis.push({
      label: trend.periodType === "weekly" ? "최근 주 변동" : "최근 월 변동",
      value: (
        <CountUp
          value={trend.latestChangePct}
          decimals={2}
          prefix={trend.latestChangePct > 0 ? "+" : ""}
          suffix="%"
        />
      ),
      note: `${trend.points.length}구간 지수 기준`,
    });
    kpis.push({
      label: "기간 누적",
      value: (
        <CountUp
          value={trend.cumulativePct}
          decimals={1}
          prefix={trend.cumulativePct > 0 ? "+" : ""}
          suffix="%"
        />
      ),
      note: `${idxLabels[0] ?? ""} → ${idxLabels[idxLabels.length - 1] ?? ""}`,
    });
  }
  if (temp) {
    kpis.push({ label: "시장 온도", value: `${temp.score}/100`, note: temp.headline });
  }
  if (lastVol) {
    kpis.push({
      label: "최근 월 거래량",
      value: <CountUp value={lastVol.count} suffix="건" />,
      delta: volDeltaPct === null ? null : { pct: volDeltaPct, label: "전월" },
      note: "신고 지연으로 최근 2개월은 과소 집계",
    });
  }

  const heroChart = trend ? (
    <div className="rounded-[12px] border border-line bg-surface px-2 pb-1 pt-2">
      <TrendChart
        values={idxValues}
        labels={idxLabels}
        height={92}
        bands={3}
        ariaLabel={`${selected.label} 매매가격지수 ${idxValues.length}구간 추세`}
      />
    </div>
  ) : null;

  return (
    <>
      <ToolHero
        eyebrow="지역·시장 흐름"
        icon="trending-up"
        title="시세·타이밍 분석"
        lead={
          <>
            {selected.label}의 매매가격지수·거래량·시장 온도를 한 화면에서 봅니다. 모든
            수치는 실측이고, 없는 구간은 없다고 표시합니다.
          </>
        }
        kpis={kpis}
        chart={heroChart}
        toneClass="text-success"
        actions={
          <div className="flex w-full flex-wrap items-end gap-2">
            <TimingComplexPicker
              key={`${deep.c ?? ""}|${deep.a ?? ""}`}
              initialComplexId={deep.c}
              initialApt={deep.a}
              currentRegion={selected.id}
              onRegion={selectRegion}
            />
            <TimingRegionSelect
              options={regions}
              value={selected.id}
              disabled={loading}
              onChange={selectRegion}
            />
            {loading && (
              <span className="t-sub inline-flex items-center gap-1.5 font-bold text-primary">
                <span className="pulse-dot" style={{ color: "var(--brand-red)" }} />
                {selected.label} 불러오는 중
              </span>
            )}
          </div>
        }
        source={
          trend
            ? `한국부동산원 ${trend.periodType === "weekly" ? "주간" : "월간"} 매매가격지수 · 국토교통부 실거래 집계 · 규칙 기반 판정(참고용)`
            : "한국부동산원 지수 · 국토교통부 실거래 집계"
        }
      />

      {status === "error" ? (
        /* 조회 실패 — "데이터 없음"과 다른 사실이다. 캐시 API 실패는 no-store 라
           재시도가 의미 있다. */
        <div className="card mt-5 flex flex-col items-center gap-2 rounded-[14px] p-8 text-center">
          <p className="t-section text-ink">{selected.label} 분석을 불러오지 못했어요</p>
          <p className="t-sub text-text-3">
            데이터가 없는 게 아니라 조회에 실패한 거예요. 잠시 뒤 다시 시도해 주세요.
          </p>
          <button
            type="button"
            onClick={() => {
              cache.current.delete(selected.id);
              load(selected.id);
            }}
            className="btn-soft btn-md mt-1"
          >
            다시 시도
          </button>
        </div>
      ) : (
        <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_360px]">
          {/* ── 지수 추세 ── */}
          <div className="chart-card text-success lg:col-span-1" data-reveal="">
            <div className="chart-head">
              <span className="t-section text-ink">{selected.label} 매매가격지수</span>
              {trend && (
                <span className="chip chip-soft chip-pad t-caption">{trend.verdict}</span>
              )}
              <span className="t-caption ml-auto rounded border border-line px-1.5 py-px font-bold text-text-3">
                실데이터 기준
              </span>
            </div>
            {loading ? (
              <SkBlock h={168} />
            ) : trend ? (
              <>
                <TrendChart
                  values={idxValues}
                  labels={idxLabels}
                  height={168}
                  ariaLabel={`${selected.label} 매매가격지수 추세`}
                />
                <p className="t-sub text-text-1">{trend.detail}</p>
              </>
            ) : (
              <div className="rounded-[10px] bg-bg px-3 py-3">
                <p className="t-sub text-text-3">
                  {selected.label}의 지수 시계열이 아직 없어요. 다른 지역을 고르거나 수집이
                  쌓인 뒤 다시 확인해 주세요.
                </p>
              </div>
            )}
          </div>

          {/* ── 시장 온도 ── */}
          <div className="ai-panel flex flex-col gap-3 rounded-[14px] p-4" data-reveal="">
            <div className="flex items-center justify-between gap-2">
              <span className="t-section text-ai-text">시장 온도</span>
              <span className="t-caption rounded border border-line px-1.5 py-px font-bold text-ai-muted">
                규칙 기반 · 실데이터 입력
              </span>
            </div>
            {loading ? (
              <SkBlock h={120} />
            ) : temp ? (
              <>
                <div className="flex items-center gap-3">
                  <Gauge
                    value={temp.score}
                    label={String(temp.score)}
                    caption="50이 중립"
                    size={116}
                    className="shrink-0 text-ai-accent"
                  />
                  <p className="t-sub min-w-0 flex-1 text-ai-text">
                    <b className="text-ai-accent">{temp.headline}</b>
                    <br />
                    지수 모멘텀(±25)과 거래량 추이(±25)를 50점 기준에 더한 값입니다.
                  </p>
                </div>
                <div className="flex flex-col gap-1">
                  {temp.inputs.map((s) => (
                    <div
                      key={s.label}
                      className="ai-row"
                    >
                      <span className="t-sub shrink-0 text-ai-muted">{s.label}</span>
                      <span
                        className={`t-sub t-num text-right ${s.accent ? "text-ai-accent" : "text-ai-text"}`}
                      >
                        {s.value}
                      </span>
                    </div>
                  ))}
                </div>
                {temp.volumeNote && (
                  <p className="t-caption text-ai-muted">{temp.volumeNote}</p>
                )}
                <div className="mt-auto flex flex-wrap gap-2 pt-1">
                  <Link
                    href="/methodology#temperature"
                    className="t-sub font-bold text-ai-accent no-underline"
                  >
                    계산 공식 ›
                  </Link>
                  <Link
                    href={`/analysis/temperature/${selected.id}`}
                    className="t-sub font-bold text-ai-accent no-underline"
                  >
                    주간 기록 ›
                  </Link>
                </div>
              </>
            ) : (
              <p className="t-sub text-ai-muted">
                이 지역은 지수 시계열이 아직 없어 온도를 계산할 수 없어요.
              </p>
            )}
          </div>

          {/* ── 월별 거래량 ── */}
          <div className="chart-card text-primary" data-reveal="">
            <div className="chart-head">
              <span className="t-section text-ink">{selected.label} 월별 매매 거래량</span>
              {lastVol && (
                <span className="t-num t-sub text-primary">
                  최근 {lastVol.count.toLocaleString("ko-KR")}건
                </span>
              )}
              <span className="t-caption ml-auto rounded border border-line px-1.5 py-px font-bold text-text-3">
                국토교통부 실거래
              </span>
            </div>
            {loading ? (
              <SkBlock h={140} />
            ) : volume.length > 0 ? (
              <>
                <Bars
                  values={volValues}
                  labels={volLabels}
                  height={140}
                  valueSuffix="건"
                  ariaLabel={`${selected.label} 월별 매매 거래량`}
                />
                <p className="t-caption text-text-3">
                  이번 달과 직전 월은 신고 지연(계약 후 30일 이내 신고)으로 실제보다 적게
                  보일 수 있어요. 가장 진한 막대가 이 구간의 최다 거래월입니다.
                  {nowYm && volume.some((v) => v.month >= nowYm) ? " (마지막 칸이 진행 중인 달)" : ""}
                </p>
              </>
            ) : (
              <div className="rounded-[10px] bg-bg px-3 py-3">
                <p className="t-sub text-text-3">
                  월별 거래량 집계가 아직 없어요. 실거래 수집이 쌓이면 자동으로 표시됩니다.
                </p>
              </div>
            )}
          </div>

          {/* ── 알림 ── */}
          <div className="card tile flex flex-col gap-2 rounded-[14px] p-4" data-reveal="">
            <span className="tile-ico flex h-9 w-9 items-center justify-center rounded-[11px] bg-primary-soft text-primary">
              <Icon name="bell" size={17} />
            </span>
            <span className="t-section text-ink">이 지역 알림 받기</span>
            <p className="t-sub text-text-2">
              {selected.label}의 실거래 등록·시세 변동이 생기면 알려 드려요.
            </p>
            {trend && (
              <span className="mt-1 text-success">
                <Spark values={idxValues} width={140} height={26} smooth />
              </span>
            )}
            <Link href="/notifications" className="btn-soft btn-md mt-auto no-underline">
              알림 설정 열기
            </Link>
          </div>
        </div>
      )}

      {/* #411 — 도구 간 이어가기: 화면의 **현재 선택 지역** 그대로. */}
      <div className="mt-5">
        <AnalysisCrossLinks
          current="timing"
          regionLabel={selected.label}
          regionFor={{
            scenario: selected.id,
            map: selected.label.split(" ").pop() ?? selected.label,
          }}
          note={{ label: "알림 기준 설정", href: "/notifications" }}
        />
      </div>
    </>
  );
}
