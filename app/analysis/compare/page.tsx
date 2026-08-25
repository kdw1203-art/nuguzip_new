"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PageShell } from "../../components/PageShell";
import { AnalysisCrossLinks } from "../AnalysisCrossLinks";
import { ComplexPicker } from "../ComplexPicker";
import {
  addToCompareTray,
  COMPARE_TRAY_MAX,
  listCompareTray,
  mergeServerCompareTray,
  removeCompareItemFromServer,
  removeFromCompareTray,
  subscribeCompareTray,
  type CompareTrayItem,
} from "@/lib/newui/compare-tray";
import { complexHrefFromId } from "@/lib/seo/complex-slug";
import { Radar } from "@/app/components/viz/Radar";
import { SkTable } from "@/app/components/ui/Skeleton";

/* ---------- 단지 선택기 → 비교 트레이에 담기 (검색·지도·딥링크 공용) ---------- */

/* 항목별 최고/최저를 표에서 배지로 알린다 — 숫자 5열을 눈으로 비교하던 자리.
   동점이면 둘 다 표시한다(임의로 하나를 고르면 그건 사실이 아니다). */
function bestOf<T>(items: readonly T[], pick: (x: T) => number | null, dir: "max" | "min"): Set<number> {
  const vals = items.map(pick);
  const usable = vals.filter((v): v is number => v !== null && Number.isFinite(v));
  if (usable.length < 2) return new Set();
  const target = dir === "max" ? Math.max(...usable) : Math.min(...usable);
  const out = new Set<number>();
  vals.forEach((v, i) => {
    if (v !== null && v === target) out.add(i);
  });
  return out;
}

function WinBadge({ label }: { label: string }) {
  return (
    <span className="t-caption ml-1 rounded bg-success-soft px-1 py-px font-extrabold text-success">
      {label}
    </span>
  );
}

function ComparePickerSection() {
  const [note, setNote] = useState<string | null>(null);

  return (
    <div className="rise-in card flex flex-col gap-2 rounded-2xl px-[18px] py-4">
      <div className="t-body font-extrabold text-ink">비교할 단지 담기</div>
      <ComplexPicker
        label="검색해서 최대 5개까지 담기"
        placeholder="단지명으로 검색 (예: 공작아파트)"
        clearOnSelect
        showChip={false}
        onSelect={(c) => {
          const r = addToCompareTray({
            id: c.id,
            name: c.name,
            region: c.region || c.regionLabel || undefined,
          });
          setNote(
            r.ok
              ? `${c.name} 담았어요`
              : r.reason === "full"
                ? `최대 ${COMPARE_TRAY_MAX}개까지만 담을 수 있어요`
                : "담기에 실패했어요",
          );
        }}
      />
      {note && <div className="t-sub font-bold text-primary">{note}</div>}
    </div>
  );
}

/* ---------- 내가 담은 후보 (localStorage 비교 트레이 + #46 서버 병합) ---------- */

function CompareTraySection() {
  const [items, setItems] = useState<CompareTrayItem[]>([]);

  useEffect(() => {
    const sync = () => setItems(listCompareTray());
    sync();
    // #46 로그인 상태면 서버 user_watchlist 목록을 로컬 트레이에 병합 (실패·비로그인 시 로컬만)
    let cancelled = false;
    void mergeServerCompareTray().then((merged) => {
      if (!cancelled) setItems(merged);
    });
    const unsubscribe = subscribeCompareTray(sync);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return (
    <div className="rise-in card flex flex-col gap-2 rounded-2xl px-[18px] py-4">
      <div className="t-body font-extrabold text-ink">
        내가 담은 후보 {items.length}개
        <span className="ml-1 font-semibold text-text-3">
          / 최대 {COMPARE_TRAY_MAX}개
        </span>
      </div>
      {items.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {items.map((item) => (
            <span
              key={item.id}
              className="chip chip-soft flex items-center gap-1.5 px-[11px] py-[5px] t-sub"
            >
              <Link href={`/complex/${encodeURIComponent(item.id)}`}>
                {item.name}
                {item.region ? ` · ${item.region}` : ""}
              </Link>
              <button
                type="button"
                aria-label={`${item.name} 비교에서 빼기`}
                onClick={() => {
                  setItems(removeFromCompareTray(item.id));
                  removeCompareItemFromServer(item.id); // #46 서버 목록에서도 제거
                }}
                className="font-bold text-text-3"
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      ) : (
        <div className="t-sub text-text-3">
          아직 담은 후보가 없어요 — 단지 화면의 &quot;비교 담기&quot;로 최대{" "}
          {COMPARE_TRAY_MAX}개까지 담을 수 있어요.
        </div>
      )}
      {/* [AI-22] 트레이 → AI 비교 해석 — 같은 후보로 워크벤치 비교 도구를 연다 */}
      {items.length >= 2 && (
        <Link
          href={`/analysis/ai/ai-compare?ids=${encodeURIComponent(items.slice(0, 3).map((i) => i.id).join(","))}`}
          className="self-start rounded-[10px] bg-primary px-3.5 py-2 t-sub font-bold text-white no-underline"
        >
          이 후보들로 AI 비교 해석 ›
        </Link>
      )}
    </div>
  );
}

/* ---------- 단지별 실거래 비교표 (POST /api/analysis/complex-compare) ---------- */

type CompareItem = {
  id: string;
  name: string;
  region: string;
  hasData: boolean;
  avg6mKrw: number | null;
  avgPyeong6mKrw: number | null;
  count6m: number;
  count12m: number;
  latest: { ym: string; amountKrw: number; areaM2: number | null; floor: number | null } | null;
};

function fmtEok(krw: number | null): string {
  if (krw === null) return "—";
  const e = krw / 100_000_000;
  return `${(e >= 10 ? e.toFixed(1) : e.toFixed(2)).replace(/\.?0+$/, "")}억`;
}

function fmtManwon(krw: number | null): string {
  if (krw === null) return "—";
  return `${Math.round(krw / 10_000).toLocaleString("ko-KR")}만`;
}

function ratio(v: number | null, max: number): number {
  if (v === null || !Number.isFinite(v) || max <= 0) return 0;
  return Math.min(1, Math.max(0.06, v / max));
}

function pctOf(v: number | null, max: number): string {
  if (v === null || !Number.isFinite(v) || max <= 0) return "0%";
  return `${Math.round((v / max) * 100)}%`;
}

/** 최근 거래가 얼마나 최근인지 0~1 (12개월 전=0, 이번 달=1). 없으면 0. */
function recencyRatio(ym: string | null): number {
  if (!ym || !/^\d{6}$/.test(ym)) return 0;
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(4));
  const now = new Date();
  const months = (now.getFullYear() - y) * 12 + (now.getMonth() + 1 - m);
  return Math.min(1, Math.max(0, 1 - months / 12));
}

function fmtYm(ym: string): string {
  return /^\d{6}$/.test(ym) ? `${ym.slice(2, 4)}.${ym.slice(4)}` : ym;
}

/** 트레이에 담은 단지들의 실거래 요약 비교표.
    예전 이 자리에는 "단지별 항목 비교표는 준비 중이에요" 카드가 있었다. */
function ComplexCompareTable() {
  const [ids, setIds] = useState<string[] | null>(null);
  const [items, setItems] = useState<CompareItem[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const sync = () => setIds(listCompareTray().map((t) => t.id));
    sync();
    return subscribeCompareTray(sync);
  }, []);

  const idsKey = ids === null ? "" : ids.join("|");

  useEffect(() => {
    if (ids === null) return;
    if (ids.length === 0) {
      setItems(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const res = await fetch("/api/analysis/complex-compare", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: idsKey.split("|") }),
        });
        const data = (await res.json().catch(() => null)) as { items?: CompareItem[] } | null;
        if (!cancelled) setItems(res.ok && Array.isArray(data?.items) ? data.items : null);
      } catch {
        if (!cancelled) setItems(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  /* 표의 셀 배경 막대와 "최저·최다" 배지를 위한 파생값. 값이 있는 단지가
     2곳 미만이면 비교 자체가 성립하지 않아 배지도 안 붙는다. */
  const withData = useMemo(() => (items ?? []).filter((i) => i.hasData), [items]);
  const maxAvg = Math.max(0, ...withData.map((i) => i.avg6mKrw ?? 0));
  const maxPyeong = Math.max(0, ...withData.map((i) => i.avgPyeong6mKrw ?? 0));
  const maxCount = Math.max(0, ...withData.map((i) => i.count12m));
  const cheapest = bestOf(items ?? [], (i) => (i.hasData ? i.avg6mKrw : null), "min");
  const cheapestPyeong = bestOf(items ?? [], (i) => (i.hasData ? i.avgPyeong6mKrw : null), "min");
  const mostActive = bestOf(items ?? [], (i) => (i.hasData ? i.count12m : null), "max");

  const RADAR_TONES = ["text-primary", "text-success", "text-warning"] as const;
  const radar = useMemo(
    () =>
      withData.slice(0, 3).map((it, i) => ({
        name: it.name,
        toneClass: RADAR_TONES[i] ?? "text-primary",
        axes: [
          { key: "avg", label: "평균가", ratio: ratio(it.avg6mKrw, maxAvg) },
          { key: "pyeong", label: "평당가", ratio: ratio(it.avgPyeong6mKrw, maxPyeong) },
          { key: "c12", label: "12개월 거래", ratio: ratio(it.count12m, maxCount) },
          { key: "c6", label: "최근 6개월", ratio: ratio(it.count6m, Math.max(1, ...withData.map((x) => x.count6m))) },
          { key: "recent", label: "최근성", ratio: recencyRatio(it.latest?.ym ?? null) },
        ],
      })),
    [withData, maxAvg, maxPyeong, maxCount],
  );

  if (!ids || ids.length === 0) {
    return (
      <div className="card flex flex-col gap-1.5 rounded-[14px] p-4">
        <div className="t-section text-ink">단지별 실거래 비교표</div>
        <div className="t-sub text-text-3">
          위에서 단지를 담으면 최근 6개월 평균가·평당가·거래량을 나란히 비교해 드려요.
        </div>
      </div>
    );
  }

  return (
    <div className="card flex flex-col gap-3 rounded-[14px] p-4" data-reveal="">
      <div className="chart-head">
        <span className="t-section text-ink">단지별 실거래 비교표</span>
        <span className="t-caption ml-auto rounded border border-line px-1.5 py-px font-bold text-text-3">
          실데이터 기준
        </span>
      </div>
      {loading && !items ? (
        /* 예전엔 "집계하는 중…" 한 줄이라 표가 나타날 때 화면이 통째로 튀었다 */
        <SkTable rows={Math.min(4, ids.length)} />
      ) : items ? (
        <>
          {/* 성격 비교 — 표는 항목별 우열은 보여 주지만 "어떤 단지인가"는 안 보여 준다.
              값이 있는 단지가 2곳 이상일 때만 그린다(한 곳짜리 레이더는 의미 없다). */}
          {radar.length >= 2 && (
            <div className="flex flex-wrap items-center justify-center gap-4 rounded-[12px] bg-bg p-3">
              <Radar series={radar} size={200} />
              <ul className="flex flex-col gap-1.5">
                {radar.map((r) => (
                  <li key={r.name} className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${r.toneClass}`} style={{ background: "currentColor" }} />
                    <span className="t-sub font-bold text-ink">{r.name}</span>
                  </li>
                ))}
                <li className="t-caption max-w-[220px] text-text-3">
                  각 축은 담긴 단지들 사이의 상대 위치입니다(가장 큰 값이 바깥). 절대
                  수치는 아래 표에서 보세요.
                </li>
              </ul>
            </div>
          )}

          <div className="overflow-x-auto">
            <div className="min-w-[620px]">
              <div className="t-sub grid grid-cols-[1.5fr_1fr_1fr_0.8fr_1.3fr] gap-2 border-b border-divider pb-2 font-bold text-text-3">
                <span>단지</span>
                <span className="text-center">6개월 평균가</span>
                <span className="text-center">평당가 (6개월)</span>
                <span className="text-center">거래 6/12개월</span>
                <span className="text-center">최근 거래</span>
              </div>
              {items.map((it, idx) => (
                <div
                  key={it.id}
                  className="row-hl grid grid-cols-[1.5fr_1fr_1fr_0.8fr_1.3fr] items-center gap-2 border-b border-divider py-2.5"
                >
                  <span className="t-sub font-bold text-ink">
                    <Link href={complexHrefFromId(it.id)} className="no-underline">
                      {it.name}
                    </Link>
                    <span className="t-caption ml-1 font-semibold text-text-3">{it.region}</span>
                  </span>
                  {it.hasData ? (
                    <>
                      <span
                        className="cell-bar t-sub t-num text-center text-primary"
                        style={{ ["--w" as string]: pctOf(it.avg6mKrw, maxAvg) }}
                      >
                        {fmtEok(it.avg6mKrw)}
                        {cheapest.has(idx) && <WinBadge label="최저" />}
                      </span>
                      <span
                        className="cell-bar t-sub t-num text-center text-primary"
                        style={{ ["--w" as string]: pctOf(it.avgPyeong6mKrw, maxPyeong) }}
                      >
                        {fmtManwon(it.avgPyeong6mKrw)}
                        {cheapestPyeong.has(idx) && <WinBadge label="최저" />}
                      </span>
                      <span
                        className="cell-bar t-sub t-num text-center text-success"
                        style={{ ["--w" as string]: pctOf(it.count12m, maxCount) }}
                      >
                        {it.count6m}/{it.count12m}건
                        {mostActive.has(idx) && <WinBadge label="최다" />}
                      </span>
                      <span className="t-sub text-center text-text-2">
                        {it.latest
                          ? `${fmtYm(it.latest.ym)} · ${fmtEok(it.latest.amountKrw)}${
                              it.latest.areaM2 ? ` · ${Math.round(it.latest.areaM2)}㎡` : ""
                            }${it.latest.floor ? ` · ${it.latest.floor}층` : ""}`
                          : "—"}
                      </span>
                    </>
                  ) : (
                    <span className="t-sub col-span-4 text-center text-text-3">
                      최근 12개월 실거래 없음
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
          <p className="t-caption text-text-3">
            국토교통부 실거래 기준(해제 신고분 제외) · 면적·타입 구분 없는 단순 평균이므로
            같은 단지라도 평형 구성에 따라 체감과 다를 수 있어요. &ldquo;최저·최다&rdquo;
            배지는 담긴 단지들 사이의 비교일 뿐 좋고 나쁨의 판정이 아닙니다.
          </p>
        </>
      ) : (
        <p className="t-sub text-text-3">집계에 실패했어요. 잠시 후 다시 시도해 주세요.</p>
      )}
    </div>
  );
}

/* ---------- 지역 실시세 병합 + 종합 코멘트 (POST /api/ai/compare-summary) ---------- */

type RegionSnapshotItem = {
  regionId: string;
  regionName: string;
  period: string;
  source: string;
  avgSaleLabel: string | null;
  saleChangeMonthly: number | null;
  jeonseRatio: number | null;
};

type SummaryState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "empty" }
  | { kind: "limited"; message: string }
  | { kind: "error"; message: string }
  | {
      kind: "done";
      items: RegionSnapshotItem[];
      comment: string;
      mode: "llm" | "rule";
      disclaimer: string;
    };

function deltaLabel(pct: number | null): { text: string; cls: string } {
  if (pct === null) return { text: "—", cls: "text-text-3" };
  if (pct > 0) return { text: `▲ ${pct.toFixed(1)}%`, cls: "text-danger" };
  if (pct < 0) return { text: `▼ ${Math.abs(pct).toFixed(1)}%`, cls: "text-primary" };
  return { text: "— 0.0%", cls: "text-text-3" };
}

/** 비교 트레이의 후보 지역 실시세 요약 — "요약 생성" 버튼을 눌렀을 때만 호출 */
function RegionMarketSummary() {
  const [state, setState] = useState<SummaryState>({ kind: "idle" });
  const [trayItems, setTrayItems] = useState<CompareTrayItem[] | null>(null);

  useEffect(() => {
    const sync = () => setTrayItems(listCompareTray());
    sync();
    return subscribeCompareTray(sync);
  }, []);

  const regions = [
    ...new Set((trayItems ?? []).map((t) => (t.region ?? "").trim()).filter(Boolean)),
  ];

  const generate = async () => {
    if (state.kind === "loading" || regions.length === 0) return;
    setState({ kind: "loading" });
    try {
      const res = await fetch("/api/ai/compare-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ regions }),
      });
      const data = (await res.json().catch(() => null)) as {
        error?: string;
        items?: RegionSnapshotItem[];
        comment?: string;
        mode?: string;
        disclaimer?: string;
      } | null;
      if (res.status === 429) {
        setState({
          kind: "limited",
          message:
            data?.error ?? "요약 생성 사용량(시간당 10회)을 모두 썼어요. 잠시 후 다시 확인해 주세요.",
        });
        return;
      }
      if (!res.ok) {
        setState({
          kind: "error",
          message: data?.error ?? "요약 생성에 실패했어요. 잠시 후 다시 시도해 주세요.",
        });
        return;
      }
      if (!data || !Array.isArray(data.items) || data.items.length === 0) {
        setState({ kind: "empty" });
        return;
      }
      setState({
        kind: "done",
        items: data.items,
        comment: data.comment ?? "",
        mode: data.mode === "llm" ? "llm" : "rule",
        disclaimer:
          data.disclaimer ?? "본 분석은 참고용이며 투자 판단의 책임은 이용자에게 있습니다",
      });
    } catch {
      setState({
        kind: "error",
        message: "네트워크 오류가 발생했어요. 잠시 후 다시 시도해 주세요.",
      });
    }
  };

  return (
    <div className="rise-in-2 card flex flex-col gap-3 rounded-[20px] p-[22px]">
      <div className="flex items-center justify-between gap-2">
        <div className="t-section text-ink">
          후보 지역 실시세 스냅샷
        </div>
        {regions.length > 0 && state.kind !== "loading" && (
          <button
            type="button"
            onClick={generate}
            className="btn-primary rounded-[10px] px-3 py-1.5 text-xs font-bold"
          >
            {state.kind === "done" ? "요약 다시 생성" : "요약 생성"}
          </button>
        )}
      </div>

      {regions.length === 0 ? (
        <div className="t-sub text-text-3">
          아직 담은 후보가 없어요. 위에서 단지를 담으면 후보 지역의 국토교통부 실거래
          기반 시세 스냅샷과 종합 코멘트를 만들어 드려요.
        </div>
      ) : state.kind === "idle" ? (
        <div className="t-sub text-text-3">
          담은 후보 {regions.length}개 지역의 시세 스냅샷을 준비했어요. &quot;요약
          생성&quot; 버튼을 누르면 지역 실시세와 종합 코멘트를 불러와요.
        </div>
      ) : state.kind === "loading" ? (
        <div className="text-xs text-text-3">지역 시세를 불러오는 중…</div>
      ) : state.kind === "empty" ? (
        <div className="t-sub text-text-3">
          담은 후보 지역의 실시세 데이터가 아직 없어요. 시세 수집 후 다시 시도해 주세요.
        </div>
      ) : state.kind === "limited" || state.kind === "error" ? (
        <div className="rounded-[12px] bg-danger-soft px-3 py-2.5 text-xs font-bold text-danger">
          {state.message}
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <div className="min-w-[520px]">
              <div className="grid grid-cols-[1.4fr_1fr_1fr_1fr] gap-2 border-b border-divider pb-2 t-sub font-bold text-text-3">
                <span>지역 (기준월)</span>
                <span className="text-center">평균 매매가</span>
                <span className="text-center">전월 대비</span>
                <span className="text-center">전세가율</span>
              </div>
              {state.items.map((it) => {
                const d = deltaLabel(it.saleChangeMonthly);
                return (
                  <div
                    key={it.regionId}
                    className="grid grid-cols-[1.4fr_1fr_1fr_1fr] items-center gap-2 border-b border-divider py-2.5 text-xs"
                  >
                    <span className="font-bold text-ink">
                      {it.regionName}
                      <span className="ml-1 t-caption font-semibold text-text-3">
                        {it.period} · {it.source.toUpperCase()}
                      </span>
                    </span>
                    <span className="text-center font-extrabold text-text-1">
                      {it.avgSaleLabel ?? "—"}
                    </span>
                    <span className={`text-center font-bold ${d.cls}`}>{d.text}</span>
                    <span className="text-center font-bold text-text-1">
                      {it.jeonseRatio !== null ? `${it.jeonseRatio.toFixed(0)}%` : "—"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {state.comment && (
            <div className="ai-panel flex flex-col gap-2 rounded-2xl p-[18px]">
              <div className="flex items-start gap-3">
                <span className="ai-chip h-[22px] w-[22px] shrink-0 rounded-[7px] t-sub">
                  AI
                </span>
                <div className="flex-1 text-xs leading-[1.65] text-ai-text">
                  {state.comment}
                </div>
                <span className="shrink-0 rounded border border-[rgba(255,255,255,.25)] px-1.5 py-px t-caption font-bold text-ai-muted">
                  {state.mode === "llm" ? "AI 생성" : "규칙 기반 요약"}
                </span>
              </div>
              <div className="t-caption text-ai-muted">
                {state.disclaimer}.
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function ComparePage() {
  return (
    <PageShell breadcrumb="AI 분석 › 단지 비교">
      <h1 className="sr-only">단지 비교</h1>
      <div className="flex flex-col gap-3.5">
        {/* 단지 선택기 → 비교 트레이 (검색·지도·?complexId=/?apt= 딥링크) */}
        <ComparePickerSection />

        {/* 내가 담은 후보 (비교 트레이) */}
        <CompareTraySection />

        {/* 단지별 실거래 비교표 — "준비 중" 카드였던 자리. 이제 트레이에 담은
            단지들의 최근 6개월 평균가·평당가·거래량을 실거래에서 직접 집계한다. */}
        <ComplexCompareTable />

        {/* 지역 실시세 요약 — "요약 생성" 버튼을 눌렀을 때만 API 호출 */}
        <RegionMarketSummary />

        {/* 15h-44 분석→행동: 결과 끝 다음 행동 카드 */}
        {/* #411 — 도구 간 이어가기 (비교는 지역 컨텍스트가 없어 링크만) */}
        <AnalysisCrossLinks
          current="compare"
          note={{ label: "노트 쓰러 가기", href: "/notes/new" }}
        />
      </div>
    </PageShell>
  );
}
