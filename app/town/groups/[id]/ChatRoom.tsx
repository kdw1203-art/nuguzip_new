"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

/* 시안 8p(모임 그룹 채팅방 · 모바일) + 10c(채팅방 메뉴 — 회원)
   실배선: POST /api/groups/[id]/chat → roomId,
   GET/POST /api/chat/rooms/[roomId]/messages (5초 폴링) */

type ThreadMessage = {
  id: string;
  senderEmail: string;
  body: string | null;
  messageType: "text" | "file" | "system";
  createdAt: string;
};

type ThreadMember = {
  userEmail: string;
  role: "owner" | "member" | "moderator";
};

type Phase = "joining" | "ready" | "error";

function displayName(email: string, myEmail: string): string {
  if (email === myEmail) return "나";
  const local = email.split("@")[0] ?? email;
  return local.length > 4 ? `${local.slice(0, 4)}***` : `${local}***`;
}

function timeLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
}

export function ChatRoom({
  groupId,
  myEmail,
  title,
  metaLine,
  memberCount,
}: {
  groupId: string;
  myEmail: string;
  title: string;
  metaLine: string;
  memberCount: number;
}) {
  const [phase, setPhase] = useState<Phase>("joining");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [members, setMembers] = useState<ThreadMember[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastCountRef = useRef(0);

  const loadThread = useCallback(async (rid: string) => {
    const res = await fetch(`/api/chat/rooms/${rid}/messages?limit=100`, {
      cache: "no-store",
    });
    if (!res.ok) return;
    const data = (await res.json()) as {
      messages?: ThreadMessage[];
      members?: ThreadMember[];
    };
    const sorted = [...(data.messages ?? [])].sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt),
    );
    setMessages(sorted);
    setMembers(
      (data.members ?? []).filter((m) => !m.userEmail.endsWith("@chat.local")),
    );
  }, []);

  /* 입장(멱등) → 스레드 로드 */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/groups/${groupId}/chat`, {
          method: "POST",
        });
        const data = (await res.json().catch(() => ({}))) as {
          roomId?: string;
          error?: { message?: string };
        };
        if (cancelled) return;
        if (!res.ok || !data.roomId) {
          setErrorMsg(
            data.error?.message ?? "채팅은 모임 참여 후 이용할 수 있어요.",
          );
          setPhase("error");
          return;
        }
        setRoomId(data.roomId);
        await loadThread(data.roomId);
        if (!cancelled) setPhase("ready");
      } catch {
        if (!cancelled) {
          setErrorMsg("채팅방 연결에 실패했어요. 잠시 후 다시 시도해 주세요.");
          setPhase("error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [groupId, loadThread]);

  /* 5초 폴링 */
  useEffect(() => {
    if (phase !== "ready" || !roomId) return;
    const t = setInterval(() => {
      void loadThread(roomId);
    }, 5000);
    return () => clearInterval(t);
  }, [phase, roomId, loadThread]);

  /* 새 메시지 도착 시 맨 아래로 */
  useEffect(() => {
    if (messages.length !== lastCountRef.current) {
      lastCountRef.current = messages.length;
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  const send = async () => {
    const text = draft.trim();
    if (!text || !roomId || sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/chat/rooms/${roomId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      if (res.ok) {
        setDraft("");
        await loadThread(roomId);
      } else {
        const data = (await res.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        setErrorMsg(data.error?.message ?? "전송에 실패했어요.");
      }
    } catch {
      setErrorMsg("전송에 실패했어요. 네트워크를 확인해 주세요.");
    } finally {
      setSending(false);
    }
  };

  const shownMemberCount = Math.max(members.length, 1);

  return (
    <div className="relative mx-auto flex h-dvh w-full max-w-[480px] flex-col overflow-hidden bg-bg">
      {/* ---------- 채팅방 헤더 ---------- */}
      <div className="glass mx-3.5 mt-3.5 flex items-center gap-2.5 rounded-2xl px-3.5 py-2.5">
        <Link
          href={`/town/groups/${groupId}`}
          aria-label="뒤로"
          className="text-base text-text-1"
        >
          ‹
        </Link>
        <div className="flex-1">
          <div className="text-sm font-extrabold text-ink">
            {title}{" "}
            <span className="text-[11px] font-semibold text-text-3">
              {phase === "ready" ? shownMemberCount : memberCount}
            </span>
          </div>
          <div className="text-[10px] text-text-3">{metaLine}</div>
        </div>
        <button
          type="button"
          aria-label="채팅방 메뉴"
          onClick={() => setMenuOpen(true)}
          className="text-[15px] text-text-1"
        >
          ☰
        </button>
      </div>

      {/* ---------- 메시지 ---------- */}
      <div
        ref={scrollRef}
        className="flex flex-1 flex-col gap-2.5 overflow-y-auto px-5 py-3.5"
      >
        {phase === "joining" && (
          <div className="self-center rounded-full bg-[rgba(25,31,40,.08)] px-3.5 py-[5px] text-[10px] text-text-2">
            채팅방에 연결하는 중…
          </div>
        )}

        {phase === "error" && (
          <div className="mt-8 flex flex-col items-center gap-2.5 self-center text-center">
            <div className="text-sm font-extrabold text-ink">
              채팅은 모임 참여 후 이용할 수 있어요
            </div>
            {errorMsg && (
              <p className="max-w-[280px] text-xs leading-[1.6] text-text-2">
                {errorMsg}
              </p>
            )}
            <Link
              href="/town/groups"
              className="btn-secondary rounded-xl px-4 py-2 text-xs no-underline"
            >
              모임 목록으로
            </Link>
          </div>
        )}

        {phase === "ready" && messages.length === 0 && (
          <div className="mt-8 flex flex-col items-center gap-1.5 self-center text-center">
            <div className="text-sm font-extrabold text-ink">
              아직 메시지가 없어요
            </div>
            <p className="text-xs text-text-2">
              첫 인사를 남기고 임장 일정을 잡아 보세요.
            </p>
          </div>
        )}

        {messages.map((m) => {
          if (m.messageType === "system") {
            return (
              <div
                key={m.id}
                className="self-center rounded-full bg-[rgba(25,31,40,.08)] px-3.5 py-[5px] text-[10px] text-text-2"
              >
                {m.body}
              </div>
            );
          }
          if (m.senderEmail === myEmail) {
            return (
              <div key={m.id} className="flex flex-col items-end gap-[3px]">
                <div className="btn-primary max-w-[240px] self-end whitespace-pre-wrap break-words rounded-[14px] rounded-br-[4px] px-[13px] py-2.5 text-[13px] font-normal leading-[1.5]">
                  {m.body}
                </div>
                <span className="text-[9px] text-text-3">
                  {timeLabel(m.createdAt)}
                </span>
              </div>
            );
          }
          return (
            <div key={m.id} className="flex items-end gap-2">
              <div className="h-7 w-7 shrink-0 rounded-full bg-gradient-to-br from-[#e2e8f2] to-[#eef2f8]" />
              <div>
                <div className="mb-[3px] text-[10px] text-text-3">
                  {displayName(m.senderEmail, myEmail)}
                </div>
                <div className="max-w-[240px] whitespace-pre-wrap break-words rounded-[14px] rounded-bl-[4px] border border-line bg-surface px-[13px] py-2.5 text-[13px] leading-[1.5] text-text-1">
                  {m.body}
                </div>
                <span className="text-[9px] text-text-3">
                  {timeLabel(m.createdAt)}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* ---------- 입력바 ---------- */}
      <div className="glass-strong mx-3.5 mb-[18px] flex items-center gap-2 rounded-[18px] px-3.5 py-2.5">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) void send();
          }}
          placeholder={
            phase === "ready" ? "메시지 입력…" : "채팅방 연결 후 입력할 수 있어요"
          }
          disabled={phase !== "ready"}
          className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-text-3 disabled:opacity-60"
        />
        <button
          type="button"
          aria-label="전송"
          onClick={() => void send()}
          disabled={phase !== "ready" || sending || !draft.trim()}
          className="btn-primary flex h-8 w-8 items-center justify-center rounded-full text-sm disabled:opacity-50"
        >
          ↑
        </button>
      </div>

      {/* ---------- 10c 채팅방 메뉴 (회원) ---------- */}
      {menuOpen && (
        <>
          <button
            type="button"
            aria-label="메뉴 닫기"
            onClick={() => setMenuOpen(false)}
            className="absolute inset-0 z-40 bg-[rgba(16,24,40,.3)] backdrop-blur-[2px]"
          />
          <div
            className="absolute bottom-0 right-0 top-0 z-50 flex w-[300px] flex-col gap-3 rounded-l-3xl bg-surface px-[18px] py-5"
            style={{ boxShadow: "-16px 0 44px rgba(16,28,54,.2)" }}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-extrabold text-ink">
                채팅방 메뉴{" "}
                <span className="rounded bg-[#f2f4f8] px-[7px] py-[2px] text-[9px] font-extrabold text-text-2">
                  회원
                </span>
              </span>
              <button
                type="button"
                aria-label="닫기"
                onClick={() => setMenuOpen(false)}
                className="text-[15px] text-text-3"
              >
                ✕
              </button>
            </div>

            <div className="flex flex-col gap-1 rounded-xl bg-bg px-3.5 py-3">
              <div className="text-[13px] font-extrabold text-ink">{title}</div>
              <div className="text-[11px] text-text-3">{metaLine}</div>
            </div>

            <div className="flex flex-col">
              <div className="py-1.5 text-[10px] font-extrabold tracking-widest text-[#adb5bd]">
                멤버 {shownMemberCount}
              </div>
              {members.map((m, i) => (
                <div
                  key={m.userEmail}
                  className={`flex items-center gap-2.5 py-[9px] ${
                    i < members.length - 1 ? "border-b border-[#f0f3f8]" : ""
                  }`}
                >
                  <div className="h-[30px] w-[30px] rounded-full bg-gradient-to-br from-[#e2e8f2] to-[#eef2f8]" />
                  <div className="flex-1">
                    <div className="text-xs font-bold text-ink">
                      {displayName(m.userEmail, myEmail)}{" "}
                      {m.role === "owner" && (
                        <span className="rounded bg-[#fdf3e7] px-[5px] py-px text-[9px] font-extrabold text-[#c07a3a]">
                          모임장
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {members.length === 0 && (
                <div className="py-2 text-[11px] text-text-3">
                  멤버 정보를 불러오는 중이에요.
                </div>
              )}
            </div>

            <div className="flex-1" />

            <div className="flex gap-2">
              <Link
                href={`/town/groups/${groupId}`}
                className="btn-secondary flex-1 rounded-xl p-2.5 text-center text-xs no-underline"
                onClick={() => setMenuOpen(false)}
              >
                모임 정보
              </Link>
              <Link
                href="/town/groups"
                className="btn-secondary flex-1 rounded-xl p-2.5 text-center text-xs no-underline"
                onClick={() => setMenuOpen(false)}
              >
                모임 목록
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
