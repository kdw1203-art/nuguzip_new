"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageShell } from "../../components/PageShell";
import { NextActions } from "../../components/NextActions";
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

/* ---------- 단지 선택기 → 비교 트레이에 담기 (검색·지도·딥링크 공용) ---------- */

function ComparePickerSection() {
  const [note, setNote] = useState<string | null>(null);

  return (
    <div className="rise-in card flex flex-col gap-2 rounded-2xl px-[18px] py-4">
      <div className="text-[13px] font-extrabold text-ink">비교할 단지 담기</div>
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
      {note && <div className="text-[11px] font-bold text-primary">{note}</div>}
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
      <div className="text-[13px] font-extrabold text-ink">
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
              className="chip chip-soft flex items-center gap-1.5 px-[11px] py-[5px] text-[11px]"
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
        <div className="text-[11px] text-text-3">
          아직 담은 후보가 없어요 — 단지 화면의 &quot;비교 담기&quot;로 최대{" "}
          {COMPARE_TRAY_MAX}개까지 담을 수 있어요.
        </div>
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

  if (!ids || ids.length === 0) {
    return (
      <div className="rise-in card flex flex-col gap-1.5 rounded-2xl px-[18px] py-4">
        <div className="text-[13px] font-extrabold text-ink">단지별 실거래 비교표</div>
        <div className="text-[11px] leading-relaxed text-text-3">
          위에서 단지를 담으면 최근 6개월 평균가·평당가·거래량을 나란히 비교해 드려요.
        </div>
      </div>
    );
  }

  return (
    <div className="rise-in card flex flex-col gap-3 rounded-[20px] p-[22px]">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[15px] font-extrabold text-ink">단지별 실거래 비교표</div>
        <span className="rounded border border-line px-1.5 py-px text-[9px] font-bold text-text-3">
          실데이터 기준
        </span>
      </div>
      {loading && !items ? (
        <div className="text-xs text-text-3">실거래를 집계하는 중…</div>
      ) : items ? (
        <>
          <div className="overflow-x-auto">
            <div className="min-w-[620px]">
              <div className="grid grid-cols-[1.5fr_1fr_1fr_0.8fr_1.3fr] gap-2 border-b border-[#f0f3f8] pb-2 text-[11px] font-bold text-text-3">
                <span>단지</span>
                <span className="text-center">6개월 평균가</span>
                <span className="text-center">평당가 (6개월)</span>
                <span className="text-center">거래 6/12개월</span>
                <span className="text-center">최근 거래</span>
              </div>
              {items.map((it) => (
                <div
                  key={it.id}
                  className="grid grid-cols-[1.5fr_1fr_1fr_0.8fr_1.3fr] items-center gap-2 border-b border-[#f0f3f8] py-2.5 text-xs"
                >
                  <span className="font-bold text-ink">
                    <Link href={`/complex/${encodeURIComponent(it.id)}`} className="no-underline">
                      {it.name}
                    </Link>
                    <span className="ml-1 text-[10px] font-semibold text-text-3">{it.region}</span>
                  </span>
                  {it.hasData ? (
                    <>
                      <span className="text-center font-extrabold text-text-1">
                        {fmtEok(it.avg6mKrw)}
                      </span>
                      <span className="text-center font-bold text-text-1">
                        {fmtManwon(it.avgPyeong6mKrw)}
                      </span>
                      <span className="text-center font-bold text-text-1">
                        {it.count6m}/{it.count12m}건
                      </span>
                      <span className="text-center text-[11px] text-text-2">
                        {it.latest
                          ? `${fmtYm(it.latest.ym)} · ${fmtEok(it.latest.amountKrw)}${
                              it.latest.areaM2 ? ` · ${Math.round(it.latest.areaM2)}㎡` : ""
                            }${it.latest.floor ? ` · ${it.latest.floor}층` : ""}`
                          : "—"}
                      </span>
                    </>
                  ) : (
                    <span className="col-span-4 text-center text-[11px] text-text-3">
                      최근 12개월 실거래 없음
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className="text-[9px] leading-[1.5] text-text-3">
            국토교통부 실거래 기준(해제 신고분 제외) · 면적·타입 구분 없는 단순 평균이므로
            같은 단지라도 평형 구성에 따라 체감과 다를 수 있어요. 평형별 시세는 단지
            상세에서 확인하세요.
          </div>
        </>
      ) : (
        <div className="text-xs text-text-3">
          집계에 실패했어요. 잠시 후 다시 시도해 주세요.
        </div>
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
        <div className="text-[15px] font-extrabold text-ink">
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
        <div className="text-[11px] leading-relaxed text-text-3">
          아직 담은 후보가 없어요. 위에서 단지를 담으면 후보 지역의 국토교통부 실거래
          기반 시세 스냅샷과 종합 코멘트를 만들어 드려요.
        </div>
      ) : state.kind === "idle" ? (
        <div className="text-[11px] leading-relaxed text-text-3">
          담은 후보 {regions.length}개 지역의 시세 스냅샷을 준비했어요. &quot;요약
          생성&quot; 버튼을 누르면 지역 실시세와 종합 코멘트를 불러와요.
        </div>
      ) : state.kind === "loading" ? (
        <div className="text-xs text-text-3">지역 시세를 불러오는 중…</div>
      ) : state.kind === "empty" ? (
        <div className="text-[11px] leading-relaxed text-text-3">
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
              <div className="grid grid-cols-[1.4fr_1fr_1fr_1fr] gap-2 border-b border-[#f0f3f8] pb-2 text-[11px] font-bold text-text-3">
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
                    className="grid grid-cols-[1.4fr_1fr_1fr_1fr] items-center gap-2 border-b border-[#f0f3f8] py-2.5 text-xs"
                  >
                    <span className="font-bold text-ink">
                      {it.regionName}
                      <span className="ml-1 text-[10px] font-semibold text-text-3">
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
                <span className="ai-chip h-[22px] w-[22px] shrink-0 rounded-[7px] text-[11px]">
                  AI
                </span>
                <div className="flex-1 text-xs leading-[1.65] text-ai-text">
                  {state.comment}
                </div>
                <span className="shrink-0 rounded border border-[rgba(255,255,255,.25)] px-1.5 py-px text-[9px] font-bold text-ai-muted">
                  {state.mode === "llm" ? "AI 생성" : "규칙 기반 요약"}
                </span>
              </div>
              <div className="text-[9px] leading-[1.5] text-ai-muted">
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
        <NextActions
          actions={[
            { label: "노트 쓰러 가기", href: "/notes/new", primary: true },
            { label: "계산기로 월 부담 확인", href: "/calculator" },
            { label: "알림 설정", href: "/notifications" },
          ]}
        />
      </div>
    </PageShell>
  );
}
