"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/* ============================================================
   검색 자동완성(#48) — 클라이언트 검색 입력 + 서제스트 드롭다운
   /api/search/suggest?q= (디바운스 200ms) · 결과 클릭 → /complex/[id]
   최근 검색 5개 localStorage (시안 12l — 최근·저장 검색 칩)
   ============================================================ */

interface SuggestItem {
  id: string;
  name: string;
  region: string;
  dong: string;
}

const RECENT_KEY = "nuguzip.recentSearches";
const RECENT_MAX = 5;

function readRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const arr: unknown = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter((v): v is string => typeof v === "string").slice(0, RECENT_MAX);
  } catch {
    return [];
  }
}

function writeRecent(list: string[]) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, RECENT_MAX)));
  } catch {
    // localStorage 불가(사파리 프라이빗 등) — 무시
  }
}

export function SearchClient({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [suggestions, setSuggestions] = useState<SuggestItem[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const boxRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setRecent(readRecent());
    // P2-14: GNB 인라인 검색에서 Enter → /search?q=… 진입 시 검색어 프리필
    try {
      const initial = new URLSearchParams(window.location.search).get("q")?.trim();
      if (initial) setQ(initial);
    } catch {
      // URL 파싱 실패 — 무시
    }
  }, []);

  /* 디바운스 200ms 서제스트 */
  useEffect(() => {
    const query = q.trim();
    if (!query) {
      setSuggestions([]);
      setOpen(false);
      setLoading(false);
      return;
    }
    setLoading(true);
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
        setOpen(true);
      } catch {
        if (!ac.signal.aborted) {
          setSuggestions([]);
          setOpen(true);
        }
      } finally {
        if (!ac.signal.aborted) setLoading(false);
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

  const saveRecent = useCallback((keyword: string) => {
    const k = keyword.trim();
    if (!k) return;
    setRecent((prev) => {
      const next = [k, ...prev.filter((v) => v !== k)].slice(0, RECENT_MAX);
      writeRecent(next);
      return next;
    });
  }, []);

  const removeRecent = useCallback((keyword: string) => {
    setRecent((prev) => {
      const next = prev.filter((v) => v !== keyword);
      writeRecent(next);
      return next;
    });
  }, []);

  const pick = useCallback(
    (s: SuggestItem) => {
      saveRecent(s.name);
      setOpen(false);
      router.push(`/complex/${encodeURIComponent(s.id)}`);
    },
    [router, saveRecent],
  );

  const hasQuery = q.trim().length > 0;

  return (
    <>
      {/* 검색 입력 + 서제스트 드롭다운 */}
      <div ref={boxRef} className="rise-in relative w-full max-w-[420px]">
        <div className="flex items-center gap-2 rounded-xl border-[1.5px] border-primary bg-surface px-3.5 py-2 text-sm text-ink">
          <span aria-hidden className="text-text-3">
            ⌕
          </span>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onFocus={() => {
              if (hasQuery && suggestions.length > 0) setOpen(true);
            }}
            placeholder="단지명·동 이름으로 검색"
            className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-text-3"
            aria-label="단지 검색"
            autoComplete="off"
          />
          {hasQuery && (
            <button
              type="button"
              onClick={() => setQ("")}
              className="shrink-0 text-xs text-text-3"
              aria-label="검색어 지우기"
            >
              ✕
            </button>
          )}
        </div>

        {open && hasQuery && (
          <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-30 overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_12px_36px_rgba(16,28,54,.14)]">
            {suggestions.length > 0 ? (
              suggestions.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => pick(s)}
                  className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-bg ${
                    i < suggestions.length - 1 ? "border-b border-[#f0f3f8]" : ""
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-bold text-ink">{s.name}</span>
                    <span className="mt-0.5 block truncate text-[11px] text-text-3">
                      {s.region || s.dong}
                    </span>
                  </span>
                  <span className="shrink-0 text-[11px] font-bold text-primary">단지 홈 ›</span>
                </button>
              ))
            ) : (
              <div className="px-4 py-4 text-center text-xs text-text-3">
                {loading ? "검색 중…" : "일치하는 단지가 없어요"}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 최근 검색 칩 (12l) — 입력 전 노출 · localStorage 5개 */}
      {!hasQuery && recent.length > 0 && (
        <div className="rise-in mt-3 flex flex-col gap-1.5">
          <div className="px-1 text-xs font-extrabold text-text-3">최근 검색</div>
          <div className="flex flex-wrap gap-[5px]">
            {recent.map((k) => (
              <span
                key={k}
                className="chip flex items-center gap-1.5 border border-line bg-bg px-3 py-1.5 text-[11px] text-text-2"
              >
                <button type="button" onClick={() => setQ(k)} className="font-semibold">
                  {k}
                </button>
                <button
                  type="button"
                  onClick={() => removeRecent(k)}
                  aria-label={`최근 검색 ${k} 삭제`}
                  className="text-text-3"
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 기존 정적 결과 섹션 — 검색어 없을 때만 유지 */}
      {!hasQuery && <div className="mt-4">{children}</div>}
    </>
  );
}
