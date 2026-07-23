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
  /** 유료 리포트 판매 실적 + 정산 예정 집계 (실데이터) */
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
        <span className="text-[14px] font-extrabold text-ink">
          내 콘텐츠 성과
        </span>
        <span className="text-[12px] text-text-3">전체 기간</span>
      </div>

      {/* 지표 4종 — 공개 노트·저장은 실데이터, 미집계는 "—" (허위 수치 금지) */}
      <div className="rise-in-2 grid grid-cols-2 gap-2 md:grid-cols-4">
        {tiles.map((s) => (
          <div key={s.label} className="card px-3 py-[10px]">
            <div className="text-[10px] text-text-3">{s.label}</div>
            <div className="mt-[2px] text-[17px] font-extrabold tabular-nums text-ink">
              {s.value}
            </div>
          </div>
        ))}
      </div>

      {/* 협찬 라벨 원칙 */}
      <div className="rise-in-3 rounded-[12px] bg-primary-soft px-4 py-[10px] text-[11px] font-bold leading-[1.6] text-primary">
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
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!res.ok) {
        setMsg({ ok: false, text: json.error ?? "등록에 실패했습니다." });
      } else {
        setMsg({ ok: true, text: "유료 리포트로 등록됐어요. 판매가 집계됩니다." });
        setTitle("");
        setDescription("");
        setPrice("300");
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
        <div className="text-[13px] font-extrabold text-ink">유료 리포트 판매 등록</div>
        <div className="mt-[2px] text-[11px] text-text-3">
          내 노트·분석을 유료 리포트로 승격해 포인트로 판매해요 (가격 100P~100,000P)
        </div>
      </div>

      {noteOptions.length > 0 && (
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-bold text-text-3">내 공개 노트에서 불러오기 (선택)</span>
          <select
            className="input w-full"
            defaultValue=""
            onChange={(e) => {
              const n = noteOptions.find((o) => o.id === e.target.value);
              if (n) setTitle(n.title);
            }}
          >
            <option value="">직접 입력</option>
            {noteOptions.map((n) => (
              <option key={n.id} value={n.id}>
                {n.title}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-bold text-text-3">제목</span>
        <input
          className="input w-full"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="예) 공작아파트 302동 임장 심화 리포트"
          maxLength={80}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-bold text-text-3">설명</span>
        <textarea
          className="input min-h-[80px] w-full"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="리포트에 담긴 내용을 요약해 주세요 (구매 전 미리보기로 노출)"
          maxLength={400}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-bold text-text-3">가격 (포인트)</span>
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
    { label: "정산 예정(P)", value: dash ?? fmt(sales.netPoints) },
  ];

  return (
    <div className="flex flex-col gap-3">
      {/* 실적 요약 */}
      <div className="rise-in grid grid-cols-2 gap-2 md:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="card px-3 py-[10px]">
            <div className="text-[10px] text-text-3">{t.label}</div>
            <div className="mt-[2px] text-[17px] font-extrabold tabular-nums text-ink">
              {t.value}
            </div>
          </div>
        ))}
      </div>

      {/* 정산 안내 — 정직하게 "현금 정산 준비 중" */}
      <div className="rise-in-2 rounded-[14px] bg-ink/[0.96] px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-extrabold text-white">정산 안내</span>
          <span className="rounded-full bg-[#f2c94c]/20 px-[8px] py-[2px] text-[10px] font-extrabold text-[#f2c94c]">
            현금 정산 준비 중
          </span>
        </div>
        <div className="mt-2 text-[11px] leading-[1.7] text-[#c7d0e0]">
          판매 대금은 포인트로 집계돼요 (1P ≈ 1원). 플랫폼 수수료 7% 차감 후
          {sales.available && (
            <>
              {" "}
              현재 정산 예정{" "}
              <b className="text-[#7ea2ff]">
                {fmt(sales.netPoints)}P (약 {fmt(sales.netKrw)}원)
              </b>
              이에요.
            </>
          )}
          <br />
          현금 전환(출금)은 관리자 승인 · 최소 정산액 30,000원 기준으로 준비 중이며,
          오픈 전까지는 판매 실적만 적립됩니다.
        </div>
      </div>

      {/* 등록 리포트 목록 */}
      <div className="rise-in-3 card px-4 py-4">
        <div className="text-[13px] font-extrabold text-ink">내 유료 리포트</div>
        {!sales.available ? (
          <div className="mt-3 rounded-[12px] bg-bg px-4 py-6 text-center text-[12px] text-text-3">
            판매 실적을 불러올 수 없어요 — 잠시 후 다시 확인해 주세요.
          </div>
        ) : sales.reports.length === 0 ? (
          <div className="mt-3 rounded-[12px] bg-bg px-4 py-6 text-center text-[12px] text-text-3">
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
                  <div className="truncate text-[13px] font-bold text-text-1">
                    {r.title}
                  </div>
                  <div className="mt-[2px] text-[11px] text-text-3">
                    {fmt(r.price)}P · 판매 {fmt(r.salesCount)}건 · 누적 {fmt(r.grossPoints)}P
                  </div>
                </div>
                <span
                  className={`shrink-0 rounded-full px-[9px] py-[3px] text-[10px] font-extrabold ${
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
        <MonetizationTab sales={props.sales} noteOptions={props.noteOptions} />
      )}
    </div>
  );
}
