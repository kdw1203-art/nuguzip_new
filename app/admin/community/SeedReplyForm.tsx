"use client";

import { useState } from "react";

/* [#121] 시드 답글 빠른 폼 — 글 하나에 공식 답글 게시 */
export function SeedReplyForm({ postId, postTitle }: { postId: string; postTitle: string }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done" | "err">("idle");
  const [err, setErr] = useState("");

  if (state === "done") {
    return <span className="text-[11px] font-bold text-[#4ecb8a]">답글 게시됨 ✓</span>;
  }
  return (
    <div className="flex flex-col gap-1.5">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-fit rounded-lg bg-[#3182f6] px-3 py-1.5 text-[11px] font-bold text-white"
        >
          시드 답글 달기
        </button>
      ) : (
        <>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            placeholder={`"${postTitle.slice(0, 30)}" 에 누구집 공식 답글…`}
            className="w-full rounded-lg border border-[rgba(255,255,255,.14)] bg-[#0d1119] p-2.5 text-[12px] text-[#e7ecf5]"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={state === "busy" || text.trim().length < 5}
              onClick={async () => {
                setState("busy");
                setErr("");
                try {
                  const res = await fetch("/api/admin/community/seed-reply", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ postId, text }),
                  });
                  const j: { error?: string } = await res.json().catch(() => ({}));
                  if (!res.ok) {
                    setErr(j.error ?? "실패");
                    setState("err");
                    return;
                  }
                  setState("done");
                } catch {
                  setErr("네트워크 오류");
                  setState("err");
                }
              }}
              className="rounded-lg bg-[#3182f6] px-3.5 py-1.5 text-[11px] font-bold text-white disabled:opacity-50"
            >
              {state === "busy" ? "게시 중…" : "공식 답글 게시"}
            </button>
            {err && <span className="text-[11px] font-bold text-[#ff6b6b]">{err}</span>}
          </div>
        </>
      )}
    </div>
  );
}
