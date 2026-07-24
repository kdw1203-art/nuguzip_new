"use client";

/* I2 — 내 매물 수정/삭제 (소유자 본인).
   수정: 인라인 폼(거래유형·가격[만원]·면적·층·설명·연락처) → PATCH /api/listings/[id].
         승인 매물을 수정하면 서버가 재검수(pending)로 되돌린다.
   삭제: 오클릭 방지 2단계 → DELETE(소프트 삭제). 브라우저 confirm() 미사용. */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/app/components/toast/ToastProvider";
import type { ListingType, ListingStatus } from "@/lib/listings/store-db";

const TYPES: { key: ListingType; label: string }[] = [
  { key: "sale", label: "매매" },
  { key: "jeonse", label: "전세" },
  { key: "monthly", label: "월세" },
];

function wonToManwon(won: number | null): string {
  if (won === null || !Number.isFinite(won) || won <= 0) return "";
  return String(Math.round(won / 10000));
}
function manwonToWon(s: string): number | null {
  const n = Number(s.trim());
  return s.trim() && Number.isFinite(n) && n > 0 ? Math.round(n) * 10000 : null;
}

export function ListingManageActions(props: {
  listingId: string;
  listingType: ListingType;
  priceKrw: number | null;
  depositKrw: number | null;
  monthlyKrw: number | null;
  areaM2: number | null;
  floor: number | null;
  description: string | null;
  contact: string | null;
  status: ListingStatus;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [mode, setMode] = useState<"idle" | "edit" | "confirmDelete" | "busy">("idle");

  const [type, setType] = useState<ListingType>(props.listingType);
  const [price, setPrice] = useState(wonToManwon(props.priceKrw));
  const [deposit, setDeposit] = useState(wonToManwon(props.depositKrw));
  const [monthly, setMonthly] = useState(wonToManwon(props.monthlyKrw));
  const [area, setArea] = useState(props.areaM2 != null ? String(props.areaM2) : "");
  const [floor, setFloor] = useState(props.floor != null ? String(props.floor) : "");
  const [desc, setDesc] = useState(props.description ?? "");
  const [contact, setContact] = useState(props.contact ?? "");

  async function save() {
    setMode("busy");
    const bodyPatch: Record<string, unknown> = {
      listingType: type,
      priceKrw: type === "sale" ? manwonToWon(price) : null,
      depositKrw: type === "sale" ? null : manwonToWon(deposit),
      monthlyKrw: type === "monthly" ? manwonToWon(monthly) : null,
      areaM2: area.trim() ? Number(area) : null,
      floor: floor.trim() ? Number(floor) : null,
      description: desc.trim() || null,
      contact: contact.trim() || null,
    };
    try {
      const res = await fetch(`/api/listings/${props.listingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyPatch),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        status?: string;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        showToast(json.error ?? "수정에 실패했어요");
        setMode("edit");
        return;
      }
      showToast(
        json.status === "pending" && props.status === "approved"
          ? "수정했어요. 재검수 후 다시 노출돼요."
          : "매물을 수정했어요.",
      );
      setMode("idle");
      router.refresh();
    } catch {
      showToast("네트워크 오류가 발생했어요");
      setMode("edit");
    }
  }

  async function remove() {
    setMode("busy");
    try {
      const res = await fetch(`/api/listings/${props.listingId}`, { method: "DELETE" });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        showToast(json.error ?? "삭제에 실패했어요");
        setMode("idle");
        return;
      }
      showToast("매물을 삭제했어요.");
      router.refresh();
    } catch {
      showToast("네트워크 오류가 발생했어요");
      setMode("idle");
    }
  }

  if (mode === "edit" || mode === "busy") {
    const input =
      "w-full rounded-[8px] border border-line bg-surface px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-primary";
    const lbl = "text-[11px] font-bold text-text-3";
    return (
      <div className="mt-1 flex w-full flex-col gap-2 rounded-xl bg-[rgba(29,79,216,.03)] p-3">
        <div className="flex gap-1.5">
          {TYPES.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setType(t.key)}
              className={`flex-1 rounded-[8px] py-1.5 text-[12px] font-extrabold ${
                type === t.key ? "bg-primary text-white" : "bg-[#f2f4f8] text-text-2"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {type === "sale" && (
          <label className="flex flex-col gap-1">
            <span className={lbl}>매매가 (만원)</span>
            <input
              inputMode="numeric"
              value={price}
              onChange={(e) => setPrice(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder="예: 180000 (18억)"
              className={input}
            />
          </label>
        )}
        {type !== "sale" && (
          <label className="flex flex-col gap-1">
            <span className={lbl}>보증금 (만원)</span>
            <input
              inputMode="numeric"
              value={deposit}
              onChange={(e) => setDeposit(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder="예: 50000 (5억)"
              className={input}
            />
          </label>
        )}
        {type === "monthly" && (
          <label className="flex flex-col gap-1">
            <span className={lbl}>월세 (만원)</span>
            <input
              inputMode="numeric"
              value={monthly}
              onChange={(e) => setMonthly(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder="예: 120"
              className={input}
            />
          </label>
        )}

        <div className="flex gap-2">
          <label className="flex flex-1 flex-col gap-1">
            <span className={lbl}>전용면적 (㎡)</span>
            <input
              inputMode="decimal"
              value={area}
              onChange={(e) => setArea(e.target.value.replace(/[^0-9.]/g, ""))}
              placeholder="84.9"
              className={input}
            />
          </label>
          <label className="flex flex-1 flex-col gap-1">
            <span className={lbl}>층</span>
            <input
              inputMode="numeric"
              value={floor}
              onChange={(e) => setFloor(e.target.value.replace(/[^0-9-]/g, ""))}
              placeholder="10"
              className={input}
            />
          </label>
        </div>

        <label className="flex flex-col gap-1">
          <span className={lbl}>설명</span>
          <textarea
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            rows={2}
            maxLength={2000}
            className={`${input} resize-none`}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className={lbl}>연락처</span>
          <input
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            maxLength={100}
            placeholder="010-0000-0000"
            className={input}
          />
        </label>

        {props.status === "approved" && (
          <div className="rounded-lg bg-[rgba(245,158,11,.1)] px-2.5 py-1.5 text-[11px] leading-[1.6] text-[#b45309]">
            노출 중인 매물을 수정하면 재검수를 위해 잠시 검수중 상태로 전환돼요.
          </div>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            disabled={mode === "busy"}
            onClick={() => void save()}
            className="btn-primary btn-sm flex-1 disabled:opacity-50"
          >
            {mode === "busy" ? "저장 중…" : "저장"}
          </button>
          <button
            type="button"
            disabled={mode === "busy"}
            onClick={() => setMode("idle")}
            className="btn-ghost btn-sm"
          >
            취소
          </button>
        </div>
      </div>
    );
  }

  if (mode === "confirmDelete") {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="text-[12px] font-bold text-text-3">삭제할까요?</span>
        <button
          type="button"
          onClick={() => void remove()}
          className="rounded-[8px] bg-[#d64545] px-2.5 py-1 text-[12px] font-extrabold text-white"
        >
          삭제
        </button>
        <button
          type="button"
          onClick={() => setMode("idle")}
          className="btn-ghost btn-sm"
        >
          취소
        </button>
      </span>
    );
  }

  return (
    <span className="inline-flex gap-2">
      <button type="button" onClick={() => setMode("edit")} className="btn-outline btn-sm">
        수정
      </button>
      <button
        type="button"
        onClick={() => setMode("confirmDelete")}
        className="btn-ghost btn-sm text-[#d64545]"
      >
        삭제
      </button>
    </span>
  );
}
