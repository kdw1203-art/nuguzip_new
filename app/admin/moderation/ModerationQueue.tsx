"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { QueueItem, QueueStatus } from "@/lib/admin/moderation-queue";

/**
 * 실제 신고 큐 — content_reports · chat_reports 실행.
 * 상태 변경은 PATCH /api/admin/moderation. 브라우저 confirm() 은 쓰지 않는다.
 */

const STATUS_META: Record<QueueStatus, { label: string; color: string; bg: string }> = {
  open: { label: "미처리", color: "#f2c94c", bg: "rgba(242,201,76,.14)" },
  reviewed: { label: "처리완료", color: "var(--ai-success)", bg: "rgba(74,222,128,.14)" },
  actioned: { label: "제재", color: "var(--ai-danger)", bg: "rgba(248,113,113,.14)" },
  dismissed: { label: "기각", color: "#9aa6b8", bg: "rgba(154,166,184,.14)" },
};

const SOURCE_LABEL: Record<string, string> = {
  content: "커뮤니티",
  chat: "채팅",
};

function ago(hours: number): string {
  if (hours < 1) return "방금";
  if (hours < 24) return `${Math.floor(hours)}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}

function mask(email: string | null): string {
  if (!email) return "익명";
  const [id, domain] = email.split("@");
  if (!domain) return email.slice(0, 3) + "…";
  return `${id.slice(0, 2)}…@${domain}`;
}

type Filter = "open" | "all";

export function ModerationQueue({ items }: { items: QueueItem[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("open");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const shown = filter === "open" ? items.filter((i) => i.status === "open") : items;

  async function act(item: QueueItem, status: QueueStatus) {
    const key = `${item.source}:${item.id}`;
    if (busy) return;
    setBusy(key);
    setError(null);
    try {
      const res = await fetch("/api/admin/moderation", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: item.source, id: item.id, status }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) setError(json.error ?? `처리 실패 (${res.status})`);
      else router.refresh();
    } catch {
      setError("네트워크 오류");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        {(["open", "all"] as Filter[]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded-lg px-3 py-1.5 text-[12px] font-bold ${
              filter === f
                ? "bg-ai-accent text-[#0e1320]"
                : "border border-[rgba(255,255,255,.12)] text-[#9aa6b8]"
            }`}
          >
            {f === "open" ? `미처리 ${items.filter((i) => i.status === "open").length}` : `전체 ${items.length}`}
          </button>
        ))}
      </div>

      {error && <div className="text-[12px] text-ai-danger">{error}</div>}

      {shown.length === 0 ? (
        <div className="rounded-xl border border-[rgba(255,255,255,.08)] bg-[rgba(255,255,255,.03)] px-4 py-8 text-center">
          <div className="text-[13px] font-bold text-white">
            {filter === "open" ? "미처리 신고가 없습니다" : "접수된 신고가 없습니다"}
          </div>
          <div className="mt-1 text-[10px] text-[#9aa6b8]">
            커뮤니티 글·댓글 신고와 채팅 신고가 들어오면 여기에 바로 표시됩니다.
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {shown.map((item) => {
            const key = `${item.source}:${item.id}`;
            const meta = STATUS_META[item.status];
            return (
              <div
                key={key}
                className="rounded-xl border border-[rgba(255,255,255,.07)] bg-[rgba(255,255,255,.03)] px-3.5 py-3"
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <span
                    className="rounded px-1.5 py-px text-[10px] font-bold"
                    style={{ color: meta.color, background: meta.bg }}
                  >
                    {meta.label}
                  </span>
                  <span className="rounded bg-[rgba(126,162,255,.14)] px-1.5 py-px text-[10px] font-bold text-ai-accent">
                    {SOURCE_LABEL[item.source] ?? item.source}
                  </span>
                  {item.category && (
                    <span className="text-[10px] text-[#9aa6b8]">{item.category}</span>
                  )}
                  <span className="ml-auto text-[10px] text-[#6b7688]">
                    {ago(item.ageHours)}
                  </span>
                </div>

                <div className="mt-1.5 break-words text-[12px] text-white">
                  {item.reason || "(사유 미기재)"}
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 text-[10px] text-[#9aa6b8]">
                  <span>신고자 {mask(item.reporter)}</span>
                  {item.target && (
                    <span>
                      대상 {item.targetKind ?? ""}{" "}
                      <code className="text-[#6b7688]">
                        {item.target.includes("@") ? mask(item.target) : item.target.slice(0, 8)}
                      </code>
                    </span>
                  )}
                  {item.handledAt && <span>처리 {item.handledAt.slice(0, 10)}</span>}
                </div>

                {item.status === "open" && (
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy === key}
                      onClick={() => void act(item, "reviewed")}
                      className="rounded-lg border border-[rgba(74,222,128,.4)] px-3 py-1.5 text-[12px] font-bold text-ai-success disabled:opacity-50"
                    >
                      처리 완료
                    </button>
                    {item.source === "chat" && (
                      <button
                        type="button"
                        disabled={busy === key}
                        onClick={() => void act(item, "actioned")}
                        className="rounded-lg border border-[rgba(248,113,113,.4)] px-3 py-1.5 text-[12px] font-bold text-ai-danger disabled:opacity-50"
                      >
                        제재 적용
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={busy === key}
                      onClick={() => void act(item, "dismissed")}
                      className="rounded-lg border border-[rgba(255,255,255,.14)] px-3 py-1.5 text-[12px] font-bold text-[#9aa6b8] disabled:opacity-50"
                    >
                      기각
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
