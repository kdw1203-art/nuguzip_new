"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CreatorSalesSummary } from "@/lib/creator/sales";

/* 내 콘텐츠 성과 + 유료 리포트 판매 — 탭 전환
   공개 노트·저장·판매 실적은 서버(page.tsx)에서 실데이터 주입 — 미집계 지표는 "—".
   사실 우선: 레벨·유입 기여·채널 어트리뷰션·탑 임장러 현황 등 집계 근거 없는 수치는 제거. */

const TABS = ["콘텐츠 성과", "유료 리포트"] as const;
type Tab = (typeof TABS)[number];

export type CreatorStats = {
  nickname: string | null;
  /** 내 공개 노트 수 (실데이터 · 조회 불가 시 "—") */
  publicNoteCount: string;
  /** 내 공개 노트가 받은 총 저장 수 (실데이터 · 조회 불가 시 "—") */
  totalSaves: string;
};

export type CreatorClientProps = CreatorStats & {
  /** 유료 리포트 판매 실적 + 보상 포인트 집계 (실데이터) */
  sales: CreatorSalesSummary;
  /** 유료 리포트로 승격 가능한 내 공개 노트 (제목 프리필용) */
  noteOptions: { id: string; title: string }[];
};

const fmt = (n: number) => n.toLocaleString("ko-KR");

function PerformanceTab({ stats }: { stats: CreatorStats }) {
  const tiles = [
    { label: "공개 노트", value: stats.publicNoteCount },
    { label: "저장", value: stats.totalSaves },
    { label: "SNS 공유", value: "—" },
    { label: "검색 노출", value: "—" },
  ];
  return (
    <div className="flex flex-col gap-3">
      {/* 상단 글래스 바 — 전체 기간 */}
      <div className="glass rise-in flex flex-wrap items-center gap-3 rounded-[14px] px-4 py-3">
        <span className="t-section text-ink">
          내 콘텐츠 성과
        </span>
        <span className="t-sub text-text-3">전체 기간</span>
      </div>

      {/* 지표 4종 — 공개 노트·저장은 실데이터, 미집계는 "—" (허위 수치 금지) */}
      <div className="rise-in-2 grid grid-cols-2 gap-2 md:grid-cols-4">
        {tiles.map((s) => (
          <div key={s.label} className="card px-3 py-[10px]">
            <div className="t-caption text-text-3">{s.label}</div>
            <div className="mt-[2px] t-section tabular-nums text-ink">
              {s.value}
            </div>
          </div>
        ))}
      </div>

      {/* 협찬 라벨 원칙 */}
      <div className="rise-in-3 rounded-[10px] bg-primary-soft px-4 py-[10px] t-sub font-bold text-primary">
        협찬·제공 받은 임장은 반드시 &quot;광고&quot; 라벨을 켜야 해요 — 미표시
        확인 시 노출 제한
      </div>
    </div>
  );
}

/* ── 유료 리포트 판매 등록 폼 ─────────────────────────────── */
function SellReportForm({
  noteOptions,
}: {
  noteOptions: { id: string; title: string }[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [sourceNoteId, setSourceNoteId] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("300");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setMsg(null);
    setBusy(true);
    try {
      const res = await fetch("/api/creator/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          price: Number(price),
          // 전달물 — 구매자가 열람할 내 노트 (필수)
          sourceNoteId,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!res.ok) {
        setMsg({ ok: false, text: json.error ?? "등록에 실패했습니다." });
      } else {
        setMsg({ ok: true, text: "유료 리포트로 등록됐어요. 구매자는 연결한 노트를 열람합니다." });
        setTitle("");
        setDescription("");
        setPrice("300");
        setSourceNoteId("");
        router.refresh();
      }
    } catch {
      setMsg({ ok: false, text: "네트워크 오류가 발생했습니다." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="rise-in-4 card flex flex-col gap-3 px-4 py-4">
      <div>
        <div className="t-body font-extrabold text-ink">유료 리포트 판매 등록</div>
        <div className="mt-[2px] t-sub text-text-3">
          내 노트·분석을 유료 리포트로 승격해 포인트로 판매해요 (가격 100P~100,000P)
        </div>
      </div>

      {noteOptions.length > 0 && (
        <label className="flex flex-col gap-1">
          <span className="t-sub font-bold text-text-3">
            판매할 내 노트 (필수) — 구매자가 이 노트를 열람해요
          </span>
          <select
            className="input w-full"
            value={sourceNoteId}
            onChange={(e) => {
              setSourceNoteId(e.target.value);
              const n = noteOptions.find((o) => o.id === e.target.value);
              if (n && !title.trim()) setTitle(n.title);
            }}
          >
            <option value="">노트를 선택해 주세요</option>
            {noteOptions.map((n) => (
              <option key={n.id} value={n.id}>
                {n.title}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="flex flex-col gap-1">
        <span className="t-sub font-bold text-text-3">제목</span>
        <input
          className="input w-full"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="예) 공작아파트 302동 임장 심화 리포트"
          maxLength={80}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="t-sub font-bold text-text-3">설명</span>
        <textarea
          className="input min-h-[80px] w-full"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="리포트에 담긴 내용을 요약해 주세요 (구매 전 미리보기로 노출)"
          maxLength={400}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="t-sub font-bold text-text-3">가격 (포인트)</span>
        <input
          type="number"
          className="input w-[160px]"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          min={100}
          max={100000}
          step={100}
        />
      </label>

      {msg && (
        <div
          className={`rounded-[10px] px-3 py-[9px] text-[12px] font-bold ${
            msg.ok
              ? "bg-primary-soft text-primary"
              : "bg-danger/10 text-danger"
          }`}
        >
          {msg.text}
        </div>
      )}

      <button type="submit" disabled={busy} className="btn-primary btn-md self-start disabled:opacity-60">
        {busy ? "등록 중…" : "유료 리포트로 등록"}
      </button>
    </form>
  );
}

/* ── 유료 리포트 탭 (판매 실적 + 정산 안내 + 목록 + 등록) ────── */
function MonetizationTab({
  sales,
  noteOptions,
}: {
  sales: CreatorSalesSummary;
  noteOptions: { id: string; title: string }[];
}) {
  const dash = sales.available ? null : "—";
  const tiles = [
    { label: "등록 리포트", value: dash ?? fmt(sales.totalReports) },
    { label: "총 판매", value: dash ?? `${fmt(sales.totalSales)}건` },
    { label: "누적 판매(P)", value: dash ?? fmt(sales.grossPoints) },
    {
      label: "적립 포인트(현금 전환 불가)",
      value: dash ?? fmt(sales.netPoints),
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      {/* 실적 요약 */}
      <div className="rise-in grid grid-cols-2 gap-2 md:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="card px-3 py-[10px]">
            <div className="t-caption text-text-3">{t.label}</div>
            <div className="mt-[2px] t-section tabular-nums text-ink">
              {t.value}
            </div>
          </div>
        ))}
      </div>

      {/* 포인트 안내 — 2026-08-23 토스 회신 반영: 현금 전환·원화 환산 표기를 전부
          제거했다. 판매 보상 포인트는 무상 리워드와 동일한 규칙(현금 전환·출금 불가,
          사이트 내부 혜택 사용)을 따른다 — "1P≈1원"·"출금 오픈 전까지" 같은 환금성
          암시 문구가 유의업종 오해의 근거가 된다. */}
      <div className="rise-in-2 rounded-[14px] bg-brand-navy/[0.96] px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="t-body font-extrabold text-white">판매 보상 안내</span>
          <span className="rounded-full bg-[rgba(224,86,58,.18)] chip-pad t-caption font-extrabold text-brand-red-dark">
            현금 전환 불가
          </span>
        </div>
        <div className="mt-2 t-sub text-on-dark-muted">
          리포트가 열람되면 플랫폼 몫 7%를 뺀 포인트가 적립돼요
          {sales.available && (
            <>
              {" "}
              — 현재 누적{" "}
              <b className="text-ai-accent">{fmt(sales.netPoints)}P</b>
            </>
          )}
          .
          <br />
          포인트는 현금으로 전환·출금되지 않으며, 포인트 상점의 서비스 내
          혜택(매물 상단 노출·꾸미기 등)에만 쓸 수 있어요.
        </div>
      </div>

      {/* 등록 리포트 목록 */}
      <div className="rise-in-3 card px-4 py-4">
        <div className="t-body font-extrabold text-ink">내 유료 리포트</div>
        {!sales.available ? (
          <div className="mt-3 rounded-[10px] bg-bg px-4 py-6 text-center t-sub text-text-3">
            판매 실적을 불러올 수 없어요 — 잠시 후 다시 확인해 주세요.
          </div>
        ) : sales.reports.length === 0 ? (
          <div className="mt-3 rounded-[10px] bg-bg px-4 py-6 text-center t-sub text-text-3">
            아직 등록한 유료 리포트가 없어요. 아래에서 첫 리포트를 판매해 보세요.
          </div>
        ) : (
          <div className="mt-2 flex flex-col gap-[6px]">
            {sales.reports.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between gap-3 rounded-[10px] bg-bg px-3 py-[10px]"
              >
                <div className="min-w-0">
                  <div className="truncate t-body font-bold text-text-1">
                    {r.title}
                  </div>
                  <div className="mt-[2px] t-sub text-text-3">
                    {fmt(r.price)}P · 판매 {fmt(r.salesCount)}건 · 누적 {fmt(r.grossPoints)}P
                  </div>
                </div>
                <span
                  className={`shrink-0 rounded-full chip-pad text-[10px] font-extrabold ${
                    r.isPremium
                      ? "bg-primary-soft text-primary"
                      : "bg-line text-text-3"
                  }`}
                >
                  {r.isPremium ? "판매중" : "무료"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 판매 등록 폼 */}
      <SellReportForm noteOptions={noteOptions} />
    </div>
  );
}

export function CreatorClient(props: CreatorClientProps) {
  const [tab, setTab] = useState<Tab>("콘텐츠 성과");

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-[6px]">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={tab === t ? "chip-active" : "chip"}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === "콘텐츠 성과" ? (
        <PerformanceTab stats={props} />
      ) : (
        <MonetizationTab
          sales={props.sales}
          noteOptions={props.noteOptions}
        />
      )}
    </div>
  );
}
