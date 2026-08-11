"use client";

/* I1 — 매물 소유확인 심사 큐.
   신청자가 올린 증빙을 실제로 열어 본 뒤 승인/반려한다. 반려는 사유 필수.
   오클릭 방지 2단계 확인. 브라우저 confirm() 미사용. */

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { OwnerVerificationItem } from "@/lib/listings/owner-verification";

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: "심사 대기", color: "#f2c94c", bg: "rgba(242,201,76,.14)" },
  approved: { label: "승인", color: "var(--ai-success)", bg: "rgba(74,222,128,.14)" },
  rejected: { label: "반려", color: "var(--ai-danger)", bg: "rgba(248,113,113,.14)" },
};

function ago(hours: number): string {
  if (hours < 1) return "방금";
  if (hours < 24) return `${Math.floor(hours)}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}

function mask(email: string): string {
  const [id, domain] = email.split("@");
  if (!domain) return email.slice(0, 3) + "…";
  return `${id.slice(0, 2)}…@${domain}`;
}

type Phase = "idle" | "approve" | "reject" | "busy";

function Row({ item }: { item: OwnerVerificationItem }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const meta = STATUS_META[item.status] ?? STATUS_META.pending;

  async function submit(decision: "approve" | "reject") {
    setPhase("busy");
    setError(null);
    try {
      const res = await fetch("/api/admin/owner-verifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: item.id,
          decision,
          note: decision === "reject" ? reason : undefined,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error ?? "처리에 실패했어요");
        setPhase("idle");
        return;
      }
      router.refresh();
    } catch {
      setError("네트워크 오류가 발생했어요");
      setPhase("idle");
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-[rgba(255,255,255,.08)] bg-[rgba(255,255,255,.04)] p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className="rounded-[6px] chip-pad text-[10px] font-extrabold"
          style={{ color: meta.color, background: meta.bg }}
        >
          {meta.label}
        </span>
        <span className="text-[14px] font-extrabold text-white">
          {item.complexName || "이름 없음"}
        </span>
        {item.region && <span className="text-[11px] text-[#9aa6b8]">{item.region}</span>}
        <span className="ml-auto text-[10px] text-[#6b7688]">{ago(item.ageHours)}</span>
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[#9aa6b8]">
        <span>신청자 {mask(item.applicantEmail)}</span>
        {item.propertyAddress && <span>{item.propertyAddress}</span>}
        {item.listingId && (
          <Link
            href={`/listings/${item.listingId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-ai-accent no-underline"
          >
            매물 보기 ›
          </Link>
        )}
      </div>

      {item.note && <div className="text-[11.5px] text-[#c9d2e0]">신청 메모: {item.note}</div>}

      {/* 증빙 — 관리자만 접근하는 화면에서 원본을 새 탭으로 연다 */}
      <div className="flex flex-wrap gap-2">
        {item.documents.length === 0 ? (
          <span className="rounded-lg border border-[rgba(248,113,113,.35)] px-2.5 py-1 text-[10.5px] font-bold text-ai-danger">
            첨부된 증빙 없음
          </span>
        ) : (
          item.documents.map((d, i) => (
            <a
              key={`${item.id}-doc-${i}`}
              href={d.url}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-[rgba(126,162,255,.4)] px-2.5 py-1 text-[10.5px] font-bold text-ai-accent no-underline"
            >
              증빙 {i + 1} 열기{d.mime ? ` (${d.mime.split("/")[1] ?? d.mime})` : ""}
            </a>
          ))
        )}
      </div>

      {item.status !== "pending" && item.adminNote && (
        <div className="text-[10.5px] text-[#6b7688]">
          {item.adminNote}
          {item.reviewedAt ? ` · ${item.reviewedAt.slice(0, 10)}` : ""}
        </div>
      )}

      {error && <div className="text-[11px] text-ai-danger">{error}</div>}

      {item.status === "pending" && phase === "idle" && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setPhase("approve")}
            className="rounded-lg border border-[rgba(74,222,128,.4)] px-3 py-1.5 text-[11px] font-bold text-ai-success"
          >
            승인
          </button>
          <button
            type="button"
            onClick={() => setPhase("reject")}
            className="rounded-lg border border-[rgba(248,113,113,.4)] px-3 py-1.5 text-[11px] font-bold text-ai-danger"
          >
            반려
          </button>
        </div>
      )}

      {phase === "approve" && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-auto text-[10.5px] text-[#9aa6b8]">
            증빙을 확인했다면 승인하세요. 승인 시 매물에 소유확인 배지가 표시됩니다.
          </span>
          <button
            type="button"
            onClick={() => void submit("approve")}
            className="rounded-lg bg-ai-success px-3 py-1.5 text-[11px] font-extrabold text-[#0e1320]"
          >
            승인 확정
          </button>
          <button
            type="button"
            onClick={() => setPhase("idle")}
            className="rounded-lg border border-[rgba(255,255,255,.14)] px-3 py-1.5 text-[11px] font-bold text-[#9aa6b8]"
          >
            취소
          </button>
        </div>
      )}

      {phase === "reject" && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="반려 사유 (신청자에게 그대로 전달돼요)"
            className="min-w-0 flex-1 rounded-lg border border-[rgba(255,255,255,.14)] bg-[rgba(255,255,255,.04)] px-2.5 py-1.5 text-[11.5px] text-white outline-none"
          />
          <button
            type="button"
            disabled={!reason.trim()}
            onClick={() => void submit("reject")}
            className="rounded-lg bg-ai-danger px-3 py-1.5 text-[11px] font-extrabold text-[#0e1320] disabled:opacity-40"
          >
            반려 확정
          </button>
          <button
            type="button"
            onClick={() => {
              setPhase("idle");
              setReason("");
            }}
            className="rounded-lg border border-[rgba(255,255,255,.14)] px-3 py-1.5 text-[11px] font-bold text-[#9aa6b8]"
          >
            취소
          </button>
        </div>
      )}

      {phase === "busy" && <div className="text-[10.5px] text-[#9aa6b8]">처리 중…</div>}
    </div>
  );
}

export function OwnerVerificationQueue({ items }: { items: OwnerVerificationItem[] }) {
  const [showAll, setShowAll] = useState(false);
  const pending = items.filter((i) => i.status === "pending");
  const shown = showAll ? items : pending;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setShowAll(false)}
          className={`rounded-lg px-3 py-1.5 text-[11.5px] font-bold ${
            !showAll
              ? "bg-ai-accent text-[#0e1320]"
              : "border border-[rgba(255,255,255,.12)] text-[#9aa6b8]"
          }`}
        >
          심사 대기 {pending.length}
        </button>
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className={`rounded-lg px-3 py-1.5 text-[11.5px] font-bold ${
            showAll
              ? "bg-ai-accent text-[#0e1320]"
              : "border border-[rgba(255,255,255,.12)] text-[#9aa6b8]"
          }`}
        >
          전체 {items.length}
        </button>
      </div>

      {shown.length === 0 ? (
        <div className="rounded-xl border border-[rgba(255,255,255,.08)] bg-[rgba(255,255,255,.03)] px-4 py-8 text-center">
          <div className="text-[12.5px] font-bold text-white">
            {showAll ? "접수된 소유확인 신청이 없습니다" : "심사 대기 중인 신청이 없습니다"}
          </div>
          <div className="mt-1 text-[10.5px] text-[#9aa6b8]">
            소유자가 내 매물에서 증빙을 올리면 여기에 표시됩니다.
          </div>
        </div>
      ) : (
        shown.map((item) => <Row key={item.id} item={item} />)
      )}
    </div>
  );
}
