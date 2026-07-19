"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageShell } from "../components/PageShell";

/* ============================================================
   알림 센터 (11d) — 필터 칩 + 좌측 컬러 보더 알림 카드
   실연동: 세션 있으면 GET /api/notifications (user_inbox_notifications)
   비로그인·실패 시 시안 목업 + 로그인 안내 유지
   ============================================================ */

const FILTERS = [
  { label: "전체", active: true },
  { label: "시세·매물", active: false },
  { label: "청약", active: false },
  { label: "소셜", active: false },
] as const;

type Notification = {
  tag: string;
  tagColor: string;
  tagBg: string;
  border: string | null;
  title: string;
  meta: string;
  read: boolean;
  actionUrl?: string | null;
};

const NOTIFICATIONS: Notification[] = [
  {
    tag: "급매",
    tagColor: "#d64545",
    tagBg: "#fdeeee",
    border: "#d64545",
    title: "공작아파트 급매 7.9억 등록 — 시세 대비 -6%",
    meta: "10분 전 · 관심 단지",
    read: false,
  },
  {
    tag: "AI",
    tagColor: "#1d4fd8",
    tagBg: "#edf2fe",
    border: "#1d4fd8",
    title: "매수 신호 68점 도달 — 알림 기준(70)까지 2점",
    meta: "2시간 전 · 관양동",
    read: false,
  },
  {
    tag: "청약",
    tagColor: "#c07a3a",
    tagBg: "#fdf3e7",
    border: "#c07a3a",
    title: "과천 S7 특별공급 접수 D-3",
    meta: "오늘 09:00 · 알림 신청 단지",
    read: false,
  },
  {
    tag: "모임",
    tagColor: "#6b7684",
    tagBg: "#f2f4f8",
    border: null,
    title: "과천 모임 채팅 — 투표가 시작됐어요",
    meta: "어제 · 읽음",
    read: true,
  },
  {
    tag: "소셜",
    tagColor: "#6b7684",
    tagBg: "#f2f4f8",
    border: null,
    title: "내 공개 노트에 댓글 2 · 저장 5",
    meta: "어제 · 읽음",
    read: true,
  },
];

/* ---------- 실데이터 (GET /api/notifications) ---------- */

type InboxItem = {
  id: string;
  title: string;
  body: string;
  actionUrl: string | null;
  readAt: string | null;
  createdAt: string;
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diff)) return "";
  const min = Math.floor(diff / 60000);
  if (min < 1) return "방금 전";
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}일 전`;
  return new Date(iso).toLocaleDateString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
  });
}

function toNotification(item: InboxItem): Notification {
  const read = Boolean(item.readAt);
  return {
    tag: "알림",
    tagColor: read ? "#6b7684" : "#1d4fd8",
    tagBg: read ? "#f2f4f8" : "#edf2fe",
    border: read ? null : "#1d4fd8",
    title: item.title,
    meta: `${relativeTime(item.createdAt)}${item.body ? ` · ${item.body}` : ""}${
      read ? " · 읽음" : ""
    }`,
    read,
    actionUrl: item.actionUrl,
  };
}

function NotificationCard({ n, index }: { n: Notification; index: number }) {
  const inner = (
    <div
      className={`rise-in-${Math.min(index + 1, 6)} card flex gap-2.5 rounded-[14px] px-[15px] py-[13px] ${
        n.read ? "opacity-75" : ""
      }`}
      style={n.border ? { borderLeft: `3px solid ${n.border}` } : undefined}
    >
      <div
        className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] text-[11px] font-extrabold"
        style={{ background: n.tagBg, color: n.tagColor }}
      >
        {n.tag}
      </div>
      <div className="flex-1">
        <div
          className={`text-xs font-bold leading-[1.45] ${
            n.read ? "text-text-1" : "text-ink"
          }`}
        >
          {n.title}
        </div>
        <div className="mt-[3px] text-[10px] text-text-3">{n.meta}</div>
      </div>
    </div>
  );
  if (n.actionUrl && n.actionUrl.startsWith("/")) {
    return <Link href={n.actionUrl}>{inner}</Link>;
  }
  return inner;
}

export default function NotificationsPage() {
  const [mode, setMode] = useState<"loading" | "live" | "guest">("loading");
  const [items, setItems] = useState<InboxItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/notifications");
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { items?: InboxItem[] };
        if (cancelled) return;
        setItems(Array.isArray(data.items) ? data.items : []);
        setMode("live");
      } catch {
        if (!cancelled) setMode("guest");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const markAllRead = async () => {
    if (mode !== "live") return;
    const now = new Date().toISOString();
    setItems((prev) => prev.map((i) => ({ ...i, readAt: i.readAt ?? now })));
    try {
      await fetch("/api/notifications/read-all", { method: "POST" });
    } catch {
      // 네트워크 실패 시에도 화면 표시는 유지
    }
  };

  const list: Notification[] =
    mode === "live" ? items.map(toNotification) : NOTIFICATIONS;

  return (
    <PageShell>
      <div className="mx-auto w-full max-w-[560px]">
        {/* 타이틀 + 모두 읽음 */}
        <div className="rise-in flex items-center justify-between">
          <h1 className="text-[22px] font-extrabold text-ink">알림</h1>
          <button
            type="button"
            onClick={markAllRead}
            className="text-xs font-bold text-primary"
          >
            모두 읽음
          </button>
        </div>

        {/* 필터 칩 */}
        <div className="rise-in-1 mt-3 flex gap-1.5">
          {FILTERS.map((f) => (
            <span
              key={f.label}
              className={`chip px-[13px] py-1.5 text-xs ${
                f.active
                  ? "chip-active"
                  : "border border-[#e2e7ee] bg-surface text-text-2"
              }`}
            >
              {f.label}
            </span>
          ))}
        </div>

        {/* 비로그인 안내 (목업 표시 중) */}
        {mode === "guest" && (
          <div className="rise-in-1 card mt-3 flex items-center justify-between rounded-[14px] border-l-[3px] border-l-primary px-[15px] py-3">
            <span className="text-xs font-bold text-ink">
              로그인하면 내 알림이 표시됩니다
            </span>
            <Link
              href="/login"
              className="shrink-0 text-xs font-extrabold text-primary"
            >
              로그인 ›
            </Link>
          </div>
        )}

        {/* 알림 리스트 */}
        <div className="mt-3 flex flex-col gap-2">
          {mode === "loading" &&
            [0, 1, 2].map((i) => (
              <div key={i} className="skeleton h-[60px] rounded-[14px]" />
            ))}

          {mode !== "loading" &&
            list.map((n, i) => (
              <NotificationCard key={`${n.title}-${i}`} n={n} index={i} />
            ))}

          {mode === "live" && list.length === 0 && (
            <div className="card rounded-[14px] px-[15px] py-8 text-center text-xs text-text-3">
              아직 도착한 알림이 없어요. 관심 단지를 팔로우하면 시세·급매 알림을
              받아볼 수 있어요.
            </div>
          )}
        </div>
      </div>
    </PageShell>
  );
}
