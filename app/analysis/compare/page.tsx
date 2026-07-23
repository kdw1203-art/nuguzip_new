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
  | { kind: "loading" }
  | { kind: "empty" }
  | { kind: "limited"; message: string }
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

/** 비교 트레이의 후보 지역(없으면 데모 비교표의 평촌 생활권) 실시세를 자동 병합 */
function RegionMarketSummary() {
  const [state, setState] = useState<SummaryState>({ kind: "loading" });
  const [trayItems, setTrayItems] = useState<CompareTrayItem[] | null>(null);

  useEffect(() => {
    const sync = () => setTrayItems(listCompareTray());
    sync();
    return subscribeCompareTray(sync);
  }, []);

  const regions = [
    ...new Set((trayItems ?? []).map((t) => (t.region ?? "").trim()).filter(Boolean)),
  ];
  // 데모 비교표(공작·동편3 등)는 안양시 동안구 생활권 — 후보가 없을 때 기본값
  const targets = regions.length > 0 ? regions : ["안양시 동안구"];
  const targetsKey = trayItems === null ? "" : targets.join("|");

  useEffect(() => {
    if (!targetsKey) return; // 트레이 로드 전에는 호출하지 않음 (사용량 절약)
    let cancelled = false;
    setState({ kind: "loading" });
    void (async () => {
      try {
        const res = await fetch("/api/ai/compare-summary", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ regions: targetsKey.split("|") }),
        });
        const data = (await res.json().catch(() => null)) as {
          error?: string;
          items?: RegionSnapshotItem[];
          comment?: string;
          mode?: string;
          disclaimer?: string;
        } | null;
        if (cancelled) return;
        if (res.status === 429) {
          setState({
            kind: "limited",
            message:
              data?.error ?? "AI 실행 사용량(시간당 10회)을 모두 썼어요. 잠시 후 다시 확인해 주세요.",
          });
          return;
        }
        if (!res.ok || !data || !Array.isArray(data.items) || data.items.length === 0) {
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
        if (!cancelled) setState({ kind: "empty" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [targetsKey]);

  if (state.kind === "empty") return null; // 실시세 미보유 지역 — 조용히 숨김 (graceful)

  return (
    <div className="rise-in-2 card flex flex-col gap-3 rounded-[20px] p-[22px]">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[15px] font-extrabold text-ink">
          후보 지역 실시세 스냅샷
        </div>
        <span className="rounded border border-line px-1.5 py-px text-[9px] font-bold text-text-3">
          실데이터 기준
        </span>
      </div>

      {state.kind === "loading" ? (
        <div className="text-xs text-text-3">지역 시세를 불러오는 중…</div>
      ) : state.kind === "limited" ? (
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

        {/* 사실 우선: 하드코딩된 예시 단지 비교표(공작·동편3 등)와 임의 AI 총평을 제거.
            담은 단지의 지역 실거래·시세 스냅샷(실데이터)만 제공한다. */}
        <div className="rise-in card flex flex-col gap-1.5 rounded-2xl px-[18px] py-4">
          <div className="text-[13px] font-extrabold text-ink">단지별 항목 비교표는 준비 중이에요</div>
          <div className="text-[11px] leading-relaxed text-text-3">
            지금은 담은 단지가 속한 지역의 국토교통부 실거래 기반 시세 스냅샷과 요약을 보여드려요.
            단지별 세부 항목(평단가·전세가율·교통·학군 등) 비교표는 실데이터 연동 후 제공될 예정이에요.
          </div>
        </div>

        {/* 지역 실시세 자동 병합 + 종합 코멘트 (실데이터) */}
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
