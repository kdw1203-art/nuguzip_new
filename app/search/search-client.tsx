"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

/* ============================================================
   통합 검색 경험 — 단지·매물·임장노트·뉴스 통합 결과
   /api/search/unified?q= (디바운스 250ms) · 그룹별 섹션 + 더 보기
   각 항목 → 상세(/complex·/listings·/notes·/town/news)
   최근 검색 5개 localStorage · 빈/로딩 상태 처리
   ============================================================ */

interface UnifiedResults {
  complexes: { id: string; name: string; region: string }[];
  listings: { id: string; title: string; price: string }[];
  notes: { id: string; title: string }[];
  news: { id: string; title: string; source: string }[];
}

const EMPTY: UnifiedResults = { complexes: [], listings: [], notes: [], news: [] };

const RECENT_KEY = "nuguzip.recentSearches";
const RECENT_MAX = 5;
const POPULAR = ["관양동", "동편마을", "과천 S7 청약", "인덕원선"] as const;

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

type SectionKey = keyof UnifiedResults;

function hrefFor(key: SectionKey, id: string): string {
  const enc = encodeURIComponent(id);
  switch (key) {
    case "complexes":
      return `/complex/${enc}`;
    case "listings":
      return `/listings/${enc}`;
    case "notes":
      return `/notes/${enc}`;
    case "news":
      return `/town/news/${enc}`;
  }
}

interface Row {
  id: string;
  title: string;
  meta?: string;
}
interface Group {
  key: SectionKey;
  label: string;
  more: string;
  rows: Row[];
}

export function SearchClient() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<UnifiedResults>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  /* 마운트: 최근 검색 로드 + URL(?q=) 프리필 */
  useEffect(() => {
    setRecent(readRecent());
    try {
      const initial = new URLSearchParams(window.location.search).get("q")?.trim();
      if (initial) setQ(initial);
    } catch {
      // URL 파싱 실패 — 무시
    }
  }, []);

  /* 디바운스 250ms 통합 검색 */
  useEffect(() => {
    const query = q.trim();
    if (!query) {
      setResults(EMPTY);
      setLoading(false);
      abortRef.current?.abort();
      return;
    }
    setLoading(true);
    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      try {
        const res = await fetch(`/api/search/unified?q=${encodeURIComponent(query)}`, {
          signal: ac.signal,
        });
        if (!res.ok) throw new Error("unified failed");
        const json = (await res.json()) as Partial<UnifiedResults>;
        setResults({
          complexes: json.complexes ?? [],
          listings: json.listings ?? [],
          notes: json.notes ?? [],
          news: json.news ?? [],
        });
      } catch {
        if (!ac.signal.aborted) setResults(EMPTY);
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [q]);

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

  const runSearch = useCallback(
    (keyword: string) => {
      const k = keyword.trim();
      if (!k) return;
      setQ(k);
      saveRecent(k);
      try {
        window.history.replaceState(null, "", `/search?q=${encodeURIComponent(k)}`);
      } catch {
        // history 갱신 실패 — 무시
      }
    },
    [saveRecent],
  );

  const hasQuery = q.trim().length > 0;
  const total =
    results.complexes.length +
    results.listings.length +
    results.notes.length +
    results.news.length;

  const groups: Group[] = [
    {
      key: "complexes",
      label: "단지",
      more: "/complex/browse",
      rows: results.complexes.map((c) => ({ id: c.id, title: c.name, meta: c.region })),
    },
    {
      key: "listings",
      label: "매물",
      more: "/listings",
      rows: results.listings.map((l) => ({ id: l.id, title: l.title, meta: l.price })),
    },
    {
      key: "notes",
      label: "임장노트",
      more: "/notes",
      rows: results.notes.map((n) => ({ id: n.id, title: n.title })),
    },
    {
      key: "news",
      label: "뉴스",
      more: "/town/news",
      rows: results.news.map((n) => ({ id: n.id, title: n.title, meta: n.source })),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* 큰 검색 입력 */}
      <div className="rise-in flex w-full max-w-[560px] items-center gap-2.5 rounded-2xl border-[1.5px] border-primary bg-surface px-4 py-3 text-ink shadow-[0_8px_28px_rgba(16,28,54,.08)]">
        <span aria-hidden className="text-lg text-text-3">
          ⌕
        </span>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              runSearch(q);
            }
          }}
          placeholder="단지·매물·임장노트·뉴스 통합 검색"
          aria-label="통합 검색"
          autoComplete="off"
          className="w-full bg-transparent text-[15px] text-ink outline-none placeholder:text-text-3"
        />
        {hasQuery && (
          <button
            type="button"
            onClick={() => setQ("")}
            className="shrink-0 text-sm text-text-3"
            aria-label="검색어 지우기"
          >
            ✕
          </button>
        )}
      </div>

      {/* 검색↔지도 연동 (#9b) — 현재 검색어로 지도 이동 */}
      {hasQuery && (
        <Link
          href={`/map?q=${encodeURIComponent(q.trim())}`}
          onClick={() => saveRecent(q)}
          className="btn-soft rise-in inline-flex w-fit items-center gap-1.5 rounded-xl px-3.5 py-2 text-[13px] font-bold text-primary"
        >
          🗺️ ‘{q.trim()}’ 지도에서 보기 ›
        </Link>
      )}

      {/* 검색어 없음 — 최근·인기 검색 */}
      {!hasQuery && (
        <div className="rise-in mt-2 flex flex-col gap-5">
          {recent.length > 0 && (
            <div>
              <div className="mb-2 px-1 text-xs font-extrabold text-text-3">최근 검색</div>
              <div className="flex flex-wrap gap-[6px]">
                {recent.map((k) => (
                  <span
                    key={k}
                    className="chip flex items-center gap-1.5 border border-line bg-bg px-3 py-1.5 text-[11px] text-text-2"
                  >
                    <button type="button" onClick={() => runSearch(k)} className="font-semibold">
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
          <div>
            <div className="mb-2 px-1 text-xs font-extrabold text-text-3">인기 검색</div>
            <div className="flex flex-wrap gap-[6px]">
              {POPULAR.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => runSearch(k)}
                  className="chip bg-[#f2f4f8] px-3 py-1.5 text-[11px] text-text-2"
                >
                  {k}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 로딩 */}
      {hasQuery && loading && total === 0 && (
        <div className="mt-6 text-center text-sm text-text-3">검색 중…</div>
      )}

      {/* 빈 결과 */}
      {hasQuery && !loading && total === 0 && (
        <div className="mt-8 flex flex-col items-center gap-2 text-center">
          <div className="text-[15px] font-extrabold text-ink">
            ‘{q.trim()}’ 검색 결과가 없어요
          </div>
          <div className="text-[12px] text-text-3">
            단지명·지역·매물·임장노트·뉴스를 검색할 수 있어요.
          </div>
        </div>
      )}

      {/* 그룹별 결과 섹션 */}
      {hasQuery && total > 0 && (
        <div className="mt-1 flex flex-col gap-4">
          {groups
            .filter((g) => g.rows.length > 0)
            .map((g) => (
              <section key={g.key} className="rise-in card rounded-2xl p-[18px]">
                <header className="mb-1 flex items-center justify-between">
                  <div className="text-[13px] font-extrabold text-ink">
                    {g.label} <span className="text-text-3">{g.rows.length}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {g.key === "complexes" && (
                      <Link
                        href={`/map?q=${encodeURIComponent(q.trim())}`}
                        onClick={() => saveRecent(q)}
                        className="text-[12px] font-bold text-primary"
                      >
                        지도 ›
                      </Link>
                    )}
                    <Link href={g.more} className="text-[12px] font-bold text-primary">
                      더 보기 ›
                    </Link>
                  </div>
                </header>
                <div className="flex flex-col">
                  {g.rows.map((r, i) => (
                    <Link
                      key={r.id}
                      href={hrefFor(g.key, r.id)}
                      onClick={() => saveRecent(q)}
                      className={`flex items-center justify-between gap-3 py-2.5 transition-colors hover:text-primary ${
                        i < g.rows.length - 1 ? "border-b border-[#f0f3f8]" : ""
                      }`}
                    >
                      <span className="min-w-0 truncate text-[13px] font-bold text-ink">
                        {r.title}
                      </span>
                      {r.meta && (
                        <span className="shrink-0 text-[11px] text-text-3">{r.meta}</span>
                      )}
                    </Link>
                  ))}
                </div>
              </section>
            ))}
        </div>
      )}
    </div>
  );
}
