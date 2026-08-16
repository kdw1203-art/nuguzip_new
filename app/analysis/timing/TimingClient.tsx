"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
// 서버 전용 체인이 있는 모듈들 — 타입만 가져온다(컴파일에서 소거).
import type { TrendResult, MarketTemp } from "@/lib/market/temperature";
import type { RegionMonthlyVolumeRow } from "@/lib/market/store";
import { TimingRegionSelect } from "./region-select";
import { TimingComplexPicker } from "./complex-picker";

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

function readRegionFromLocation(fallback: string): string {
  const raw = (new URLSearchParams(window.location.search).get("region") ?? "").trim();
  return raw || fallback;
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
    const initial = readRegionFromLocation(defaultRegionId);
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
      const id = readRegionFromLocation(defaultRegionId);
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
  const maxVolCount = Math.max(1, ...volume.map((v) => v.count));

  return (
    <>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h1 className="rise-in text-[22px] font-extrabold text-ink">시세·타이밍 분석</h1>
        <div className="flex flex-wrap items-end gap-2">
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
            disabled={status === "loading"}
            onChange={selectRegion}
          />
        </div>
      </div>

      {status === "error" ? (
        /* 조회 실패 — "데이터 없음"과 다른 사실이다. 캐시 API 실패는 no-store 라
           재시도가 의미 있다. */
        <div className="rise-in mb-4 card flex flex-col items-center gap-2 rounded-[20px] p-8 text-center">
          <p className="text-sm font-bold text-ink">
            {selected.label} 분석을 불러오지 못했어요
          </p>
          <p className="text-xs leading-[1.6] text-text-3">
            데이터가 없는 게 아니라 조회에 실패한 거예요. 잠시 뒤 다시 시도해 주세요.
          </p>
          <button
            type="button"
            onClick={() => {
              cache.current.delete(selected.id);
              load(selected.id);
            }}
            className="btn-soft mt-1 rounded-lg px-4 py-2 text-xs"
          >
            다시 시도
          </button>
        </div>
      ) : (
        <div className={status === "loading" ? "opacity-60 transition-opacity" : ""}>
          {/* ── 실데이터 영역: 실제 지수 시리즈 기반 추세·모멘텀 판정 ── */}
          <div className="rise-in mb-4 card flex flex-col gap-3 rounded-[20px] p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-base font-extrabold text-ink">
                {selected.label} 매매가격지수 추세
              </div>
              <span className="rounded border border-line px-1.5 py-px text-[9px] font-bold text-text-3">
                실데이터 기준
              </span>
            </div>

            {trend ? (
              <>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="rounded-[10px] bg-primary-soft px-3 py-1.5 text-sm font-extrabold text-primary">
                    {trend.verdict}
                  </span>
                  <span className="text-xs text-text-2">
                    최근 변동 {trend.latestChangePct >= 0 ? "▲" : "▼"}
                    {Math.abs(trend.latestChangePct).toFixed(2)}% · 기간 누적{" "}
                    {trend.cumulativePct >= 0 ? "+" : ""}
                    {trend.cumulativePct.toFixed(1)}%
                    {trend.periodType === "weekly" ? " (주간 지수 대체)" : " (12개월 지수)"}
                  </span>
                </div>
                <div className="text-[13px] leading-[1.6] text-text-1">{trend.detail}</div>

                {/* 지수 미니 차트 (실데이터) */}
                <div className="flex h-[120px] items-end gap-1 border-b border-line pb-px">
                  {(() => {
                    const vals = trend.points.map((p) => p.value);
                    const min = Math.min(...vals);
                    const max = Math.max(...vals);
                    const span = max - min || 1;
                    return trend.points.map((p, i) => {
                      const h = 18 + Math.round(((p.value - min) / span) * 82);
                      const isLast = i === trend.points.length - 1;
                      return (
                        <div
                          key={p.period}
                          title={`${p.period} · ${p.value.toFixed(1)}`}
                          className="flex-1 rounded-t-[3px]"
                          style={{
                            height: `${h}%`,
                            background: isLast ? "#1d4fd8" : "#c9d4e5",
                          }}
                        />
                      );
                    });
                  })()}
                </div>
                <div className="flex justify-between text-[10px] text-text-3">
                  <span>{periodLabel(trend.points[0].period)}</span>
                  <span>{periodLabel(trend.points[trend.points.length - 1].period)}</span>
                </div>
                <div className="text-[9px] leading-[1.5] text-text-3">
                  규칙 기반 판정 · 본 분석은 참고용이며 투자 판단의 책임은 이용자에게 있습니다.
                </div>
              </>
            ) : (
              <div className="rounded-[12px] bg-bg px-3 py-3 text-xs text-text-3">
                {selected.label}의 지수 시계열 데이터가 아직 없어요. 다른 지역을 선택하거나
                데이터 수집 후 다시 확인해 주세요.
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
            {/* ── 월별 거래량 (실데이터) ── */}
            <div className="rise-in-1 card flex flex-col gap-4 rounded-[20px] p-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-base font-extrabold text-ink">
                  {selected.label} 월별 매매 거래량
                </div>
                <span className="rounded border border-line px-1.5 py-px text-[9px] font-bold text-text-3">
                  실데이터 기준
                </span>
              </div>
              {volume.length > 0 ? (
                <>
                  <div className="flex h-[200px] items-end gap-2 border-b border-line pb-px">
                    {volume.map((v) => {
                      const h = 8 + Math.round((v.count / maxVolCount) * 88);
                      const isCurrentMonth = v.month >= nowYm;
                      return (
                        <div key={v.month} className="flex flex-1 flex-col items-center gap-1">
                          <span className="text-[10px] font-bold text-text-2">
                            {v.count.toLocaleString("ko-KR")}
                          </span>
                          <div
                            title={`${v.month.slice(0, 4)}.${v.month.slice(4)} · ${v.count}건`}
                            className="w-full rounded-t-[4px]"
                            style={{
                              height: `${h}%`,
                              background: isCurrentMonth ? "#c9d4e5" : "#1d4fd8",
                            }}
                          />
                          <span className="text-[10px] text-text-3">
                            {v.month.slice(2, 4)}.{v.month.slice(4)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="text-[10px] leading-[1.5] text-text-3">
                    국토교통부 실거래 집계 · 이번 달(연한 막대)과 직전 월은 신고 지연(계약 후
                    30일 이내 신고)으로 실제보다 적게 표시될 수 있어요.
                  </div>
                </>
              ) : (
                <div className="rounded-[12px] bg-bg px-3 py-3 text-xs text-text-3">
                  {selected.label}의 월별 거래량 집계가 아직 없어요. 실거래 수집이 쌓이면
                  자동으로 표시됩니다.
                </div>
              )}
            </div>

            {/* 우측 */}
            <div className="flex flex-col gap-4">
              {temp ? (
                <div className="rise-in-2 ai-panel flex flex-col gap-3 rounded-[20px] p-[22px] shadow-[0_14px_36px_rgba(16,28,54,.22)]">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="ai-chip h-[22px] w-[22px] rounded-[7px] text-[11px]">AI</span>
                      <span className="text-sm font-extrabold text-white">시장 온도</span>
                    </div>
                    <span className="rounded border border-[rgba(255,255,255,.25)] px-1.5 py-px text-[9px] font-bold text-ai-muted">
                      규칙 기반 · 실데이터 입력
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-[5px] text-base font-extrabold text-ai-accent"
                      style={{
                        borderColor: "rgba(126,162,255,.25)",
                        borderTopColor: "#7ea2ff",
                        borderRightColor: "#7ea2ff",
                      }}
                    >
                      {temp.score}
                    </div>
                    <div className="text-xs leading-[1.6] text-ai-text">
                      {selected.label} 시장 온도 {temp.score}/100 —{" "}
                      <b className="text-white">{temp.headline}</b>. 50이 중립이며, 아래
                      실측 지표에서 계산됩니다.
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {temp.inputs.map((s) => (
                      <div
                        key={s.label}
                        className="flex justify-between gap-2 rounded-lg bg-[rgba(255,255,255,.07)] px-3 py-2 text-xs"
                      >
                        <span className="shrink-0 text-ai-muted">{s.label}</span>
                        <span className={`text-right font-bold ${s.accent ? "text-ai-accent" : "text-ai-text"}`}>
                          {s.value}
                        </span>
                      </div>
                    ))}
                  </div>
                  {temp.volumeNote && (
                    <div className="text-[10px] leading-[1.5] text-ai-muted">{temp.volumeNote}</div>
                  )}
                  <div className="text-[9px] leading-[1.5] text-ai-muted">
                    지수 모멘텀(±25점)과 거래량 추이(±25점)를 50점 기준에 더한 값입니다.
                    매수·매도 추천이 아니며, 본 분석은 참고용으로 투자 판단의 책임은
                    이용자에게 있습니다.{" "}
                    <Link href="/methodology#temperature" className="font-bold text-ai-accent no-underline">
                      계산 공식 보기 ›
                    </Link>{" "}
                    <Link
                      href={`/analysis/temperature/${selected.id}`}
                      className="font-bold text-ai-accent no-underline"
                    >
                      주간 기록 보기 ›
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="rise-in-2 card rounded-[20px] p-5 text-xs text-text-3">
                  이 지역은 지수 시계열이 아직 없어 시장 온도를 계산할 수 없어요.
                </div>
              )}

              <div className="rise-in-3 card flex flex-col gap-2 rounded-[20px] p-5">
                <div className="text-sm font-extrabold text-ink">알림 설정</div>
                <div className="text-[12px] leading-[1.6] text-text-2">
                  관심 지역의 실거래 등록·시세 변동 알림을 받아보세요.
                </div>
                <Link
                  href="/notifications"
                  className="btn-soft mt-1 rounded-[10px] p-2.5 text-center text-xs no-underline"
                >
                  알림 설정 열기
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
