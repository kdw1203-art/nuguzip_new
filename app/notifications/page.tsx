"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageShell } from "../components/PageShell";
import { useToast } from "@/app/components/toast/ToastProvider";
import { isInternalPath } from "@/lib/safe-path";
import {
  CHECK_SHORT,
  foldOpsAlerts,
  relativeTime,
  shortDate,
} from "@/lib/notifications/format";

/* ============================================================
   통합 알림 센터 — 탭/필터 + 실데이터 병합
   소스: 받은편지함(GET /api/notifications → items) + 포인트 원장(→ points)
        + 운영 경보(→ ops, **관리자 세션에만** 실린다)
   탭: 전체 · 매물(승인/소유확인) · 관심지역(새 매물) · 활동(댓글·좋아요) · 포인트
       ( + 운영 — 관리자에게만 보이고, '전체' 에는 섞이지 않는다)

   2026-08-26: 이 화면이 내부 점검 경보 29건으로 도배돼 있었다. 전부 '활동' 으로
   오분류됐고, 같은 경보(Core Web Vitals 이상 · CLS 0.825)가 8일 연속 8줄을
   차지했으며, 본문은 한 줄로 잘려 정작 필요한 숫자가 안 보였다. 갈라 낸 근거는
   lib/notifications/inbox.ts 주석 참고.
   - 안 읽음 카운트 · "모두 읽음"(read-all) · 항목 클릭 시 읽음 처리 후 이동
   - 포인트 행은 읽기 전용(이동/읽음 없음)
   - 비로그인 → 로그인 안내 + 샘플 미리보기
   ============================================================ */

type Category = "매물" | "관심지역" | "활동" | "포인트" | "운영";
type TabKey = "전체" | Category;

/** '전체' 에 합쳐지는 카테고리 — 운영은 의도적으로 빠진다. */
const USER_CATEGORIES: Category[] = ["매물", "관심지역", "활동", "포인트"];

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
  /** 같은 경보가 접힌 개수(1이면 접히지 않음) */
  repeat?: number;
  /** 접힌 묶음에서 가장 오래된 발생 시각 */
  firstAt?: string;
  /** 운영 경보의 점검 키(db.query_load 등) */
  checkName?: string;
  severity?: "critical" | "warn";
  /** 묶음에 들어간 원본 id 들 — '모두 읽음' 없이 개별 읽음 처리할 때 쓴다 */
  groupIds?: string[];
};

const BASE_TABS: { key: TabKey; label: string }[] = [
  { key: "전체", label: "전체" },
  { key: "매물", label: "매물" },
  { key: "관심지역", label: "관심지역" },
  { key: "활동", label: "활동" },
  { key: "포인트", label: "포인트" },
];
const OPS_TAB: { key: TabKey; label: string } = { key: "운영", label: "운영" };

const TAG: Record<Category, string> = {
  매물: "매물",
  관심지역: "지역",
  활동: "활동",
  포인트: "P",
  운영: "점검",
};

const UNREAD_STYLE: Record<Category, { bg: string; color: string; border: string }> = {
  매물: { bg: "var(--primary-soft)", color: "var(--primary)", border: "var(--primary)" },
  관심지역: { bg: "var(--success-soft)", color: "var(--success)", border: "var(--success)" },
  활동: { bg: "#efeafe", color: "#6b40d8", border: "#6b40d8" },
  포인트: { bg: "var(--warning-soft)", color: "var(--warning)", border: "var(--warning)" },
  운영: { bg: "var(--danger-soft)", color: "var(--danger)", border: "var(--danger)" },
};

const EMPTY: Record<TabKey, string> = {
  전체: "아직 알림이 없어요. 관심 지역·키워드를 구독하면 새 소식을 여기에서 받아볼 수 있어요.",
  매물: "매물 승인·소유확인 관련 알림이 아직 없어요.",
  관심지역: "관심 지역의 새 매물 알림이 아직 없어요.",
  활동: "댓글·좋아요 등 활동 알림이 아직 없어요.",
  포인트: "포인트 적립·소비 내역이 아직 없어요.",
  운영: "점검 경보가 없습니다. 전체 현황은 /admin/ops 에서 볼 수 있어요.",
};

/* ---------- 유틸 ---------- */

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

/** lib 의 접기 결과를 화면 항목으로 옮긴다. */
function foldOps(rows: InboxItem[]): UnifiedItem[] {
  return foldOpsAlerts(rows).map((g) => ({
    kind: "inbox" as const,
    id: g.id,
    category: "운영" as const,
    title: g.title,
    body: g.body,
    actionUrl: g.actionUrl,
    read: g.read,
    createdAt: g.createdAt,
    repeat: g.repeat,
    firstAt: g.firstAt,
    checkName: g.checkName,
    severity: g.severity,
    groupIds: g.groupIds,
  }));
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

/* 예전엔 시간·본문·읽음을 한 줄에 이어 붙이고 truncate 했다. 그래서
   "[HEALTH] seo.cwv_page — /map → CLS p75 0.8…" 처럼 **정작 필요한 숫자에서**
   잘렸다. 본문은 카드 본문으로 내리고, 이 줄은 메타만 담는다. */
function metaLine(item: UnifiedItem): string {
  const parts: string[] = [relativeTime(item.createdAt)];
  if (item.repeat && item.repeat > 1 && item.firstAt) {
    parts.push(`${item.repeat}회 반복 · ${shortDate(item.firstAt)}부터`);
  }
  if (item.kind === "inbox" && item.read) parts.push("읽음");
  return parts.filter(Boolean).join(" · ");
}

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
        <span className="t-body font-extrabold text-ink">알림 구독</span>
        <span className="t-caption text-text-3">지역·키워드 새 소식 알림</span>
      </div>

      {/* 현재 구독 칩 */}
      {loaded && subs.length === 0 && (
        <div className="t-sub text-text-3">
          아직 구독이 없어요. 지역이나 키워드를 구독해 보세요.
        </div>
      )}
      {subs.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {subs.map((s) => (
            /* 예전엔 라벨과 "해지" 가 한 덩어리로 보여 칩 전체가 버튼처럼 읽혔다.
               구분선을 넣고 해지는 ×(44px 탭 타깃)로 분리한다. */
            <span
              key={s.id}
              className="chip inline-flex items-center gap-0 overflow-hidden border border-line bg-surface p-0 t-sub text-text-1"
            >
              <b className="py-1 pl-2.5 pr-2 font-bold text-ink">{s.label}</b>
              <span aria-hidden className="h-[18px] w-px bg-line" />
              <button
                type="button"
                aria-label={`${s.label} 구독 해지`}
                title="구독 해지"
                onClick={() => onRemove(s.id)}
                className="tap-44 flex h-full items-center px-2 py-1 t-body font-extrabold leading-none text-text-3 hover:bg-danger-soft hover:text-danger"
              >
                ×
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
          className="h-8 rounded-[9px] border border-line bg-surface px-2 t-sub text-ink"
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
          className="h-8 min-w-0 flex-1 rounded-[9px] border border-line bg-surface px-2.5 t-sub text-ink placeholder:text-text-3"
          aria-label="구독할 키워드"
        />
        <button
          type="button"
          onClick={() => void onAdd()}
          disabled={busy}
          className="btn-primary h-8 rounded-[9px] px-3 t-sub font-extrabold disabled:opacity-60"
        >
          {busy ? "추가 중…" : "구독 추가"}
        </button>
      </div>
      {error && <div className="t-caption font-bold text-danger">{error}</div>}
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
      {/* 배지 높이(34)와 제목 첫 줄 높이(13×1.6≈21)가 달라, items-start 로 두면
          배지가 제목보다 6px 높이 떠 보인다. 제목 줄 중앙에 맞춘다. */}
      <div
        className="mt-[6px] flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] t-sub font-extrabold"
        style={{ background: badge.bg, color: badge.color }}
      >
        {item.category === "운영"
          ? (item.checkName && CHECK_SHORT[item.checkName]) || TAG.운영
          : TAG[item.category]}
      </div>
      <div className="min-w-0 flex-1">
        {/* 제목 13 · 본문 11 · 메타 9 — 타입 램프 세 칸.
            예전엔 12 / 10.5 / 10 이라 한 칸도 안 되는 차이로 붙어 있었고,
            그래서 무엇이 제목인지 눈에 안 들어왔다. */}
        <div
          className={`break-words t-body font-extrabold ${dim ? "text-text-1" : "text-ink"}`}
          style={isPoint ? { color: up ? "var(--success)" : "var(--danger)" } : undefined}
        >
          {item.title}
        </div>
        {/* 본문은 잘리더라도 2줄까지는 보인다 — 숫자가 첫 줄 끝에서 사라지지 않게. */}
        {item.body && (
          <div className="mt-0.5 line-clamp-2 t-sub text-text-2">{item.body}</div>
        )}
        {/* 심각도는 메타 줄 맨 앞에 둔다. 제목 줄 오른쪽에 두면 안 읽음 점과
            오른쪽 끝을 두 개가 나눠 갖고, 서로 다른 높이에 떠서 어수선했다. */}
        <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 t-caption text-text-3">
          {item.severity && (
            <span
              className="rounded-[5px] px-1.5 py-px font-extrabold"
              style={
                item.severity === "critical"
                  ? { background: "var(--danger-soft)", color: "var(--danger)" }
                  : { background: "var(--warning-soft)", color: "var(--warning)" }
              }
            >
              {item.severity === "critical" ? "심각" : "경고"}
            </span>
          )}
          <span>{metaLine(item)}</span>
          {item.checkName && (
            <code className="max-w-full break-all rounded-[4px] border border-line bg-bg px-1 py-px font-mono text-text-3">
              {item.checkName}
            </code>
          )}
        </div>
      </div>
      {!isPoint && !item.read && (
        /* 제목 첫 줄(21px)의 세로 중앙에 맞춘다 — (21-8)/2 ≈ 6.5 */
        <span
          className="mt-[12px] h-2 w-2 shrink-0 rounded-full bg-primary"
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
  /* 2026-07-26: 예전에는 401(비로그인)과 서버 오류를 똑같이 "guest" 로 떨어뜨렸다.
     그러면 로그인한 사용자가 조회 실패를 만났을 때 "로그인하면 알림을 모아볼 수
     있어요" 라는 엉뚱한 안내를 보고, 조회가 성공했지만 비어 있는 것처럼 보인다.
     401 만 guest, 나머지 실패는 error 로 갈라서 사실대로 알린다. */
  const [mode, setMode] = useState<"loading" | "live" | "guest" | "error">("loading");
  const [errorCause, setErrorCause] = useState<string | null>(null);
  const [inbox, setInbox] = useState<InboxItem[]>([]);
  const [points, setPoints] = useState<PointNotification[]>([]);
  /* 관리자 세션에만 실려 온다. 비관리자는 키 자체가 없어 undefined 로 남는다 —
     빈 배열과 구분해야 '운영' 탭을 그릴지 말지를 사실대로 정할 수 있다. */
  const [ops, setOps] = useState<InboxItem[] | null>(null);
  const [tab, setTab] = useState<TabKey>("전체");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/notifications");
        if (res.status === 401) {
          if (!cancelled) setMode("guest");
          return;
        }
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          if (!cancelled) {
            setErrorCause(body?.error ?? `HTTP ${res.status}`);
            setMode("error");
          }
          return;
        }
        const data = (await res.json()) as {
          items?: InboxItem[];
          points?: PointNotification[];
          ops?: InboxItem[];
        };
        if (cancelled) return;
        setInbox(Array.isArray(data.items) ? data.items : []);
        setPoints(Array.isArray(data.points) ? data.points : []);
        setOps(Array.isArray(data.ops) ? data.ops : null);
        setMode("live");
      } catch (e) {
        if (!cancelled) {
          setErrorCause(e instanceof Error ? e.message : String(e));
          setMode("error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const unified = useMemo(() => toUnified(inbox, points), [inbox, points]);
  const opsFolded = useMemo(() => (ops ? foldOps(ops) : []), [ops]);
  const isOpsViewer = ops !== null;

  const tabs = useMemo(
    () => (isOpsViewer ? [...BASE_TABS, OPS_TAB] : BASE_TABS),
    [isOpsViewer],
  );

  /* 헤더 카운트·"모두 읽음" 은 지금 보고 있는 탭의 채널만 대상으로 한다.
     운영 경보가 사용자 알림 카운트를 밀어 올리던 것이 이 화면의 출발점이었다. */
  const unreadCount = useMemo(
    () =>
      tab === "운영"
        ? opsFolded.filter((u) => !u.read).length
        : unified.filter((u) => u.kind === "inbox" && !u.read).length,
    [tab, unified, opsFolded],
  );

  const counts = useMemo(() => {
    const c: Record<TabKey, number> = {
      전체: unified.length,
      매물: 0,
      관심지역: 0,
      활동: 0,
      포인트: 0,
      운영: opsFolded.length,
    };
    for (const u of unified) {
      if (USER_CATEGORIES.includes(u.category)) c[u.category] += 1;
    }
    return c;
  }, [unified, opsFolded]);

  const visible = useMemo(() => {
    if (tab === "운영") return opsFolded;
    if (tab === "전체") return unified;
    return unified.filter((u) => u.category === tab);
  }, [tab, unified, opsFolded]);

  const markAllRead = async () => {
    if (mode !== "live") return;
    const now = new Date().toISOString();
    const channel = tab === "운영" ? "ops" : "user";
    if (channel === "ops") setOps((prev) => prev?.map((i) => ({ ...i, readAt: i.readAt ?? now })) ?? prev);
    else setInbox((prev) => prev.map((i) => ({ ...i, readAt: i.readAt ?? now })));
    try {
      await fetch(`/api/notifications/read-all?channel=${channel}`, { method: "POST" });
    } catch {
      // 네트워크 실패 시에도 화면 표시는 유지
    }
  };

  const onOpen = async (item: UnifiedItem) => {
    if (item.kind !== "inbox" || mode !== "live") return;
    if (!item.read) {
      const now = new Date().toISOString();
      /* 접힌 묶음은 안에 든 것을 전부 읽음 처리한다 — 대표 한 건만 읽으면
         묶음이 다시 펴졌을 때 나머지가 안 읽음으로 되살아난다. */
      const ids = item.groupIds ?? [item.id];
      const idSet = new Set(ids);
      if (item.category === "운영") {
        setOps((prev) =>
          prev?.map((i) => (idSet.has(i.id) ? { ...i, readAt: i.readAt ?? now } : i)) ?? prev,
        );
      } else {
        setInbox((prev) =>
          prev.map((i) => (idSet.has(i.id) ? { ...i, readAt: i.readAt ?? now } : i)),
        );
      }
      try {
        await Promise.all(
          ids.map((id) =>
            fetch(`/api/notifications/${encodeURIComponent(id)}`, { method: "PATCH" }),
          ),
        );
      } catch {
        // 읽음 처리 실패해도 이동은 진행
      }
    }
    /* actionUrl 은 서버(알림 생성 경로)에서 오는 값이라 화면이 그대로 믿으면 안 된다.
       `startsWith("/")` 만 보면 `//evil.com`·`/\evil.com` 이 통과해 알림 한 번 눌렀다가
       외부로 나간다 — lib/safe-path.ts 참고. */
    if (isInternalPath(item.actionUrl)) {
      router.push(item.actionUrl);
    }
  };

  const showSubs = mode === "live" && (tab === "전체" || tab === "관심지역");
  const opsUnread = opsFolded.filter((u) => !u.read).length;

  return (
    <PageShell>
      <div className="mx-auto w-full max-w-[560px]">
        {/* 타이틀 + 안읽음 카운트 + 모두 읽음 */}
        <div className="rise-in flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="t-title text-ink">알림</h1>
            {mode === "live" && unreadCount > 0 && (
              <span className="rounded-full bg-primary chip-pad t-sub font-extrabold text-white">
                {unreadCount}
              </span>
            )}
          </div>
          {mode === "live" && unreadCount > 0 && (
            <button
              type="button"
              onClick={markAllRead}
              className="t-sub font-bold text-primary"
            >
              모두 읽음
            </button>
          )}
        </div>

        {/* 탭 — 조회 실패 상태에서는 탭을 그리지 않는다(빈 탭 = "알림 없음"으로 읽힌다) */}
        {mode !== "guest" && mode !== "error" && (
        <div className="tab-scroll rise-in-1 mt-3 flex gap-1.5 overflow-x-auto pb-1">
          {tabs.map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`chip whitespace-nowrap px-[13px] py-1.5 t-sub ${
                  active
                    ? "chip-active"
                    : "border border-line bg-surface text-text-2"
                }`}
              >
                {t.label}
                {mode === "live" && counts[t.key] > 0 && (
                  <span className="ml-1 opacity-70">{counts[t.key]}</span>
                )}
                {/* 운영 탭에만 안 읽음 점 — 숫자 배지는 사용자 알림 몫이다 */}
                {t.key === "운영" && mode === "live" && opsUnread > 0 && (
                  <span
                    aria-label={`안 읽은 점검 경보 ${opsUnread}건`}
                    className="ml-1 inline-block h-1.5 w-1.5 rounded-full align-middle"
                    style={{ background: "var(--danger)" }}
                  />
                )}
              </button>
            );
          })}
        </div>
        )}

        {/* 비로그인 — 가짜 샘플 알림 대신 로그인 안내 빈 상태(#10) */}
        {mode === "guest" && (
          <div className="rise-in-1 card mt-3 flex flex-col items-center gap-2.5 rounded-[14px] px-[15px] py-10 text-center">
            <div className="t-section text-ink">
              로그인하면 알림을 모아볼 수 있어요
            </div>
            <p className="max-w-[300px] t-body text-text-3">
              매물 승인·관심 지역 새 매물·댓글·포인트 소식이 이곳에 쌓여요.
            </p>
            <Link
              href="/login?callbackUrl=/notifications"
              className="btn-primary mt-1 rounded-xl px-5 py-2.5 t-body font-bold no-underline"
            >
              로그인
            </Link>
          </div>
        )}

        {/* 조회 실패 — "알림이 없다" 가 아니라 "못 읽었다" 고 쓴다 */}
        {mode === "error" && (
          <div className="rise-in-1 card mt-3 flex flex-col items-center gap-2.5 rounded-[14px] px-[15px] py-10 text-center">
            <div className="t-section text-ink">알림을 지금 불러오지 못했어요</div>
            <p className="max-w-[320px] t-body text-text-3">
              알림이 없는 게 아니라 조회 자체가 실패했습니다. 잠시 후 다시 시도해 주세요.
            </p>
            {errorCause && (
              <code className="max-w-[320px] break-all rounded-lg border border-line bg-surface px-2.5 py-1.5 font-mono t-caption text-text-3">
                {errorCause}
              </code>
            )}
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="btn-soft mt-1 rounded-xl px-5 py-2.5 t-body font-bold"
            >
              다시 시도
            </button>
          </div>
        )}

        {/* 운영 탭 안내 — 이 목록은 요약이고, 전체 이력은 관리자 화면에 있다 */}
        {mode === "live" && tab === "운영" && (
          <div className="rise-in-1 card mt-3 flex items-center justify-between gap-2 rounded-[14px] px-[15px] py-2.5">
            <span className="t-sub text-text-2">
              내부 점검 경보입니다. 사용자에게는 보이지 않아요.
            </span>
            <Link
              href="/admin/ops"
              className="btn-soft shrink-0 rounded-[9px] px-2.5 py-1.5 t-sub font-extrabold no-underline"
            >
              전체 보기
            </Link>
          </div>
        )}

        {/* 알림 구독 (#47) — 로그인 상태의 전체·관심지역 탭 */}
        {showSubs && <AlertSubscriptionSection />}

        {/* 알림 리스트 */}
        <div className="mt-3 flex flex-col gap-2">
          {/* 실제 카드 실측 높이 85px(본문 1줄 기준)에 맞춘다 —
              60px 로 두면 데이터가 도착할 때마다 목록이 25px씩 밀린다(CLS). */}
          {mode === "loading" &&
            [0, 1, 2].map((i) => (
              <div key={i} className="skeleton h-[85px] rounded-[14px]" />
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

          {mode === "live" && visible.length === 0 && (
            <div className="card rounded-[14px] px-[15px] py-8 text-center t-body text-text-3">
              {EMPTY[tab]}
            </div>
          )}
        </div>
      </div>
    </PageShell>
  );
}
