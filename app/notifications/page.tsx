"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageShell } from "../components/PageShell";
import { useToast } from "@/app/components/toast/ToastProvider";

/* ============================================================
   통합 알림 센터 — 탭/필터 + 실데이터 병합
   소스: 받은편지함(GET /api/notifications → items) + 포인트 원장(→ points)
   탭: 전체 · 매물(승인/소유확인) · 관심지역(새 매물) · 활동(댓글·좋아요) · 포인트
   - 안 읽음 카운트 · "모두 읽음"(read-all) · 항목 클릭 시 읽음 처리 후 이동
   - 포인트 행은 읽기 전용(이동/읽음 없음)
   - 비로그인 → 로그인 안내 + 샘플 미리보기
   ============================================================ */

type Category = "매물" | "관심지역" | "활동" | "포인트";
type TabKey = "전체" | Category;

type InboxItem = {
  id: string;
  title: string;
  body: string;
  actionUrl: string | null;
  readAt: string | null;
  createdAt: string;
};

type PointNotification = {
  id: string;
  delta: number;
  label: string;
  balance: number;
  createdAt: string;
};

type UnifiedItem = {
  kind: "inbox" | "point";
  id: string;
  category: Category;
  title: string;
  body: string;
  actionUrl: string | null;
  read: boolean;
  createdAt: string;
  delta?: number;
};

const TABS: { key: TabKey; label: string }[] = [
  { key: "전체", label: "전체" },
  { key: "매물", label: "매물" },
  { key: "관심지역", label: "관심지역" },
  { key: "활동", label: "활동" },
  { key: "포인트", label: "포인트" },
];

const TAG: Record<Category, string> = {
  매물: "매물",
  관심지역: "지역",
  활동: "활동",
  포인트: "P",
};

const UNREAD_STYLE: Record<Category, { bg: string; color: string; border: string }> = {
  매물: { bg: "var(--primary-soft)", color: "var(--primary)", border: "var(--primary)" },
  관심지역: { bg: "var(--success-soft)", color: "var(--success)", border: "var(--success)" },
  활동: { bg: "#efeafe", color: "#6b40d8", border: "#6b40d8" },
  포인트: { bg: "var(--warning-soft)", color: "var(--warning)", border: "var(--warning)" },
};

const EMPTY: Record<TabKey, string> = {
  전체: "아직 알림이 없어요. 관심 지역·키워드를 구독하면 새 소식을 여기에서 받아볼 수 있어요.",
  매물: "매물 승인·소유확인 관련 알림이 아직 없어요.",
  관심지역: "관심 지역의 새 매물 알림이 아직 없어요.",
  활동: "댓글·좋아요 등 활동 알림이 아직 없어요.",
  포인트: "포인트 적립·소비 내역이 아직 없어요.",
};

/* ---------- 유틸 ---------- */

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

/** 받은편지함 제목/본문 키워드로 카테고리 추론 (관심지역 우선) */
function classifyInbox(title: string, body: string): Category {
  const t = `${title} ${body}`;
  if (t.includes("관심 지역") || t.includes("관심지역")) return "관심지역";
  if (t.includes("댓글") || t.includes("좋아요")) return "활동";
  if (
    t.includes("매물") ||
    t.includes("승인") ||
    t.includes("소유확인") ||
    t.includes("가격") ||
    t.includes("시세")
  ) {
    return "매물";
  }
  return "활동";
}

function toUnified(inbox: InboxItem[], points: PointNotification[]): UnifiedItem[] {
  const a: UnifiedItem[] = inbox.map((it) => ({
    kind: "inbox",
    id: it.id,
    category: classifyInbox(it.title, it.body),
    title: it.title,
    body: it.body,
    actionUrl: it.actionUrl,
    read: Boolean(it.readAt),
    createdAt: it.createdAt,
  }));
  const b: UnifiedItem[] = points.map((p) => ({
    kind: "point",
    id: p.id,
    category: "포인트",
    title: `포인트 ${p.delta >= 0 ? "+" : ""}${p.delta.toLocaleString("ko-KR")} ${p.label}`,
    body: `잔액 ${p.balance.toLocaleString("ko-KR")}P`,
    actionUrl: null,
    read: true,
    createdAt: p.createdAt,
    delta: p.delta,
  }));
  return [...a, ...b].sort((x, y) => y.createdAt.localeCompare(x.createdAt));
}

function metaLine(item: UnifiedItem): string {
  const parts = [relativeTime(item.createdAt)];
  if (item.body) parts.push(item.body);
  if (item.kind === "inbox" && item.read) parts.push("읽음");
  return parts.filter(Boolean).join(" · ");
}

/* ---------- 비로그인 샘플 (미리보기용, 상호작용 없음) ---------- */

const GUEST_SAMPLES: UnifiedItem[] = [
  {
    kind: "inbox",
    id: "s1",
    category: "매물",
    title: "매물이 승인되었어요",
    body: "'공작아파트' 매물이 검수를 통과해 지도에 노출됩니다",
    actionUrl: null,
    read: false,
    createdAt: new Date(Date.now() - 8 * 60000).toISOString(),
  },
  {
    kind: "inbox",
    id: "s2",
    category: "관심지역",
    title: "관심 지역 새 매물",
    body: "관양동 '인덕원마을' 매물이 등록됐어요",
    actionUrl: null,
    read: false,
    createdAt: new Date(Date.now() - 2 * 3600000).toISOString(),
  },
  {
    kind: "point",
    id: "s3",
    category: "포인트",
    title: "포인트 +300 매물 등록 승인",
    body: "잔액 1,300P",
    actionUrl: null,
    read: true,
    createdAt: new Date(Date.now() - 3 * 3600000).toISOString(),
    delta: 300,
  },
  {
    kind: "inbox",
    id: "s4",
    category: "활동",
    title: "새 댓글이 달렸어요",
    body: "내 임장노트에 댓글이 달렸어요",
    actionUrl: null,
    read: true,
    createdAt: new Date(Date.now() - 26 * 3600000).toISOString(),
  },
  {
    kind: "inbox",
    id: "s5",
    category: "매물",
    title: "소유확인 완료",
    body: "소유확인이 완료돼 인증 배지가 표시됩니다",
    actionUrl: null,
    read: true,
    createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
  },
];

/* ---------- 알림 구독 (#47, /api/me/alerts) ---------- */

type AlertSubscription = {
  id: string;
  type: "region" | "keyword";
  value: string;
  label: string;
  createdAt: string;
};

const REGION_OPTIONS = [
  "서울",
  "경기",
  "인천",
  "부산",
  "대구",
  "대전",
  "광주",
  "울산",
  "세종",
] as const;

function AlertSubscriptionSection() {
  const { showToast } = useToast();
  const [subs, setSubs] = useState<AlertSubscription[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [region, setRegion] = useState("");
  const [keyword, setKeyword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/me/alerts");
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { items?: AlertSubscription[] };
        if (cancelled) return;
        setSubs(Array.isArray(data.items) ? data.items : []);
      } catch {
        // 실패 시 빈 목록 유지 (섹션은 계속 표시)
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const addOne = async (type: "region" | "keyword", value: string) => {
    const res = await fetch("/api/me/alerts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, value }),
    });
    const data = (await res.json().catch(() => ({}))) as
      | AlertSubscription
      | { error?: string };
    if (!res.ok) {
      throw new Error(
        ("error" in data && data.error) || "구독 추가에 실패했어요.",
      );
    }
    const item = data as AlertSubscription;
    setSubs((prev) => [item, ...prev.filter((s) => s.id !== item.id)]);
  };

  const onAdd = async () => {
    if (busy) return;
    const r = region.trim();
    const k = keyword.trim();
    if (!r && !k) {
      setError("지역을 선택하거나 키워드를 입력해 주세요.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (r) await addOne("region", r);
      if (k) await addOne("keyword", k);
      setRegion("");
      setKeyword("");
      showToast("구독을 추가했어요");
    } catch (e) {
      setError(e instanceof Error ? e.message : "구독 추가에 실패했어요.");
    } finally {
      setBusy(false);
    }
  };

  const onRemove = async (id: string) => {
    const prev = subs;
    setSubs((cur) => cur.filter((s) => s.id !== id));
    try {
      const res = await fetch(`/api/me/alerts?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(String(res.status));
      showToast("구독을 해지했어요");
    } catch {
      setSubs(prev);
      setError("구독 해지에 실패했어요. 잠시 후 다시 시도해 주세요.");
    }
  };

  return (
    <div className="rise-in-2 card mt-3 flex flex-col gap-2.5 rounded-[14px] px-[15px] py-[13px]">
      <div className="flex items-center justify-between">
        <span className="text-xs font-extrabold text-ink">알림 구독</span>
        <span className="text-[10px] text-text-3">지역·키워드 새 소식 알림</span>
      </div>

      {/* 현재 구독 칩 */}
      {loaded && subs.length === 0 && (
        <div className="text-[11px] text-text-3">
          아직 구독이 없어요. 지역이나 키워드를 구독해 보세요.
        </div>
      )}
      {subs.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {subs.map((s) => (
            <span
              key={s.id}
              className="chip inline-flex items-center gap-1.5 border border-[#e2e7ee] bg-surface px-2.5 py-1 text-[11px] text-text-1"
            >
              <b className="font-bold text-ink">{s.label}</b>
              <button
                type="button"
                aria-label={`${s.label} 구독 해지`}
                onClick={() => onRemove(s.id)}
                className="font-extrabold text-text-3 hover:text-danger"
              >
                해지
              </button>
            </span>
          ))}
        </div>
      )}

      {/* 추가 폼 */}
      <div className="flex flex-wrap items-center gap-1.5">
        <select
          value={region}
          onChange={(e) => setRegion(e.target.value)}
          className="h-8 rounded-[9px] border border-[#e2e7ee] bg-surface px-2 text-[11px] text-ink"
          aria-label="구독할 지역"
        >
          <option value="">지역 선택</option>
          {REGION_OPTIONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <input
          type="text"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void onAdd();
          }}
          maxLength={30}
          placeholder="키워드 (예: 재건축)"
          className="h-8 min-w-0 flex-1 rounded-[9px] border border-[#e2e7ee] bg-surface px-2.5 text-[11px] text-ink placeholder:text-text-3"
          aria-label="구독할 키워드"
        />
        <button
          type="button"
          onClick={() => void onAdd()}
          disabled={busy}
          className="btn-primary h-8 rounded-[9px] px-3 text-[11px] font-extrabold disabled:opacity-60"
        >
          {busy ? "추가 중…" : "구독 추가"}
        </button>
      </div>
      {error && <div className="text-[10px] font-bold text-danger">{error}</div>}
    </div>
  );
}

/* ---------- 알림 카드 ---------- */

function NotificationCard({
  item,
  index,
  onOpen,
}: {
  item: UnifiedItem;
  index: number;
  onOpen: (i: UnifiedItem) => void;
}) {
  const isPoint = item.kind === "point";
  const up = (item.delta ?? 0) >= 0;
  const dim = item.read && !isPoint;

  const badge = isPoint
    ? { bg: "var(--warning-soft)", color: "var(--warning)" }
    : item.read
      ? { bg: "#f2f4f8", color: "var(--text-2)" }
      : {
          bg: UNREAD_STYLE[item.category].bg,
          color: UNREAD_STYLE[item.category].color,
        };
  const border = !isPoint && !item.read ? UNREAD_STYLE[item.category].border : null;

  const card = (
    <div
      className={`card flex gap-2.5 rounded-[14px] px-[15px] py-[13px] ${dim ? "opacity-75" : ""}`}
      style={border ? { borderLeft: `3px solid ${border}` } : undefined}
    >
      <div
        className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] text-[11px] font-extrabold"
        style={{ background: badge.bg, color: badge.color }}
      >
        {TAG[item.category]}
      </div>
      <div className="min-w-0 flex-1">
        <div
          className={`text-xs font-bold leading-[1.45] ${dim ? "text-text-1" : "text-ink"}`}
          style={isPoint ? { color: up ? "var(--success)" : "var(--danger)" } : undefined}
        >
          {item.title}
        </div>
        <div className="mt-[3px] truncate text-[10px] text-text-3">
          {metaLine(item)}
        </div>
      </div>
      {!isPoint && !item.read && (
        <span
          className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary"
          aria-label="안 읽음"
        />
      )}
    </div>
  );

  const wrapper = `rise-in-${Math.min(index + 1, 6)}`;
  if (isPoint) return <div className={wrapper}>{card}</div>;
  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      className={`${wrapper} block w-full text-left`}
    >
      {card}
    </button>
  );
}

/* ---------- 페이지 ---------- */

export default function NotificationsPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"loading" | "live" | "guest">("loading");
  const [inbox, setInbox] = useState<InboxItem[]>([]);
  const [points, setPoints] = useState<PointNotification[]>([]);
  const [tab, setTab] = useState<TabKey>("전체");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/notifications");
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as {
          items?: InboxItem[];
          points?: PointNotification[];
        };
        if (cancelled) return;
        setInbox(Array.isArray(data.items) ? data.items : []);
        setPoints(Array.isArray(data.points) ? data.points : []);
        setMode("live");
      } catch {
        if (!cancelled) setMode("guest");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const unified = useMemo(
    () => (mode === "guest" ? GUEST_SAMPLES : toUnified(inbox, points)),
    [mode, inbox, points],
  );

  const unreadCount = useMemo(
    () => unified.filter((u) => u.kind === "inbox" && !u.read).length,
    [unified],
  );

  const counts = useMemo(() => {
    const c: Record<TabKey, number> = {
      전체: unified.length,
      매물: 0,
      관심지역: 0,
      활동: 0,
      포인트: 0,
    };
    for (const u of unified) c[u.category] += 1;
    return c;
  }, [unified]);

  const visible = useMemo(
    () => (tab === "전체" ? unified : unified.filter((u) => u.category === tab)),
    [tab, unified],
  );

  const markAllRead = async () => {
    if (mode !== "live") return;
    const now = new Date().toISOString();
    setInbox((prev) => prev.map((i) => ({ ...i, readAt: i.readAt ?? now })));
    try {
      await fetch("/api/notifications/read-all", { method: "POST" });
    } catch {
      // 네트워크 실패 시에도 화면 표시는 유지
    }
  };

  const onOpen = async (item: UnifiedItem) => {
    if (item.kind !== "inbox" || mode !== "live") return;
    if (!item.read) {
      const now = new Date().toISOString();
      setInbox((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, readAt: i.readAt ?? now } : i)),
      );
      try {
        await fetch(`/api/notifications/${encodeURIComponent(item.id)}`, {
          method: "PATCH",
        });
      } catch {
        // 읽음 처리 실패해도 이동은 진행
      }
    }
    if (item.actionUrl && item.actionUrl.startsWith("/")) {
      router.push(item.actionUrl);
    }
  };

  const showSubs = mode === "live" && (tab === "전체" || tab === "관심지역");

  return (
    <PageShell>
      <div className="mx-auto w-full max-w-[560px]">
        {/* 타이틀 + 안읽음 카운트 + 모두 읽음 */}
        <div className="rise-in flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-[22px] font-extrabold text-ink">알림</h1>
            {mode === "live" && unreadCount > 0 && (
              <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-extrabold text-white">
                {unreadCount}
              </span>
            )}
          </div>
          {mode === "live" && unreadCount > 0 && (
            <button
              type="button"
              onClick={markAllRead}
              className="text-xs font-bold text-primary"
            >
              모두 읽음
            </button>
          )}
        </div>

        {/* 탭 */}
        <div className="rise-in-1 mt-3 flex gap-1.5 overflow-x-auto pb-1">
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`chip whitespace-nowrap px-[13px] py-1.5 text-xs ${
                  active
                    ? "chip-active"
                    : "border border-[#e2e7ee] bg-surface text-text-2"
                }`}
              >
                {t.label}
                {mode === "live" && counts[t.key] > 0 && (
                  <span className="ml-1 opacity-70">{counts[t.key]}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* 비로그인 안내 (샘플 미리보기 표시 중) */}
        {mode === "guest" && (
          <div className="rise-in-1 card mt-3 flex items-center justify-between rounded-[14px] border-l-[3px] border-l-primary px-[15px] py-3">
            <span className="text-xs font-bold text-ink">
              로그인하면 내 알림·포인트·구독을 한곳에서 볼 수 있어요
            </span>
            <Link
              href="/login?callbackUrl=/notifications"
              className="shrink-0 text-xs font-extrabold text-primary"
            >
              로그인 ›
            </Link>
          </div>
        )}

        {/* 알림 구독 (#47) — 로그인 상태의 전체·관심지역 탭 */}
        {showSubs && <AlertSubscriptionSection />}

        {/* 알림 리스트 */}
        <div className="mt-3 flex flex-col gap-2">
          {mode === "loading" &&
            [0, 1, 2].map((i) => (
              <div key={i} className="skeleton h-[60px] rounded-[14px]" />
            ))}

          {mode !== "loading" &&
            visible.map((item, i) => (
              <NotificationCard
                key={`${item.kind}-${item.id}`}
                item={item}
                index={i}
                onOpen={onOpen}
              />
            ))}

          {mode !== "loading" && visible.length === 0 && (
            <div className="card rounded-[14px] px-[15px] py-8 text-center text-xs text-text-3">
              {EMPTY[tab]}
            </div>
          )}
        </div>
      </div>
    </PageShell>
  );
}
