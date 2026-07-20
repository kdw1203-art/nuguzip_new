"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/* P2-14: 데스크탑 GNB 검색 승격 — 입력창처럼 보이던 <Link> 를 실제 input + 자동완성으로.
   /api/search/suggest?q= (디바운스 200ms) · 항목 클릭 → /complex/[id] ·
   Enter → /search?q=… · Esc 닫기. 스타일은 기존 Link(글래스 인풋)와 동일. */

interface SuggestItem {
  id: string;
  name: string;
  region: string;
  dong: string;
}

export function HeaderSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [suggestions, setSuggestions] = useState<SuggestItem[]>([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  /* 디바운스 200ms 서제스트 */
  useEffect(() => {
    const query = q.trim();
    if (!query) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      try {
        const res = await fetch(`/api/search/suggest?q=${encodeURIComponent(query)}`, {
          signal: ac.signal,
        });
        if (!res.ok) throw new Error("suggest failed");
        const json = (await res.json()) as { suggestions?: SuggestItem[] };
        setSuggestions(json.suggestions ?? []);
        setOpen((json.suggestions ?? []).length > 0);
      } catch {
        if (!ac.signal.aborted) {
          setSuggestions([]);
          setOpen(false);
        }
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [q]);

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
    setOpen(false);
    router.push(`/search?q=${encodeURIComponent(query)}`);
  }

  function pick(s: SuggestItem) {
    setOpen(false);
    setQ("");
    router.push(`/complex/${encodeURIComponent(s.id)}`);
  }

  return (
    <div ref={boxRef} className="relative hidden lg:block">
      <div className="flex w-[200px] items-center gap-2 rounded-xl bg-[rgba(255,255,255,.7)] px-3.5 py-2 text-[13px] text-text-3">
        <span aria-hidden>⌕</span>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => {
            if (q.trim() && suggestions.length > 0) setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            } else if (e.key === "Escape") {
              setOpen(false);
              (e.target as HTMLInputElement).blur();
            }
          }}
          placeholder="지역, 단지명 검색"
          aria-label="지역, 단지명 검색"
          autoComplete="off"
          className="w-full bg-transparent text-[13px] text-ink outline-none placeholder:text-text-3"
        />
      </div>

      {open && suggestions.length > 0 && (
        <div className="absolute left-0 top-[calc(100%+8px)] z-50 w-[260px]">
          <div
            className="glass-strong overflow-hidden rounded-2xl p-1.5 [animation:riseIn_180ms_var(--ease-out)_both]"
            style={{ background: "rgba(255,255,255,.9)" }}
          >
            {suggestions.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => pick(s)}
                className="flex w-full items-center justify-between gap-3 rounded-[10px] px-3 py-2 text-left transition-colors hover:bg-[rgba(29,79,216,.08)]"
              >
                <span className="truncate text-[13px] font-semibold text-text-1">{s.name}</span>
                <span className="shrink-0 text-[11px] text-text-3">{s.region}</span>
              </button>
            ))}
            <button
              type="button"
              onClick={submit}
              className="mt-0.5 flex w-full items-center rounded-[10px] border-t border-[#f0f3f8] px-3 py-2 text-left text-[12px] font-bold text-primary transition-colors hover:bg-[rgba(29,79,216,.08)]"
            >
              “{q.trim()}” 실거래 검색 ›
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
