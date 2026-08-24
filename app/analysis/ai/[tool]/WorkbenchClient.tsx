"use client";

import { startTransition, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ComplexPicker, type PickedComplex } from "@/app/analysis/ComplexPicker";
import type { AiAnalysisToolId } from "@/lib/ai/ai-tools";
import { UNCERTAINTY, CONFIDENCE_LABEL, judgeConfidence } from "@/lib/ai/insight-blocks";

/* [AI-31~38·42~43·46] 통합 워크벤치 클라이언트 — 3스텝 실행 흐름.
   서버 판정(레이더·플래그·신호·각주·반대 시나리오)은 /api/ai/context 가 주고,
   여기는 그리기와 흐름만 한다. 수치를 클라이언트에서 재계산하지 않는다. */

type Ctx = {
  complex: {
    id: string;
    name: string;
    region: string;
    price: { priceKrw: number; bandLabel: string; latestYm: string; sample?: number | null } | null;
  } | null;
  region: {
    name: string;
    snapshot: {
      avgSale: number | null;
      jeonseRatio: number | null;
      saleChangeMonthly: number | null;
      tradeCount: number | null;
      period: string;
    } | null;
    demographics: { unsoldUnits: number | null; period: string } | null;
  } | null;
  rent: { wolseSharePct: number | null; medianMonthlyKrw: number | null; sample?: number | null } | null;
  supply: { upcomingHouseholds: number; upcomingComplexes: number } | null;
  news: { items: { id: string; title: string; at: string }[] } | null;
  notes: { count: number; avgScore: number | null; latest: { id: string; title: string } | null } | null;
  macro: { baseRatePct: number | null } | null;
};

type Footnote = {
  n: number;
  label: string;
  source: string;
  asOf: string | null;
  sample: number | null;
  href: string | null;
  ageDays: number | null;
};

type Insight = {
  radar: { key: string; label: string; score: number | null; basis: string }[];
  flags: { key: string; level: "warn" | "info"; title: string; detail: string }[];
  signals: { key: string; label: string; state: "green" | "yellow" | "red" | "na"; basis: string }[];
  counters: string[];
};

type RunResult = {
  ok: boolean;
  source: string;
  degraded: boolean;
  reasonCode: string | null;
  markdown: string;
  structuredSummary?: { headline: string; bullets: string[] } | null;
  runId?: string | null;
  usage?: { used: number; limit: number | null } | null;
  error?: string;
  code?: string;
};

const SIGNAL_COLOR: Record<string, string> = {
  green: "bg-success text-surface",
  yellow: "bg-warning text-surface",
  red: "bg-danger text-surface",
  na: "bg-bg text-text-3",
};
const SIGNAL_LABEL: Record<string, string> = {
  green: "우호",
  yellow: "중립",
  red: "주의",
  na: "데이터 없음",
};

function won(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n <= 0) return "—";
  if (n >= 1e8) return `${(Math.round((n / 1e8) * 10) / 10).toLocaleString("ko-KR")}억`;
  return `${Math.round(n / 1e4).toLocaleString("ko-KR")}만`;
}

/** 결과 마크다운 경량 렌더 (##·-·**·> 만) — 외부 md 라이브러리 없이 */
function MdLite({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div className="flex flex-col gap-1 text-[13px] leading-[1.75] text-text-1">
      {lines.map((ln, i) => {
        const t = ln.trim();
        if (!t) return <div key={i} className="h-1" />;
        if (t.startsWith("## "))
          return (
            <div key={i} className="mt-2 text-[14px] font-extrabold text-ink">
              {t.slice(3)}
            </div>
          );
        if (t.startsWith("> "))
          return (
            <div key={i} className="rounded-[10px] bg-warning-soft px-3 py-2 text-[12px] font-bold text-warning">
              {t.slice(2)}
            </div>
          );
        if (t.startsWith("- ") || t.startsWith("* "))
          return (
            <div key={i} className="pl-3">
              · {renderBold(t.slice(2))}
            </div>
          );
        if (t === "---") return <hr key={i} className="my-1 border-line" />;
        return <div key={i}>{renderBold(t)}</div>;
      })}
    </div>
  );
}
function renderBold(s: string) {
  const parts = s.split(/\*\*(.+?)\*\*/g);
  return parts.map((p, i) =>
    i % 2 === 1 ? (
      <b key={i} className="font-bold text-ink">
        {p}
      </b>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
}

export function WorkbenchClient({
  tool,
  useCase,
  tips,
}: {
  tool: AiAnalysisToolId;
  useCase: string;
  tips: string[];
}) {
  const [picked, setPicked] = useState<PickedComplex | null>(null);
  /* [AI-22] 비교 도구는 최대 3단지 트레이 */
  const [compareTray, setCompareTray] = useState<PickedComplex[]>([]);
  const [ctxState, setCtxState] = useState<
    | { phase: "idle" }
    | { phase: "loading" }
    | { phase: "ready"; ctx: Ctx; footnotes: Footnote[]; insight: Insight; similar: { id: string; name: string; txCount: number }[] }
    | { phase: "error" }
  >({ phase: "idle" });
  const [budgetKrw, setBudgetKrw] = useState("");
  const [useLlm, setUseLlm] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const [feedback, setFeedback] = useState<"idle" | "up" | "down" | "sent">("idle");
  const [feedbackNote, setFeedbackNote] = useState("");
  const [watchState, setWatchState] = useState<"idle" | "busy" | "done" | "fail">("idle");
  const [shareCopied, setShareCopied] = useState(false);
  const [presetMsg, setPresetMsg] = useState<string | null>(null);

  const isCompare = tool === "ai-compare";
  const isPortfolio = tool === "ai-portfolio";
  const isEconomy = tool === "ai-economy";
  const isContract = tool === "contract-risk";
  const needsComplex = !isEconomy && !isContract;

  /* [AI-35] 프리셋 불러오기 — 저장해 둔 대상 원클릭 복원 (4주 실측 대상) */
  const [presets, setPresets] = useState<
    { id: string; name: string; objective: { complexId?: string; complexName?: string; region?: string } }[]
  >([]);
  useEffect(() => {
    fetch(`/api/ai/presets?tool=${tool}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (Array.isArray(j?.presets)) setPresets(j.presets.slice(0, 5));
      })
      .catch(() => {});
  }, [tool]);
  const loadContext = useCallback(async (p: PickedComplex | null) => {
    if (!p) return;
    setCtxState({ phase: "loading" });
    try {
      const res = await fetch(
        `/api/ai/context?complexId=${encodeURIComponent(p.id)}`,
        { cache: "no-store" },
      );
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error("context");
      setCtxState({ phase: "ready", ctx: json.context, footnotes: json.footnotes, insight: json.insight, similar: Array.isArray(json.similar) ? json.similar : [] });
    } catch {
      setCtxState({ phase: "error" });
    }
  }, []);

  const applyPreset = useCallback(
    (p: { objective: { complexId?: string; complexName?: string; region?: string } }) => {
      const o = p.objective;
      if (!o.complexId || !o.complexName) return;
      const c: PickedComplex = {
        id: o.complexId,
        name: o.complexName,
        region: o.region ?? o.complexId.split(".")[0] ?? "",
        regionId: null,
        regionLabel: o.region ?? null,
      } as PickedComplex;
      setPicked(c);
      void loadContext(c);
    },
    [loadContext],
  );


  /* [OPT-48] 단일 단지 딥링크 — ?complexId=… 또는 ?apt=…&region=… (노트 배너 AI-40,
     단지 허브 요약의 "AI 진단으로" 링크가 쓴다). Wave 9 배너가 파라미터만 넘기고
     받는 쪽이 없던 결합부를 여기서 닫는다. base64url 인코딩은 서버의
     encodeComplexId(region + \x01 + name)와 반드시 같은 규칙. */
  useEffect(() => {
    if (isCompare) return;
    const sp = new URLSearchParams(window.location.search);
    let id = sp.get("complexId");
    if (!id) {
      const apt = sp.get("apt")?.trim();
      const region = sp.get("region")?.trim();
      if (apt && region) {
        const bytes = new TextEncoder().encode(`${region}\u0001${apt}`);
        let bin = "";
        bytes.forEach((b) => (bin += String.fromCharCode(b)));
        id = btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      }
    }
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/ai/context?complexId=${encodeURIComponent(id)}`, { cache: "no-store" });
        const json = await res.json();
        const cx = json?.context?.complex as { id: string; name: string; region: string } | null;
        if (cx && !cancelled) {
          setPicked({ id: cx.id, name: cx.name, region: cx.region, regionId: null, regionLabel: cx.region } as PickedComplex);
          setCtxState({ phase: "ready", ctx: json.context, footnotes: json.footnotes, insight: json.insight, similar: Array.isArray(json.similar) ? json.similar : [] });
        }
      } catch {
        /* 딥링크 실패는 조용히 — 사용자는 평소처럼 검색으로 고른다 */
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCompare]);

  /* [AI-22] /analysis/compare 트레이 딥링크(?ids=a,b,c) — 같은 후보로 이어 받는다 */
  useEffect(() => {
    if (!isCompare) return;
    const ids = new URLSearchParams(window.location.search).get("ids");
    if (!ids) return;
    const list = ids.split(",").map((v) => v.trim()).filter(Boolean).slice(0, 3);
    if (list.length === 0) return;
    let cancelled = false;
    (async () => {
      const resolved: PickedComplex[] = [];
      for (const id of list) {
        try {
          const res = await fetch(`/api/ai/context?complexId=${encodeURIComponent(id)}`, { cache: "no-store" });
          const json = await res.json();
          const cx = json?.context?.complex as { id: string; name: string; region: string } | null;
          if (cx) {
            resolved.push({ id: cx.id, name: cx.name, region: cx.region, regionId: null, regionLabel: cx.region } as PickedComplex);
            if (resolved.length === 1 && !cancelled) {
              setPicked(resolved[0]);
              setCtxState({ phase: "ready", ctx: json.context, footnotes: json.footnotes, insight: json.insight, similar: Array.isArray(json.similar) ? json.similar : [] });
            }
          }
        } catch {
          /* 하나 실패해도 나머지는 이어 받는다 */
        }
      }
      if (!cancelled && resolved.length > 0) setCompareTray(resolved);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCompare]);

  /* [AI-16 예비] 경제 모니터는 지역 없이도 거시 축만으로 실행 */
  useEffect(() => {
    if (isEconomy) {
      setCtxState({ phase: "loading" });
      fetch("/api/ai/context?region=강남구", { cache: "no-store" })
        .then((r) => r.json())
        .then((json) =>
          json?.ok
            ? setCtxState({ phase: "ready", ctx: json.context, footnotes: json.footnotes, insight: json.insight, similar: [] })
            : setCtxState({ phase: "error" }),
        )
        .catch(() => setCtxState({ phase: "error" }));
    }
  }, [isEconomy]);

  const onPick = useCallback(
    (c: PickedComplex) => {
      if (isCompare) {
        setCompareTray((prev) =>
          prev.some((x) => x.id === c.id) || prev.length >= 3 ? prev : [...prev, c],
        );
      }
      setPicked(c);
      void loadContext(c);
    },
    [isCompare, loadContext],
  );

  /* [AI-25] 포트폴리오 — 관심 단지 자동 로드 */
  const [portfolio, setPortfolio] = useState<{ complexId: string; complexName: string }[] | null>(null);
  const loadPortfolio = useCallback(async () => {
    try {
      const res = await fetch("/api/me/watchlist", { cache: "no-store" });
      if (res.status === 401) {
        setPortfolio([]);
        return;
      }
      const json = await res.json();
      const items = Array.isArray(json.items) ? json.items : [];
      setPortfolio(
        items.map((i: { complexId: string; complexName: string }) => ({
          complexId: i.complexId,
          complexName: i.complexName,
        })),
      );
      if (items[0]) {
        const first = items[0] as { complexId: string; complexName: string };
        const region = first.complexId.split(".")[0] ?? "";
        void loadContext({
          id: first.complexId,
          name: first.complexName,
          region,
          regionId: null,
          regionLabel: region,
        } as PickedComplex);
      }
    } catch {
      setPortfolio([]);
    }
  }, [loadContext]);

  const ready = ctxState.phase === "ready";
  const ctx = ready ? ctxState.ctx : null;
  const insight = ready ? ctxState.insight : null;
  const footnotes = ready ? ctxState.footnotes : [];
  const similar = ready ? ctxState.similar : [];

  const run = useCallback(async () => {
    if (running) return;
    if (needsComplex && !picked && !(isPortfolio && portfolio?.length)) return;
    setRunning(true);
    setResult(null);
    setFeedback("idle");
    try {
      const input: Record<string, unknown> = {
        complexId: picked?.id ?? null,
        complexName: picked?.name ?? null,
        region: picked?.region ?? ctx?.region?.name ?? null,
        budgetKrw: budgetKrw ? Number(budgetKrw.replace(/[^\d]/g, "")) * 10000 : null,
        _promptVersion: "v2",
        /* [AI-02] 실행 시점 컨텍스트 요약을 입력 스냅샷에 고정 — 재현 근거 */
        live: ctx
          ? {
              priceKrw: ctx.complex?.price?.priceKrw ?? null,
              regionAvgSale: ctx.region?.snapshot?.avgSale ?? null,
              jeonseRatio: ctx.region?.snapshot?.jeonseRatio ?? null,
              monthlyChangePct: ctx.region?.snapshot?.saleChangeMonthly ?? null,
              tradeCount: ctx.region?.snapshot?.tradeCount ?? null,
              wolseSharePct: ctx.rent?.wolseSharePct ?? null,
              upcomingHouseholds: ctx.supply?.upcomingHouseholds ?? null,
              baseRatePct: ctx.macro?.baseRatePct ?? null,
              unsoldUnits: ctx.region?.demographics?.unsoldUnits ?? null,
              noteAvgScore: ctx.notes?.avgScore ?? null,
            }
          : null,
        compare: isCompare
          ? compareTray.map((c) => ({ id: c.id, name: c.name, region: c.region }))
          : undefined,
        portfolio: isPortfolio && portfolio ? portfolio : undefined,
      };
      const res = await fetch("/api/ai/analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool, input, skipExternalLlm: !useLlm }),
      });
      const json = (await res.json()) as RunResult;
      /* [OPT-50] 결과 마크다운 렌더는 무거운 갱신 — 전환으로 미뤄 입력 반응성(INP)을 지킨다 */
      startTransition(() => {
        if (!res.ok) {
          setResult({ ...json, ok: false });
        } else {
          setResult(json);
        }
      });
    } catch {
      setResult({
        ok: false,
        source: "error",
        degraded: true,
        reasonCode: "NETWORK",
        markdown: "",
        error: "실행에 실패했어요 — 잠시 후 다시 시도해 주세요.",
      });
    } finally {
      setRunning(false);
    }
  }, [running, needsComplex, picked, isPortfolio, portfolio, ctx, budgetKrw, isCompare, compareTray, tool, useLlm]);

  const sendFeedback = useCallback(
    async (rating: "up" | "down") => {
      setFeedback(rating);
      try {
        await fetch("/api/ai/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            rating,
            targetType: "workbench",
            targetId: result?.runId ?? tool,
            context: { tool, note: feedbackNote.slice(0, 200) },
          }),
        });
        setFeedback("sent");
      } catch {
        setFeedback("sent");
      }
    },
    [result?.runId, tool, feedbackNote],
  );

  const addWatch = useCallback(async () => {
    if (!picked || watchState === "busy" || watchState === "done") return;
    /* [OPT-49] 낙관적 반영 — 누르는 즉시 "등록됨"으로 그리고, 실패하면 되돌린다.
       "등록 중…"을 기다리게 하는 대신 실패(주로 비로그인)만 예외로 다룬다. */
    setWatchState("done");
    try {
      const res = await fetch("/api/me/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ complexId: picked.id, complexName: picked.name }),
      });
      if (!res.ok) setWatchState("fail");
    } catch {
      setWatchState("fail");
    }
  }, [picked, watchState]);

  const savePreset = useCallback(async () => {
    if (!picked) return;
    setPresetMsg(null);
    try {
      const res = await fetch("/api/ai/presets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tool,
          name: `${picked.name} · ${new Date().toISOString().slice(5, 10)}`,
          objective: { complexId: picked.id, complexName: picked.name, region: picked.region },
        }),
      });
      setPresetMsg(res.ok ? "프리셋으로 저장했어요 — 다음엔 한 번에 불러옵니다." : "저장 실패(로그인 필요)");
    } catch {
      setPresetMsg("저장 실패 — 잠시 후 다시");
    }
  }, [picked, tool]);

  const shareUrl = useMemo(
    () => (result?.runId ? `/analysis/ai/r/${result.runId}` : null),
    [result?.runId],
  );

  const noteHref = picked
    ? `/notes/new?apt=${encodeURIComponent(picked.name)}&region=${encodeURIComponent(picked.region)}`
    : "/notes/new";

  return (
    <div className="flex flex-col gap-3">
      {/* ── ① 대상 선택 ── */}
      {needsComplex && (
        <div className="card rounded-[16px] p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[13px] font-extrabold text-ink">① 단지 선택</span>
            <span className="text-[11px] text-text-3">{useCase}</span>
          </div>
          <ComplexPicker onSelect={onPick} />
          {presets.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-bold text-text-3">내 프리셋:</span>
              {presets.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => applyPreset(p)}
                  className="chip border border-line bg-bg px-2.5 py-1 text-[11.5px] font-bold text-text-1"
                >
                  {p.name}
                </button>
              ))}
            </div>
          )}
          {isCompare && compareTray.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {compareTray.map((c) => (
                <span key={c.id} className="chip border border-line bg-bg px-2.5 py-1 text-[11.5px] font-bold text-text-1">
                  {c.name}
                  <button
                    type="button"
                    className="ml-1 text-text-3"
                    aria-label={`${c.name} 제외`}
                    onClick={() => setCompareTray((p) => p.filter((x) => x.id !== c.id))}
                  >
                    ✕
                  </button>
                </span>
              ))}
              <span className="text-[11px] text-text-3">최대 3곳 — 검색으로 추가</span>
            </div>
          )}
          {isPortfolio && (
            <div className="mt-2">
              <button type="button" onClick={loadPortfolio} className="rounded-[10px] border border-line-strong bg-bg px-3 py-1.5 text-[12px] font-bold text-text-1">
                내 관심 단지 불러오기
              </button>
              {portfolio && (
                <span className="ml-2 text-[11.5px] text-text-3">
                  {portfolio.length > 0 ? `${portfolio.length}곳 로드됨` : "관심 단지가 없어요(로그인·등록 필요)"}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {isContract && (
        <div className="card rounded-[16px] p-4 text-[13px] leading-[1.7] text-text-2">
          계약 리스크 점검은 전세 안전 셀프체크와 같은 문항 세트로 봅니다 —{" "}
          <Link href="/safety" className="font-bold text-primary no-underline">
            전세 안전 셀프체크 열기 ›
          </Link>
          <div className="mt-1 text-[11.5px] text-text-3">
            단지를 선택하면 아래에서 해당 지역의 전세가율·월세 비중 같은 계약 관련 실측도 함께 봅니다.
          </div>
          <div className="mt-2">
            <ComplexPicker onSelect={onPick} />
          </div>
        </div>
      )}

      {/* ── ② 자동 로드 데이터 ── */}
      {ctxState.phase !== "idle" && (
        <div className="card rounded-[16px] p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span className="text-[13px] font-extrabold text-ink">② 자동 로드 데이터</span>
            <span className="text-[11px] text-text-3">수치마다 출처·시점을 아래 각주로 표기</span>
          </div>

          {ctxState.phase === "loading" && (
            <div className="py-4 text-center text-[12.5px] font-bold text-text-3">실데이터 불러오는 중…</div>
          )}
          {ctxState.phase === "error" && (
            <div className="py-3 text-center text-[12.5px] font-bold text-warning">
              데이터를 불러오지 못했어요 — 없는 것과 다릅니다. 잠시 후 다시 시도해 주세요.
            </div>
          )}

          {ready && ctx && (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Stat label="대표 실거래가" value={ctx.complex?.price ? won(ctx.complex.price.priceKrw) : "—"} sub={ctx.complex?.price ? `${ctx.complex.price.bandLabel} · ${ctx.complex.price.latestYm}` : "표본 없음"} />
                <Stat label="지역 월간 변동" value={ctx.region?.snapshot?.saleChangeMonthly != null ? `${ctx.region.snapshot.saleChangeMonthly}%` : "—"} sub={ctx.region?.snapshot ? `거래 ${ctx.region.snapshot.tradeCount ?? "—"}건/월` : "스냅샷 없음"} />
                <Stat label="월세 비중(신고)" value={ctx.rent?.wolseSharePct != null ? `${ctx.rent.wolseSharePct}%` : "—"} sub={ctx.rent ? `표본 ${ctx.rent.sample ?? "—"}건` : "표본 없음"} />
                <Stat label="입주 예정" value={ctx.supply ? `${ctx.supply.upcomingHouseholds.toLocaleString("ko-KR")}세대` : "0"} sub={ctx.supply ? `${ctx.supply.upcomingComplexes}개 단지` : "예정 없음"} />
              </div>

              {(ctx.news?.items?.length || ctx.notes) && (
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {ctx.news?.items?.length ? (
                    <div className="rounded-[12px] bg-bg px-3 py-2.5">
                      <div className="text-[11px] font-bold text-text-3">최근 사건(자동수집 뉴스)</div>
                      {ctx.news.items.slice(0, 2).map((n) => (
                        <Link key={n.id} href={`/town/news/${n.id}`} className="mt-0.5 block truncate text-[12px] font-bold text-text-1 no-underline">
                          · {n.title}
                        </Link>
                      ))}
                    </div>
                  ) : null}
                  {ctx.notes ? (
                    <div className="rounded-[12px] bg-bg px-3 py-2.5">
                      <div className="text-[11px] font-bold text-text-3">이웃 임장노트</div>
                      <div className="mt-0.5 text-[12px] font-bold text-text-1">
                        {ctx.notes.count}건 · 평균 {ctx.notes.avgScore ?? "—"}점
                        {ctx.notes.latest && (
                          <Link href={`/notes/${ctx.notes.latest.id}`} className="ml-1 font-bold text-primary no-underline">
                            최신 보기 ›
                          </Link>
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
              )}

              {/* [AI-16] 유사 단지 자동 후보 — 비교 트레이에 원클릭 추가/전환 */}
              {similar.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-bold text-text-3">
                    이 지역 거래 활발 단지:
                  </span>
                  {similar.map((sc) => (
                    <button
                      key={sc.id}
                      type="button"
                      onClick={() =>
                        onPick({
                          id: sc.id,
                          name: sc.name,
                          region: picked?.region ?? sc.id.split(".")[0] ?? "",
                          regionId: null,
                          regionLabel: picked?.region ?? null,
                        } as PickedComplex)
                      }
                      className="chip border border-line bg-surface px-2.5 py-1 text-[11.5px] font-bold text-text-1"
                    >
                      {sc.name} <span className="text-text-3">({sc.txCount}건)</span>
                    </button>
                  ))}
                </div>
              )}

              {/* 보정 입력 — 최소한만 */}
              <div className="mt-3 flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-bold text-text-3">가용 예산(만원 · 선택)</span>
                  <input
                    value={budgetKrw}
                    onChange={(e) => setBudgetKrw(e.target.value)}
                    inputMode="numeric"
                    placeholder="예: 30000"
                    className="w-[140px] rounded-[10px] border border-line bg-surface px-3 py-2 text-[13px] font-semibold text-ink outline-none focus:border-primary"
                  />
                </label>
                <label className="flex items-center gap-1.5 pb-2 text-[12px] font-bold text-text-2">
                  <input type="checkbox" checked={useLlm} onChange={(e) => setUseLlm(e.target.checked)} />
                  AI 서술 추가(외부 모델 · 로그인 필요)
                </label>
              </div>
            </>
          )}
        </div>
      )}

      {/* [AI-29] 경제 모니터 — 임계 알림 등록 */}
      {isEconomy && ready && ctx?.macro?.baseRatePct != null && (
        <EconomyWatchPanel currentRate={ctx.macro.baseRatePct} />
      )}

      {/* ── ③ 실행 ── */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={run}
          disabled={running || (needsComplex && !picked && !(isPortfolio && portfolio?.length)) }
          className="btn-primary rounded-[12px] px-5 py-2.5 text-[14px] font-extrabold disabled:opacity-50"
        >
          {running ? "분석 중…" : "③ 분석 실행"}
        </button>
        <Link href="/my/analyses" className="text-[12px] font-bold text-text-3 no-underline">
          내 분석 기록 ›
        </Link>
      </div>

      {/* ── 결과 ── */}
      {result && (
        <div className="card flex flex-col gap-3 rounded-[16px] p-4">
          {!result.ok ? (
            <div className="text-[13px] font-bold text-danger">
              {result.error ?? "실행에 실패했어요."}
              {result.code === "QUOTA_EXCEEDED" && (
                <span className="ml-2 font-bold text-text-2">
                  이번 달 무료 횟수를 다 썼어요 —{" "}
                  <Link href="/subscription" className="text-primary no-underline">PRO 안내 보기 ›</Link>
                </span>
              )}
              {result.code === "LOGIN_REQUIRED" && (
                <Link href="/login" className="ml-2 text-primary no-underline">로그인 ›</Link>
              )}
            </div>
          ) : (
            <>
              {result.structuredSummary?.headline && (
                <div className="text-[14.5px] font-extrabold leading-[1.5] text-ink">
                  {result.structuredSummary.headline}
                </div>
              )}

              {/* 시그니처 위젯 — 도구별 구조화 판정 [규칙] */}
              {insight && tool === "ai-diagnosis" && <RadarBlock radar={insight.radar} />}
              {insight && (tool === "ai-timing" || tool === "ai-prediction") && <SignalBlock signals={insight.signals} />}
              {tool === "ai-prediction" && (
                <Link href="/analysis/accuracy" className="text-[12px] font-bold text-primary no-underline">
                  이 예측 규칙의 과거 적중률 공개 페이지 › (±5% 기준 실측)
                </Link>
              )}
              {insight && (tool === "ai-risk" || tool === "ai-gap" || tool === "contract-risk") && <FlagBlock flags={insight.flags} />}

              {/* [AI-04] 반대 시나리오 */}
              {insight && insight.counters.length > 0 && (
                <div className="rounded-[12px] bg-bg px-3.5 py-3">
                  <div className="text-[11.5px] font-extrabold text-text-2">이 판단이 틀리는 조건 [규칙]</div>
                  {insight.counters.map((c, i) => (
                    <div key={i} className="mt-1 text-[12px] leading-[1.65] text-text-2">· {c}</div>
                  ))}
                </div>
              )}

              <MdLite text={result.markdown} />

              {result.degraded && result.reasonCode?.includes("KEY_MISSING") && (
                <div className="rounded-[10px] bg-warning-soft px-3 py-2 text-[11.5px] font-bold text-warning">
                  외부 AI 서술은 서버 키가 등록되면 켜집니다(오너 설정 대기) — 위 결과는 규칙 계산입니다.
                </div>
              )}

              {/* [AI-42] 쿼터 표면화 */}
              {result.usage && (
                <div className="text-[11.5px] text-text-3">
                  이번 달 사용 {result.usage.used}
                  {result.usage.limit != null ? ` / ${result.usage.limit}회` : "회 (무제한)"} ·{" "}
                  <Link href="/subscription" className="font-bold text-primary no-underline">더 필요하면 PRO ›</Link>
                </div>
              )}

              {/* [AI-01·17] 근거 각주 */}
              {footnotes.length > 0 && (
                <details className="rounded-[12px] bg-bg px-3.5 py-2.5">
                  <summary className="cursor-pointer text-[12px] font-extrabold text-text-2">
                    근거 각주 {footnotes.length}건 — 출처·기준 시점·표본 (표본 {UNCERTAINTY.thinSample}건 미만·{UNCERTAINTY.staleDays}일 초과는 주의 표기)
                  </summary>
                  <div className="mt-2 flex flex-col gap-1">
                    {footnotes.map((f) => (
                      <div key={f.n} className="flex flex-wrap items-baseline gap-x-2 text-[11.5px] text-text-2">
                        <span className="font-mono font-bold text-primary">[{f.n}]</span>
                        <span className="font-bold text-ink">{f.label}</span>
                        <span>{f.source}</span>
                        {f.asOf && (
                          <span className="text-text-3">
                            {f.asOf}
                            {f.ageDays != null && f.ageDays > 0 ? ` (${f.ageDays}일 전)` : ""}
                          </span>
                        )}
                        {f.sample != null && <span className="text-text-3">표본 {f.sample}건</span>}
                        {(() => {
                          const c = judgeConfidence(f.sample, f.ageDays);
                          return c !== "ok" ? (
                            <span className="rounded bg-warning-soft px-1.5 py-px text-[10px] font-extrabold text-warning">
                              {CONFIDENCE_LABEL[c]}
                            </span>
                          ) : null;
                        })()}
                        {f.href && (
                          <Link href={f.href} className="font-bold text-primary no-underline">원본 ›</Link>
                        )}
                      </div>
                    ))}
                  </div>
                </details>
              )}

              {/* [AI-38] 다음 행동 3버튼 */}
              <div className="flex flex-wrap gap-2">
                <Link
                  href={picked ? `/map?complexId=${encodeURIComponent(picked.id)}` : "/map"}
                  className="rounded-[10px] border border-line-strong bg-bg px-3.5 py-2 text-[12.5px] font-bold text-text-1 no-underline"
                >
                  지도에서 보기
                </Link>
                <Link
                  href={noteHref}
                  className="rounded-[10px] border border-line-strong bg-bg px-3.5 py-2 text-[12.5px] font-bold text-text-1 no-underline"
                >
                  이 단지 임장노트 쓰기
                </Link>
                <button
                  type="button"
                  onClick={addWatch}
                  disabled={!picked || watchState === "busy" || watchState === "done"}
                  className="rounded-[10px] border border-line-strong bg-bg px-3.5 py-2 text-[12.5px] font-bold text-text-1 disabled:opacity-60"
                >
                  {watchState === "done" ? "관심 단지 등록됨 ✓" : watchState === "busy" ? "등록 중…" : watchState === "fail" ? "등록 실패(로그인 필요)" : "관심 단지 + 가격 알림"}
                </button>
              </div>

              {/* [AI-24] 체크리스트 → 노트 저장 */}
              {tool === "my-checklist" && (
                <Link
                  href={`${noteHref}${noteHref.includes("?") ? "&" : "?"}fromChecklist=1`}
                  onClick={() => {
                    /* [AI-24] 결과의 목록 항목을 노트 고려사항으로 이관 */
                    try {
                      const items = result.markdown
                        .split("\n")
                        .map((l) => l.trim())
                        .filter((l) => l.startsWith("- ") || l.startsWith("* "))
                        .map((l) => l.slice(2).replace(/\*\*/g, "").trim())
                        .filter((l) => l.length >= 4 && l.length <= 60)
                        .slice(0, 10);
                      if (items.length) {
                        window.localStorage.setItem(
                          "nz_ai_checklist",
                          JSON.stringify({ at: Date.now(), items }),
                        );
                      }
                    } catch {
                      /* 저장 실패해도 이동은 그대로 */
                    }
                  }}
                  className="self-start rounded-[10px] bg-primary px-3.5 py-2 text-[12.5px] font-bold text-white no-underline"
                >
                  이 체크리스트로 노트 시작 ›
                </Link>
              )}

              {/* [AI-33] 공유 · [AI-35] 프리셋 */}
              <div className="flex flex-wrap items-center gap-2 border-t border-line pt-2.5">
                {shareUrl && (
                  <button
                    type="button"
                    onClick={() => {
                      try {
                        void navigator.clipboard.writeText(`${location.origin}${shareUrl}`);
                        setShareCopied(true);
                      } catch {
                        setShareCopied(false);
                      }
                    }}
                    className="rounded-[9px] bg-bg px-3 py-1.5 text-[11.5px] font-bold text-text-1"
                  >
                    {shareCopied ? "링크 복사됨 ✓" : "결과 링크 복사"}
                  </button>
                )}
                {picked && (
                  <button type="button" onClick={savePreset} className="rounded-[9px] bg-bg px-3 py-1.5 text-[11.5px] font-bold text-text-1">
                    프리셋 저장
                  </button>
                )}
                {presetMsg && <span className="text-[11px] text-text-3">{presetMsg}</span>}

                {/* [AI-46] 피드백 */}
                <span className="ml-auto flex items-center gap-1.5 text-[11.5px] text-text-3">
                  {feedback === "sent" ? (
                    "피드백 감사합니다"
                  ) : (
                    <>
                      도움됐나요?
                      <button type="button" aria-label="도움됨" onClick={() => void sendFeedback("up")} className="rounded bg-bg px-2 py-1 font-bold">👍</button>
                      <button type="button" aria-label="아쉬움" onClick={() => void sendFeedback("down")} className="rounded bg-bg px-2 py-1 font-bold">👎</button>
                      <input
                        value={feedbackNote}
                        onChange={(e) => setFeedbackNote(e.target.value)}
                        placeholder="한 줄 이유(선택)"
                        className="w-[130px] rounded border border-line bg-surface px-2 py-1 text-[11px]"
                      />
                    </>
                  )}
                </span>
              </div>
            </>
          )}
        </div>
      )}

      {/* 도움말 */}
      {!result && tips.length > 0 && (
        <div className="rounded-[12px] bg-bg px-4 py-3 text-[11.5px] leading-[1.7] text-text-3">
          {tips.map((t, i) => (
            <div key={i}>· {t}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-[12px] bg-bg px-3 py-2.5">
      <div className="text-[10.5px] font-bold text-text-3">{label}</div>
      <div className="text-[15px] font-extrabold tabular-nums text-ink">{value}</div>
      {sub && <div className="text-[10.5px] text-text-3">{sub}</div>}
    </div>
  );
}

/* [AI-19] 진단 레이더 — 축별 막대(모바일 가독 우선) + 근거 */
function RadarBlock({ radar }: { radar: Insight["radar"] }) {
  return (
    <div className="rounded-[12px] bg-bg px-3.5 py-3">
      <div className="text-[11.5px] font-extrabold text-text-2">진단 5축 [규칙 · 실데이터]</div>
      <div className="mt-2 flex flex-col gap-1.5">
        {radar.map((a) => (
          <div key={a.key} className="flex items-center gap-2">
            <span className="w-[72px] shrink-0 text-[11.5px] font-bold text-text-1">{a.label}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-line">
              {a.score != null && (
                <div className="h-full rounded-full bg-primary" style={{ width: `${a.score}%` }} />
              )}
            </div>
            <span className="w-[110px] shrink-0 text-right text-[10.5px] tabular-nums text-text-3">
              {a.score != null ? `${a.score} · ` : "데이터 없음 · "}
              {a.basis.length > 14 ? `${a.basis.slice(0, 14)}…` : a.basis}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SignalBlock({ signals }: { signals: Insight["signals"] }) {
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {signals.map((s) => (
        <div key={s.key} className="rounded-[12px] bg-bg px-3 py-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11.5px] font-bold text-text-2">{s.label}</span>
            <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-extrabold ${SIGNAL_COLOR[s.state]}`}>
              {SIGNAL_LABEL[s.state]}
            </span>
          </div>
          <div className="mt-1 text-[11px] leading-[1.55] text-text-3">{s.basis}</div>
        </div>
      ))}
    </div>
  );
}

function FlagBlock({ flags }: { flags: Insight["flags"] }) {
  if (flags.length === 0)
    return (
      <div className="rounded-[12px] bg-success-soft px-3.5 py-2.5 text-[12px] font-bold text-success">
        실측 조건 기준 점등된 리스크 플래그가 없습니다 — 표본·시점은 각주를 확인하세요.
      </div>
    );
  return (
    <div className="flex flex-col gap-1.5">
      {flags.map((f) => (
        <div
          key={f.key}
          className={`rounded-[12px] px-3.5 py-2.5 ${f.level === "warn" ? "bg-warning-soft" : "bg-bg"}`}
        >
          <div className={`text-[12px] font-extrabold ${f.level === "warn" ? "text-warning" : "text-text-1"}`}>
            ⚑ {f.title}
          </div>
          <div className="mt-0.5 text-[11.5px] leading-[1.6] text-text-2">{f.detail}</div>
        </div>
      ))}
    </div>
  );
}

/* [AI-29] 기준금리 임계 알림 등록 패널 */
function EconomyWatchPanel({ currentRate }: { currentRate: number }) {
  const [threshold, setThreshold] = useState(String(Math.round((currentRate + 0.25) * 100) / 100));
  const [direction, setDirection] = useState<"above" | "below">("above");
  const [state, setState] = useState<"idle" | "busy" | "done" | "fail" | "login">("idle");
  const [note, setNote] = useState("");

  const submit = async () => {
    if (state === "busy") return;
    setState("busy");
    try {
      const res = await fetch("/api/me/economy-watch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metric: "base_rate", threshold: Number(threshold), direction }),
      });
      const json: { ok?: boolean; note?: string; error?: string } = await res.json().catch(() => ({}));
      if (res.status === 401) setState("login");
      else if (res.ok && json.ok) {
        setState("done");
        setNote(json.note ?? "");
      } else {
        setState("fail");
        setNote(json.error ?? "");
      }
    } catch {
      setState("fail");
    }
  };

  return (
    <div className="card rounded-[16px] p-4">
      <div className="text-[13px] font-extrabold text-ink">
        기준금리 알림 걸기{" "}
        <span className="text-[11px] font-medium text-text-3">현재 {currentRate}% · 조건 도달 시 알림함으로 1회</span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select
          value={direction}
          onChange={(e) => setDirection(e.target.value as "above" | "below")}
          className="rounded-[10px] border border-line bg-surface px-2.5 py-2 text-[12.5px] font-bold text-ink"
        >
          <option value="above">이상으로 오르면</option>
          <option value="below">이하로 내리면</option>
        </select>
        <input
          value={threshold}
          onChange={(e) => setThreshold(e.target.value)}
          inputMode="decimal"
          className="w-[90px] rounded-[10px] border border-line bg-surface px-3 py-2 text-[13px] font-bold text-ink"
        />
        <span className="text-[12px] font-bold text-text-2">%</span>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={state === "busy" || state === "done"}
          className="rounded-[10px] bg-primary px-3.5 py-2 text-[12.5px] font-bold text-white disabled:opacity-60"
        >
          {state === "done" ? "등록됨 ✓" : state === "busy" ? "등록 중…" : "알림 등록"}
        </button>
      </div>
      {state === "login" && (
        <p className="mt-1.5 text-[11.5px] font-bold text-warning">로그인하면 알림을 걸 수 있어요.</p>
      )}
      {note && <p className="mt-1.5 text-[11.5px] text-text-3">{note}</p>}
    </div>
  );
}
