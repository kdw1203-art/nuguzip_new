"use client";

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { pushRecentSearch, readRecentSearches } from "@/lib/search/recent-searches";
import { useSettledSearchQuery } from "@/lib/search/settle";

/* P2-14: 데스크탑 GNB 검색 — input + 통합 자동완성.
   /api/search/unified?q= (대기 규칙은 lib/search/settle) · 단지·매물·노트·뉴스 그룹 제안.
   항목 클릭 → 각 상세 · Enter → /search?q=… · Esc 닫기. 스타일은 기존 글래스 인풋 유지.
   [966] 콤보박스 패턴(/search 와 동일) — ↑↓ 순환·Enter 로 활성 항목 열기·Esc 는 목록만
   닫고 포커스는 남긴다(한 번 더 누르면 인풋을 떠난다). 포커스는 늘 인풋에 있고
   활성 항목은 aria-activedescendant 로만 가리킨다 — 계속 타이핑해 좁힐 수 있게. */

const LISTBOX_ID = "hs-listbox";
const optionId = (i: number) => `hs-opt-${i}`;

interface UnifiedResults {
  complexes: { id: string; name: string; region: string }[];
  listings: { id: string; title: string; price: string }[];
  notes: { id: string; title: string }[];
  news: { id: string; title: string; source: string }[];
}

type Kind = "complex" | "listing" | "note" | "news";

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

export function HeaderSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [items, setItems] = useState<FlatItem[]>([]);
  /** 조회에 실패한 그룹 — 비어 있지 않으면 "결과 없음" 문구를 쓰지 않는다. */
  const [failed, setFailed] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  /* 항목 12 — 빈 입력 포커스 시 보여줄 최근 검색어 (/search 와 같은 저장소) */
  const [recents, setRecents] = useState<string[]>([]);
  /* [966] 키보드로 가리키는 항목 — -1 은 없음(Enter 가 통합 검색으로 간다) */
  const [active, setActive] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const { query: settledQuery, compositionProps } = useSettledSearchQuery(q);

  const hasQuery = q.trim().length > 0;
  const showRecents = open && !hasQuery && recents.length > 0;
  const showResults = open && hasQuery;
  /* 한 번에 한 목록만 보이므로 옵션 수도 하나 — 최근 검색어 또는 제안 */
  const optionCount = showRecents ? recents.length : showResults ? items.length : 0;

  /* 목록이 바뀌면 가리키던 자리는 의미를 잃는다 */
  useEffect(() => setActive(-1), [items, recents, open, hasQuery]);

  /* 항목 12 — `/` 단축키로 검색 진입. 입력 중(폼 요소·contentEditable)에는
     끼어들지 않는다. 헤더 인풋이 화면에 없는 뷰포트(lg 미만)에서는 /search 로. */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      /* [OPT-45] ⌘K/Ctrl+K 도 검색 진입 — 다른 도구들에서 몸에 밴 단축키를 존중 */
      const isCmdK = (e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "k";
      const isSlash = e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey;
      if (!isSlash && !isCmdK) return;
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.tagName === "SELECT" ||
          t.isContentEditable)
      )
        return;
      e.preventDefault();
      const el = inputRef.current;
      // offsetParent === null ⇒ display:none (hidden lg:block 의 lg 미만)
      if (el && el.offsetParent !== null) el.focus();
      else router.push("/search");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  /* 통합 서제스트 — 대기 시간은 lib/search/settle 에 모아 뒀다(값이 화면마다
     달랐던 이유가 어디에도 없었다). 한글 조합 중에는 더 길게 기다린다:
     예전 200ms 로는 380ms 간격으로 치는 사람에게 "ㄹ","라","래","램"… 이
     그대로 요청으로 나갔다(실측). */
  useEffect(() => {
    const query = settledQuery;
    if (!query) {
      setItems([]);
      setFailed([]);
      setOpen(false);
      return;
    }
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    void (async () => {
      try {
        const res = await fetch(`/api/search/unified?q=${encodeURIComponent(query)}`, {
          signal: ac.signal,
        });
        if (!res.ok) throw new Error("unified failed");
        const json = (await res.json()) as Partial<UnifiedResults> & { failed?: string[] };
        const flat = flatten({
          complexes: json.complexes ?? [],
          listings: json.listings ?? [],
          notes: json.notes ?? [],
          news: json.news ?? [],
        });
        setItems(flat);
        /* 조회가 실패한 그룹이 있으면 "일치하는 결과가 없어요"를 쓰지 않는다.
           드롭다운은 짧아야 하니 문장 하나로만 사실을 바꿔 적는다. */
        setFailed(Array.isArray(json.failed) ? json.failed : []);
        setOpen(true);
      } catch {
        if (!ac.signal.aborted) {
          setItems([]);
          setFailed(["단지", "매물", "임장노트", "뉴스"]);
          setOpen(false);
        }
      }
    })();
    /* 검색어가 바뀌면 이전 요청을 취소한다 — 늦게 도착한 옛 응답이 새 검색어의
       결과를 덮어쓰면, 화면은 사용자가 치지 않은 말에 답하게 된다. */
    return () => ac.abort();
  }, [settledQuery]);

  /* 바깥 클릭 시 드롭다운 닫기 */
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  function submit() {
    const query = q.trim();
    if (!query) {
      router.push("/search");
      return;
    }
    pushRecentSearch(query);
    setOpen(false);
    router.push(`/search?q=${encodeURIComponent(query)}`);
  }

  /** 최근 검색어 클릭 → 통합 검색 결과로 (맨 앞 재승격 저장 포함) */
  function pickRecent(k: string) {
    pushRecentSearch(k);
    setOpen(false);
    router.push(`/search?q=${encodeURIComponent(k)}`);
  }

  function pick(it: FlatItem) {
    setOpen(false);
    setQ("");
    router.push(it.href);
  }

  /** 포커스·↓ 로 목록을 연다 — 검색어가 있으면 제안, 비어 있으면 최근 검색어 */
  function openForCurrent() {
    if (hasQuery) {
      if (items.length > 0) setOpen(true);
      return;
    }
    // 항목 12 — 빈 입력이면 최근 검색어를 보여준다 (없으면 열지 않음)
    const r = readRecentSearches();
    setRecents(r);
    if (r.length > 0) setOpen(true);
  }

  /** 활성 항목을 연다 — 없으면 false (호출부가 통합 검색으로 넘긴다) */
  function pickActive(): boolean {
    if (active < 0) return false;
    if (showRecents) {
      const k = recents[active];
      if (k === undefined) return false;
      pickRecent(k);
      return true;
    }
    const it = items[active];
    if (!it) return false;
    pick(it);
    return true;
  }

  function onInputKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    /* 한글 조합 중 방향키·Enter 는 IME 몫 — 가로채지 않는다 */
    if (e.nativeEvent.isComposing) return;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (optionCount === 0) {
          openForCurrent();
          return;
        }
        setActive((i) => (i + 1) % optionCount);
        return;
      case "ArrowUp":
        e.preventDefault();
        if (optionCount === 0) return;
        setActive((i) => (i <= 0 ? optionCount - 1 : i - 1));
        return;
      case "Home":
        if (optionCount === 0 || active < 0) return;
        e.preventDefault();
        setActive(0);
        return;
      case "End":
        if (optionCount === 0 || active < 0) return;
        e.preventDefault();
        setActive(optionCount - 1);
        return;
      case "Enter":
        e.preventDefault();
        if (!pickActive()) submit();
        return;
      case "Escape":
        /* 열려 있으면 목록만 닫는다(포커스 유지) · 이미 닫혀 있으면 인풋을 떠난다 */
        if (open) {
          e.preventDefault();
          setOpen(false);
          setActive(-1);
          return;
        }
        e.currentTarget.blur();
        return;
      default:
        return;
    }
  }

  const optionClass = (i: number) =>
    `flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left transition-colors hover:bg-[rgba(29,79,216,.08)] ${
      active === i ? "bg-primary-soft" : ""
    }`;

  return (
    <div ref={boxRef} className="relative hidden lg:block">
      {/* 폭 실측(2026-08-16 캡처): w-[200px]에서 입력부 가용폭이 ~125px 인데
          플레이스홀더가 ~150px 라 "검색"이 글자 중간에서 잘렸다. 문구가 온전히
          들어가는 폭으로 넓히고, 그래도 좁아지는 상황은 말줄임(…)으로 접는다. */}
      <div className="field-focus flex w-[232px] items-center gap-2 rounded-xl bg-[var(--glass-bg)] px-3.5 py-2 text-[13px] text-text-3 xl:w-[252px]">
        <span aria-hidden>⌕</span>
        <input
          ref={inputRef}
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          {...compositionProps}
          onFocus={openForCurrent}
          onKeyDown={onInputKeyDown}
          role="combobox"
          aria-expanded={optionCount > 0}
          aria-controls={LISTBOX_ID}
          aria-activedescendant={active >= 0 ? optionId(active) : undefined}
          aria-autocomplete="list"
          placeholder="단지·매물·노트·뉴스 검색"
          aria-label="통합 검색 (단축키 /)"
          autoComplete="off"
          className="w-full text-ellipsis bg-transparent text-[13px] text-ink outline-none placeholder:text-text-3"
        />
        {/* 항목 12 — 단축키 발견성. 장식이므로 스크린리더에서는 숨긴다(aria-label 에 명시). */}
        <kbd
          aria-hidden
          className="shrink-0 rounded-md border border-line bg-[var(--glass-bg)] chip-pad-tight font-sans t-caption font-bold text-text-3"
        >
          /
        </kbd>
      </div>

      {/* 항목 12 — 빈 입력 포커스: 최근 검색어 드롭다운
          [966] 옵션은 tabIndex=-1 — 포커스는 인풋에 두고 activedescendant 로 가리킨다.
          마우스 올림도 같은 활성 상태를 쓴다(강조가 두 갈래로 갈리지 않게). */}
      {showRecents && (
        <div className="absolute left-0 top-[calc(100%+8px)] z-50 w-[300px]">
          <div
            className="glass-strong overflow-hidden rounded-2xl p-1.5 [animation:riseIn_180ms_var(--ease-out)_backwards]"
            style={{ background: "rgba(255,255,255,.9)" }}
          >
            <div id="hs-recents-label" className="px-3 pb-1 pt-1.5 text-[10px] font-extrabold text-text-3">
              최근 검색
            </div>
            <div role="listbox" id={LISTBOX_ID} aria-labelledby="hs-recents-label">
              {recents.map((k, i) => (
                <button
                  key={k}
                  type="button"
                  role="option"
                  id={optionId(i)}
                  aria-selected={active === i}
                  tabIndex={-1}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pickRecent(k)}
                  className={optionClass(i)}
                >
                  <span aria-hidden className="shrink-0 text-[12px] text-text-3">
                    ⌕
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-text-1">
                    {k}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {showResults && (
        <div className="absolute left-0 top-[calc(100%+8px)] z-50 w-[300px]">
          <div
            className="glass-strong overflow-hidden rounded-2xl p-1.5 [animation:riseIn_180ms_var(--ease-out)_backwards]"
            style={{ background: "rgba(255,255,255,.9)" }}
          >
            {items.length > 0 ? (
              <div role="listbox" id={LISTBOX_ID} aria-label="검색 제안">
                {items.map((it, i) => (
                  <button
                    key={it.key}
                    type="button"
                    role="option"
                    id={optionId(i)}
                    aria-selected={active === i}
                    tabIndex={-1}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => pick(it)}
                    className={optionClass(i)}
                  >
                    <span className="shrink-0 rounded bg-primary-soft px-1.5 py-px text-[10px] font-extrabold text-primary">
                      {it.label}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-text-1">
                      {it.title}
                    </span>
                    {it.meta && (
                      <span className="max-w-[84px] shrink-0 truncate text-[12px] text-text-3">
                        {it.meta}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            ) : failed.length > 0 ? (
              <div className="px-3 py-3 text-center text-[12px] text-text-3">
                지금은 검색이 되지 않아요 (결과 없음이 아니에요)
              </div>
            ) : (
              <div className="px-3 py-3 text-center text-[12px] text-text-3">
                일치하는 결과가 없어요
              </div>
            )}
            <button
              type="button"
              onClick={submit}
              className="mt-0.5 flex w-full items-center rounded-[10px] border-t border-divider px-3 py-2 text-left text-[12px] font-bold text-primary transition-colors hover:bg-[rgba(29,79,216,.08)]"
            >
              “{q.trim()}” 통합 검색 ›
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
