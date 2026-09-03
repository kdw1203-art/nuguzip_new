"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { regionIdForName } from "@/lib/region/catalog";
import { CreateGroupCta } from "./CreateGroupCta";
import { Icon } from "@/app/components/Icon";

/**
 * /town/groups 클라이언트 셸 (사용량 절감 12차 — ISR 전환의 클라이언트 절반).
 *
 * 서버(ISR)는 전량(상한 200, 실측 0행)을 SSR 로 그리고, ?region/?status/?sort
 * 는 마운트 후 location.search 에서 읽는다. 칩은 pushState 버튼 + popstate
 * (useSearchParams 는 프리렌더 HTML 에서 서브트리를 지운다 — /town/news 교훈).
 *
 * statusKey(모집 중/마감 임박/일정 종료)는 시각 파생값이라 ISR 프리렌더에
 * 박힌 값을 그대로 믿으면 안 된다 — 서버가 빌드 시각 기준으로 넣어 준 값으로
 * 하이드레이션을 일치시킨 뒤, 마운트에서 실제 시각으로 재계산한다(auctions
 * 선례). "일정이 지난 모임에 참여하기 버튼"은 그 자체가 거짓 안내다.
 */

export type GroupView = {
  id: string;
  title: string;
  desc: string;
  region: string;
  regionKey: string;
  whenLabel: string;
  whenTs: number;
  createdTs: number;
  members: number;
  max: number;
  host: string;
  fee: number;
  /** 서버가 빌드 시각 기준으로 계산한 초기값 — 마운트 후 재계산된다 */
  statusKey: "open" | "closing" | "full" | "past";
  tags: string[];
};

const STATUS_META: Record<
  GroupView["statusKey"],
  { label: string; style: string; dot: string }
> = {
  open: { label: "모집 중", style: "bg-primary-soft text-primary", dot: "bg-primary" },
  closing: { label: "마감 임박", style: "state-warning", dot: "bg-warning" },
  full: { label: "모집 마감", style: "bg-bg text-text-3", dot: "bg-text-3" },
  past: { label: "일정 종료", style: "bg-bg text-text-3", dot: "bg-text-3" },
};

/** D-day 라벨 — whenTs 가 실제 일정이라 계산이 성립한다.
 *  일정 미정(MAX_SAFE_INTEGER)이면 null 을 내고 배지를 안 그린다. */
function ddayLabel(whenTs: number, nowMs: number): string | null {
  if (!Number.isFinite(whenTs) || whenTs === Number.MAX_SAFE_INTEGER) return null;
  const days = Math.ceil((whenTs - nowMs) / 86_400_000);
  if (days < 0) return null;
  if (days === 0) return "오늘";
  if (days === 1) return "내일";
  return `D-${days}`;
}

/** 시각 파생 상태 재계산 — 예전 서버 toView 의 판정 그대로 */
function deriveStatus(g: GroupView, nowMs: number): GroupView["statusKey"] {
  const remaining = g.max - g.members;
  const isPast = g.whenTs !== Number.MAX_SAFE_INTEGER && g.whenTs < nowMs;
  return isPast ? "past" : remaining <= 0 ? "full" : remaining <= 1 ? "closing" : "open";
}

type Filter = { region: string; status: string; sort: string; q: string };

function readFilter(): Filter {
  const usp = new URLSearchParams(window.location.search);
  return {
    region: (usp.get("region") ?? "all").trim() || "all",
    status: (usp.get("status") ?? "all").trim() || "all",
    sort: (usp.get("sort") ?? "soon").trim() || "soon",
    q: (usp.get("q") ?? "").trim().slice(0, 60) || "",
  };
}

/* ---------- 모임 카드 (예전 서버 페이지에서 그대로 이동) ---------- */

function MeetingCard({
  g,
  chat24h = 0,
  nowMs,
}: {
  g: GroupView;
  /** 최근 24h 채팅 메시지 수 — 실측일 때만 양수, 0/미확인은 배지 미표시 */
  chat24h?: number;
  /** 셸이 마운트 후 재계산하는 현재 시각 — D-day 계산 기준 */
  nowMs: number;
}) {
  const meta = STATUS_META[g.statusKey];
  const remaining = Math.max(g.max - g.members, 0);
  const pct = Math.min(100, Math.round((g.members / Math.max(g.max, 1)) * 100));
  const joinable = g.statusKey === "open" || g.statusKey === "closing";
  const dday = ddayLabel(g.whenTs, nowMs);
  return (
    <div
      className="card tile flex flex-col gap-3 rounded-[14px] p-4"
      data-reveal=""
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5">
          <span
            className={`inline-flex items-center gap-1.5 rounded-md chip-pad t-sub font-extrabold ${meta.style}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
            {meta.label}
          </span>
          {g.fee > 0 && (
            <span className="inline-flex items-center rounded-md bg-bg chip-pad t-sub font-bold text-text-2">
              참가비 {g.fee.toLocaleString("ko-KR")}원
            </span>
          )}
          {/* 고도화 29 — 채팅 활성도(실측 24h). 0·미확인이면 그리지 않는다 */}
          {chat24h > 0 && (
            <span className="inline-flex items-center gap-1 rounded-md bg-success-soft chip-pad t-sub font-bold text-success">
              <Icon name="messages-square" size={11} />
              24시간 메시지 {chat24h.toLocaleString("ko-KR")}개
            </span>
          )}
        </span>
        <span className="inline-flex shrink-0 items-center gap-1.5">
          {/* 남은 날짜 — "8월 30일 토요일"만 있으면 얼마나 급한지가 안 읽힌다 */}
          {dday && (
            <span
              className={`delta ${g.statusKey === "closing" || dday === "오늘" || dday === "내일" ? "delta-up-b" : "delta-flat-b"}`}
            >
              {dday}
            </span>
          )}
          <span className="inline-flex items-center gap-1 t-sub font-semibold text-text-3">
            <Icon name="calendar" size={12} />
            {g.whenLabel}
          </span>
        </span>
      </div>

      <div>
        <h3 className="line-clamp-1 t-section text-ink">{g.title}</h3>
        <p className="mt-1 line-clamp-2 t-sub text-text-2">{g.desc}</p>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 t-sub text-text-3">
        {/* 지역명이 카탈로그에서 유일하게 해석될 때만 지역 랜딩으로 링크한다 —
            해석 실패·모호는 링크 없이 텍스트(죽은 링크 금지). */}
        {regionIdForName(g.region) ? (
          <Link
            href={`/region/${regionIdForName(g.region)}`}
            className="inline-flex items-center gap-1 font-semibold text-primary no-underline"
          >
            <Icon name="pin" size={12} />
            {g.region} 시세 보기
          </Link>
        ) : (
          <span className="inline-flex items-center gap-1">
            <Icon name="pin" size={12} />
            {g.region}
          </span>
        )}
        <span className="inline-flex items-center gap-1">
          <Icon name="user" size={12} />
          {g.host}
        </span>
      </div>

      {g.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {g.tags.map((t) => (
            <span key={t} className="chip-tag px-2.5 py-1 t-sub">
              #{t}
            </span>
          ))}
        </div>
      )}

      {/* 모집 인원 */}
      <div className="mt-auto">
        <div className="mb-1 flex items-center justify-between t-sub">
          <span className="inline-flex items-center gap-1 text-text-3">
            <Icon name="users" size={12} />
            모집 인원
          </span>
          <span className="font-bold text-ink">
            {g.members}/{g.max}
          </span>
        </div>
        <span className={`rank-track ${g.statusKey === "full" ? "text-text-3" : "text-primary"}`}>
          <span className="rank-fill" style={{ width: `${Math.max(3, pct)}%` }} />
        </span>
      </div>

      {/* 푸터 — 가짜 아바타 원(장식용 색 원 3개)은 제거했다. 실제 참여자
          프로필이 아닌 그림은 "사람이 있는 것처럼" 보이게 만들 뿐이다. */}
      <div className="flex items-center justify-between border-t border-line pt-3">
        <span className="inline-flex items-center gap-1.5 t-sub font-medium text-text-3">
          <Icon name="users" size={12} />
          {g.statusKey === "past"
            ? `${g.members}명 참여했어요`
            : remaining > 0
              ? `${remaining}자리 남음`
              : "모집 마감"}
        </span>
        <Link
          href={`/town/groups/${g.id}`}
          className={`btn-md no-underline ${joinable ? "btn-primary" : "btn-soft"}`}
        >
          {/* "대기 참여"(2026-08-22 제거) — 대기 명단 기능이 없는데 있는 것처럼
              말하던 문구. 마감 모임은 상세를 보러 가는 것이 사실이다. */}
          {joinable ? "참여하기" : "모임 보기"}
        </Link>
      </div>
    </div>
  );
}

/* ---------- 셸 ---------- */

export function GroupsClient({
  views,
  chat,
  builtAtMs,
  truncated,
}: {
  views: GroupView[];
  /** 모임별 최근 24h 채팅 수 — 서버가 재생성 시각에 실측한 값 */
  chat: Record<string, number>;
  builtAtMs: number;
  truncated: boolean;
}) {
  // SSR/첫 하이드레이션은 필터 없음 + 서버 시각 — 프리렌더 HTML 과 정확히 일치.
  const [filter, setFilter] = useState<Filter>({ region: "all", status: "all", sort: "soon", q: "" });
  const [nowMs, setNowMs] = useState(builtAtMs);
  /* 검색 입력값 — 제출 시에만 필터·URL 에 반영(타이핑마다 히스토리가 쌓이지 않게) */
  const [qInput, setQInput] = useState("");
  useEffect(() => {
    setQInput(filter.q);
  }, [filter.q]);

  useEffect(() => {
    setNowMs(Date.now());
    setFilter(readFilter());
    const onPop = () => setFilter(readFilter());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const apply = (patch: Partial<Filter>) => {
    const next = { ...filter, ...patch };
    setFilter(next);
    const usp = new URLSearchParams();
    if (next.region !== "all") usp.set("region", next.region);
    if (next.status !== "all") usp.set("status", next.status);
    if (next.sort !== "soon") usp.set("sort", next.sort);
    if (next.q) usp.set("q", next.q);
    const s = usp.toString();
    window.history.pushState(null, "", s ? `/town/groups?${s}` : "/town/groups");
  };

  /* 시각 파생 상태 재계산 후 필터·정렬 — 예전 서버 판과 동일 순서 */
  const all = views.map((g) => ({ ...g, statusKey: deriveStatus(g, nowMs) }));
  /* [2026-08-22] 등록순 앞 6개 → **빈도순** 6개. 지역이 6곳을 넘으면 임의의
     지역이 칩을 차지하고 모임 많은 지역이 닿지 않던 문제. */
  const regionFreq = new Map<string, number>();
  for (const g of all) regionFreq.set(g.regionKey, (regionFreq.get(g.regionKey) ?? 0) + 1);
  const regionKeys = [...regionFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([k]) => k);

  /* 검색(2026-08-22) — 제목·소개·태그·모임장·지역이 전부 메모리에 있는데 거를
     길이 없었다. 공백 무시 부분일치(qna 목록과 같은 방식). */
  const needle = filter.q.toLowerCase().replace(/\s+/g, "");
  let groups = all.filter((g) => {
    if (filter.region !== "all" && g.regionKey !== filter.region) return false;
    if (filter.status === "open" && (g.statusKey === "full" || g.statusKey === "past")) return false;
    if (filter.status === "full" && g.statusKey !== "full" && g.statusKey !== "past") return false;
    if (needle) {
      const hay = `${g.title} ${g.desc} ${g.region} ${g.host} ${g.tags.join(" ")}`
        .toLowerCase()
        .replace(/\s+/g, "");
      if (!hay.includes(needle)) return false;
    }
    return true;
  });
  groups = [...groups].sort((a, b) =>
    filter.sort === "new" ? b.createdTs - a.createdTs : a.whenTs - b.whenTs,
  );

  const recruiting = groups.filter((g) => g.statusKey === "open" || g.statusKey === "closing");
  const closed = groups.filter((g) => g.statusKey === "full" || g.statusKey === "past");

  const statusChips = [
    { id: "all", label: "전체" },
    { id: "open", label: "모집 중" },
    { id: "full", label: "모집 마감" },
  ];
  const sortChips = [
    { id: "soon", label: "임박순" },
    { id: "new", label: "최신순" },
  ];
  const filtersActive =
    filter.region !== "all" || filter.status !== "all" || filter.sort !== "soon" || filter.q !== "";
  const chipCls = (on: boolean) =>
    `chip press px-3 py-1.5 ${on ? "chip-active" : "border border-line bg-surface text-text-2"}`;

  return (
    <>
      {/* ---------- 필터 (pushState 버튼 — 서버 왕복 없음) ---------- */}
      <div className="rise-in-1 mb-6 flex flex-col gap-2.5">
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 t-body [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button
            type="button"
            onClick={() => apply({ region: "all" })}
            aria-pressed={filter.region === "all"}
            className={`shrink-0 ${chipCls(filter.region === "all")} px-3.5`}
          >
            전체 지역
          </button>
          {regionKeys.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => apply({ region: r })}
              aria-pressed={filter.region === r}
              className={`shrink-0 ${chipCls(filter.region === r)} px-3.5`}
            >
              {r}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 t-body">
          {statusChips.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => apply({ status: c.id })}
              aria-pressed={filter.status === c.id}
              className={chipCls(filter.status === c.id)}
            >
              {c.label}
            </button>
          ))}
          <span className="mx-1 h-4 w-px bg-line" />
          {sortChips.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => apply({ sort: c.id })}
              aria-pressed={filter.sort === c.id}
              className={chipCls(filter.sort === c.id)}
            >
              {c.label}
            </button>
          ))}
          {filtersActive && (
            <button
              type="button"
              onClick={() => apply({ region: "all", status: "all", sort: "soon", q: "" })}
              className="ml-auto inline-flex items-center gap-1 t-sub font-semibold text-primary"
            >
              <Icon name="x" size={12} /> 필터 초기화
            </button>
          )}
        </div>
        {/* 검색(2026-08-22) — 제목·태그·모임장·지역 부분일치. 제출 시에만 반영. */}
        <form
          className="flex items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            apply({ q: qInput.trim().slice(0, 60) });
          }}
        >
          <input
            type="search"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            maxLength={60}
            placeholder="모임 이름·태그·지역 검색"
            aria-label="모임 검색"
            className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-3.5 py-2 t-body text-ink placeholder:text-text-3"
          />
          <button type="submit" className="btn-primary press rounded-xl px-4 py-2 t-body">
            검색
          </button>
        </form>
      </div>

      {truncated && (
        <p className="mb-3 t-sub text-text-3">
          모임이 조회 상한에 도달해 일부가 잘렸을 수 있어요 — 필터 결과가
          실제보다 적게 보일 수 있습니다.
        </p>
      )}

      {/* ---------- 섹션 ---------- */}
      {groups.length === 0 ? (
        <div className="rise-in-2 card flex flex-col items-center gap-3 rounded-[18px] px-6 py-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-primary">
            <Icon name="search" size={22} />
          </div>
          <p className="text-[13px] font-bold text-ink">조건에 맞는 모임이 아직 없어요</p>
          <p className="max-w-xs text-xs leading-[1.6] text-text-3">
            필터를 바꾸거나 직접 모임을 만들어 이웃을 모아보세요.
          </p>
          {filtersActive && (
            <button
              type="button"
              onClick={() => apply({ region: "all", status: "all", sort: "soon", q: "" })}
              className="btn-soft rounded-lg px-4 py-2 text-xs"
            >
              필터 초기화
            </button>
          )}
        </div>
      ) : (
        <>
          {/* 모집 중 모임 */}
          <section className="mb-8">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="t-section text-ink">모집 중 모임</h2>
              <span className="t-sub font-semibold text-text-3">{recruiting.length}개</span>
            </div>
            {recruiting.length > 0 ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {recruiting.map((g, i) => (
                  <MeetingCard key={g.id} g={g} chat24h={chat[g.id] ?? 0} nowMs={nowMs} />
                ))}
              </div>
            ) : (
              <div className="card flex flex-col items-center gap-2 rounded-[18px] px-6 py-10 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-primary">
                  <Icon name="users" size={22} />
                </div>
                <div className="text-[13px] font-bold text-text-1">지금 모집 중인 모임이 없어요</div>
                <div className="max-w-xs text-xs leading-[1.6] text-text-3">
                  직접 모임을 만들어 이웃을 모아보세요.
                </div>
                <div className="mt-1">
                  <CreateGroupCta />
                </div>
              </div>
            )}
          </section>

          {/* 마감된 모임 */}
          {closed.length > 0 && (
            <section>
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="t-section text-ink">마감·종료된 모임</h2>
                <span className="t-sub font-semibold text-text-3">{closed.length}개</span>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {closed.map((g, i) => (
                  <MeetingCard key={g.id} g={g} chat24h={chat[g.id] ?? 0} nowMs={nowMs} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </>
  );
}
