"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/app/components/Icon";
import { pushRecentSearch, readRecentSearches } from "@/lib/search/recent-searches";
import { useRecentComplexes } from "@/app/components/RecentComplexes";
import { useSettledSearchQuery } from "@/lib/search/settle";
import { complexHrefFromId } from "@/lib/seo/complex-slug";

/* 홈 리디자인(#408) 시안 B — 화면 정중앙 대형 검색.
 *
 * HeaderSearch 와 같은 원천(/api/search/unified · settle 대기 규칙 · 최근
 * 검색 저장소)을 쓰되, 히어로 크기의 독립 컴포넌트다. 칩은 전부 실데이터:
 * 최근 검색(localStorage) · 최근 본 단지(localStorage) — 없으면 실데이터
 * 커버 지역 바로가기로 대체한다(지어낸 "인기 단지"는 그리지 않는다).
 */

type Kind = "complex" | "listing" | "note" | "news";

interface UnifiedResults {
  complexes: { id: string; name: string; region: string }[];
  listings: { id: string; title: string; price: string }[];
  notes: { id: string; title: string }[];
  news: { id: string; title: string; source: string }[];
}

interface FlatItem {
  key: string;
  label: string;
  title: string;
  meta: string;
  href: string;
}

const PER_GROUP = 3;

function flatten(r: UnifiedResults): FlatItem[] {
  const out: FlatItem[] = [];
  const push = (kind: Kind, label: string, id: string, title: string, meta: string, base: string) =>
    out.push({ key: `${kind}-${id}`, label, title, meta, href: `${base}/${encodeURIComponent(id)}` });
  r.complexes.slice(0, PER_GROUP).forEach((c) => push("complex", "단지", c.id, c.name, c.region, "/complex"));
  r.listings.slice(0, PER_GROUP).forEach((l) => push("listing", "매물", l.id, l.title, l.price, "/listings"));
  r.notes.slice(0, PER_GROUP).forEach((n) => push("note", "노트", n.id, n.title, "", "/notes"));
  r.news.slice(0, PER_GROUP).forEach((n) => push("news", "뉴스", n.id, n.title, n.source, "/town/news"));
  return out;
}

/** [950] 지역 칩은 서버(홈)가 실데이터 지역 카드에서 넘긴다 — 티커·카드와 같은 지역.
 *  예전 고정 폴백(동안구·만안구·의왕시·과천시)은 초기 커버리지의 흔적이라 서비스가
 *  안양 근방만 다루는 것처럼 읽혔다(홈 비판 ③). 넘어온 칩이 없으면 칩 행을 그리지 않는다. */
export interface HeroRegionChip {
  label: string;
  href: string;
}

/** 회전 플레이스홀더 — 검색이 무엇을 찾아 주는지 예고한다(단지·지역·노트·뉴스).
 *  실제 존재하는 단지·지역만 적는다(헬리오시티: 서울 송파구 실거래 다수). */
const PLACEHOLDERS = [
  "단지명 — 예: 헬리오시티",
  "지역명 — 예: 마포구 신축",
  "동네 + 임장노트 — 예: 잠실 임장노트",
  "뉴스·재건축 — 예: 목동 재건축",
];

export function HomeHeroSearch({
  regionChips = [],
  coverage,
}: {
  regionChips?: HeroRegionChip[];
  /** [963] 커버리지 한 줄(서버 컴포넌트)을 칩 행 **안에** 받는다 — 아래 §칩 행 주석 참조 */
  coverage?: ReactNode;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [phIdx, setPhIdx] = useState(0);
  const [focused, setFocused] = useState(false);

  /* 입력이 비어 있고 포커스도 없을 때만 예시 문구를 돌린다 */
  useEffect(() => {
    if (q || focused) return;
    const t = window.setInterval(() => {
      setPhIdx((i) => (i + 1) % PLACEHOLDERS.length);
    }, 3500);
    return () => window.clearInterval(t);
  }, [q, focused]);
  const [items, setItems] = useState<FlatItem[]>([]);
  const [open, setOpen] = useState(false);
  const [recents, setRecents] = useState<string[]>([]);
  const { items: recentComplexes } = useRecentComplexes();
  const boxRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const { query: settledQuery, compositionProps } = useSettledSearchQuery(q);

  /* 최근 검색은 마운트 후에만 (SSR 불일치 방지) */
  useEffect(() => {
    setRecents(readRecentSearches());
  }, []);

  /* 제안 조회 — HeaderSearch 와 같은 unified 엔드포인트 */
  useEffect(() => {
    const query = settledQuery.trim();
    if (query.length < 2) {
      setItems([]);
      return;
    }
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    fetch(`/api/search/unified?q=${encodeURIComponent(query)}`, { signal: ac.signal })
      .then((res) => (res.ok ? (res.json() as Promise<UnifiedResults>) : null))
      .then((r) => {
        if (!r || ac.signal.aborted) return;
        setItems(flatten(r));
        setOpen(true);
      })
      .catch(() => {});
    return () => ac.abort();
  }, [settledQuery]);

  /* 바깥 클릭 → 닫기 */
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  function submit() {
    const k = q.trim();
    if (!k) return;
    pushRecentSearch(k);
    setOpen(false);
    router.push(`/search?q=${encodeURIComponent(k)}`);
  }

  const hasHistory = recents.length > 0 || recentComplexes.length > 0;

  return (
    /* [963] 검색 상자만 560px 로 죄고, 칩·커버리지 행은 바깥 폭을 그대로 쓴다.
       예전에는 칩 행이 상자 안(560px)에 갇혀 있어서 "칩 + 커버리지 한 줄"이 항상
       두 줄로 접혔다 — 데스크톱은 1,200px 을 쓸 수 있는데도. */
    <div className="w-full">
      {/* 검색 상자 + 자동완성 패널 — 바깥 클릭 감지(boxRef)와 절대배치 기준이 여기다 */}
      <div ref={boxRef} className="relative mx-auto w-full max-w-[560px]">
        <div className="flex items-center gap-2.5 rounded-2xl border-2 border-primary bg-surface py-3 pl-4 pr-2 shadow-[0_10px_32px_rgba(29,79,216,.14)] transition-shadow duration-300 focus-within:shadow-[0_14px_44px_rgba(29,79,216,.28)] md:py-3.5">
          <Icon name="search" size={19} className="shrink-0 text-primary" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            {...compositionProps}
            onFocus={() => {
              setFocused(true);
              if (q.trim() && items.length > 0) setOpen(true);
            }}
            onBlur={() => setFocused(false)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              } else if (e.key === "Escape") {
                setOpen(false);
              }
            }}
            placeholder={PLACEHOLDERS[phIdx]}
            aria-label="통합 검색"
            autoComplete="off"
            className="w-full min-w-0 bg-transparent text-[15px] font-semibold text-ink outline-none placeholder:font-normal placeholder:text-text-3"
          />
          <button
            type="button"
            onClick={submit}
            className="btn-primary press shrink-0 rounded-xl px-4 py-2 text-[13px]"
          >
            검색
          </button>
        </div>

        {/* 제안 0건 — 커버리지 수요 루프(#413)로 연결: 홈이 제1 검색 표면이라
            여기서 끊기면 수요가 기록되지 않는다. /search 무결과 화면에 수집
            카드가 있으니 그리로 잇는다. */}
        {open && q.trim().length >= 2 && items.length === 0 && (
          <div className="absolute inset-x-0 top-[calc(100%+8px)] z-40">
            <div className="overflow-hidden rounded-2xl border border-line bg-surface p-1.5 shadow-[0_18px_48px_rgba(16,28,54,.16)]">
              <button
                type="button"
                onClick={submit}
                className="flex w-full items-center justify-between gap-2 rounded-[10px] px-3 py-2.5 text-left transition-colors hover:bg-[rgba(29,79,216,.07)]"
              >
                <span className="min-w-0 truncate text-[13px] text-text-2">
                  ‘{q.trim()}’ 제안이 없어요 — 아직 안 열린 지역일 수 있어요
                </span>
                <span className="shrink-0 t-body font-extrabold text-primary">
                  전체 검색·수요 남기기 ›
                </span>
              </button>
            </div>
          </div>
        )}

        {/* 제안 드롭다운 */}
        {open && q.trim().length >= 2 && items.length > 0 && (
          <div className="absolute inset-x-0 top-[calc(100%+8px)] z-40">
            <div className="overflow-hidden rounded-2xl border border-line bg-surface p-1.5 shadow-[0_18px_48px_rgba(16,28,54,.16)] [animation:riseIn_160ms_var(--ease-out)_backwards]">
              {items.slice(0, 7).map((it) => (
                <button
                  key={it.key}
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    setQ("");
                    router.push(it.href);
                  }}
                  className="flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2 text-left transition-colors hover:bg-[rgba(29,79,216,.07)]"
                >
                  <span className="shrink-0 rounded-md bg-bg px-1.5 py-0.5 t-caption font-extrabold text-text-2">
                    {it.label}
                  </span>
                  <span className="min-w-0 flex-1 truncate t-body font-semibold text-text-1">
                    {it.title}
                  </span>
                  {it.meta && (
                    <span className="shrink-0 text-[12px] text-text-3">{it.meta}</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

      </div>

      {/* 칩 — 최근 검색·최근 본 단지 (실기록), 없으면 커버 지역 바로가기.
          [963] 커버리지 한 줄을 **같은 행**에 둔다(소유자 지시 2026-09-04 "한 줄로").
          예전엔 칩 행과 커버리지 줄이 위아래 두 줄이었는데, 검색창과 티커 사이에
          가운데 정렬 텍스트 두 덩이가 층을 이뤄 여백만 벌어졌다. 둘 다 "검색을 돕는
          보조 정보"라 한 줄에 놓아도 읽는 순서가 흐트러지지 않는다.
          flex-wrap 이라 칩이 여럿이거나 좁은 화면에서는 알아서 접힌다. */}
      <div className="mt-3 flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1.5">
        {hasHistory ? (
          <>
            {recents.slice(0, 3).map((k) => (
              <button
                key={`r-${k}`}
                type="button"
                onClick={() => {
                  pushRecentSearch(k);
                  router.push(`/search?q=${encodeURIComponent(k)}`);
                }}
                className="chip max-w-[160px] truncate bg-surface px-3 py-1.5 t-sub font-bold text-text-2 shadow-sm transition-all duration-150 hover:-translate-y-px hover:shadow-[0_6px_16px_rgba(16,28,54,.12)]"
              >
                ⌕ {k}
              </button>
            ))}
            {recentComplexes.slice(0, 3).map((c) => (
              <button
                key={`c-${c.id}`}
                type="button"
                onClick={() => router.push(complexHrefFromId(c.id))}
                className="chip max-w-[180px] truncate bg-primary-soft px-3 py-1.5 t-sub font-bold text-primary transition-all duration-150 hover:-translate-y-px hover:shadow-[0_6px_16px_rgba(16,28,54,.12)]"
              >
                🏢 {c.name}
              </button>
            ))}
          </>
        ) : (
          regionChips.length > 0 && (
            <>
              {/* [950] "열린 지역 · 수요 순 확장 중" 은 전국 218개 시군구를 다루는 지금과
                  맞지 않는 문구였다. 바로 눌러 볼 수 있는 지역(시세 카드와 같은 곳)만 보인다. */}
              <span className="text-[12px] font-semibold text-text-3">바로 보기</span>
              {regionChips.map((r) => (
                <button
                  key={r.label}
                  type="button"
                  onClick={() => router.push(r.href)}
                  className="chip bg-surface px-3 py-1.5 t-sub font-bold text-text-2 shadow-sm transition-all duration-150 hover:-translate-y-px hover:shadow-[0_6px_16px_rgba(16,28,54,.12)]"
                >
                  {r.label}
                </button>
              ))}
              {/* 내 동네는 지도에서 — 검색 무결과 화면의 수요 카드는 그대로 살아 있다 */}
              <button
                type="button"
                onClick={() => router.push("/map")}
                className="chip bg-primary-soft px-3 py-1.5 t-sub font-bold text-primary transition-all duration-150 hover:-translate-y-px hover:shadow-[0_6px_16px_rgba(16,28,54,.12)]"
              >
                지도에서 내 동네 찾기
              </button>
            </>
          )
        )}
        {coverage}
      </div>
    </div>
  );
}
