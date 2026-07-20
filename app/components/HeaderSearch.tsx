"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/* P2-14: 데스크탑 GNB 검색 — input + 통합 자동완성.
   /api/search/unified?q= (디바운스 200ms) · 단지·매물·노트·뉴스 그룹 제안.
   항목 클릭 → 각 상세 · Enter → /search?q=… · Esc 닫기. 스타일은 기존 글래스 인풋 유지. */

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
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  /* 디바운스 200ms 통합 서제스트 */
  useEffect(() => {
    const query = q.trim();
    if (!query) {
      setItems([]);
      setOpen(false);
      return;
    }
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
        const flat = flatten({
          complexes: json.complexes ?? [],
          listings: json.listings ?? [],
          notes: json.notes ?? [],
          news: json.news ?? [],
        });
        setItems(flat);
        setOpen(true);
      } catch {
        if (!ac.signal.aborted) {
          setItems([]);
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

  function pick(it: FlatItem) {
    setOpen(false);
    setQ("");
    router.push(it.href);
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
            if (q.trim() && items.length > 0) setOpen(true);
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
          placeholder="단지·매물·노트·뉴스 검색"
          aria-label="통합 검색"
          autoComplete="off"
          className="w-full bg-transparent text-[13px] text-ink outline-none placeholder:text-text-3"
        />
      </div>

      {open && (q.trim().length > 0) && (
        <div className="absolute left-0 top-[calc(100%+8px)] z-50 w-[300px]">
          <div
            className="glass-strong overflow-hidden rounded-2xl p-1.5 [animation:riseIn_180ms_var(--ease-out)_both]"
            style={{ background: "rgba(255,255,255,.9)" }}
          >
            {items.length > 0 ? (
              items.map((it) => (
                <button
                  key={it.key}
                  type="button"
                  onClick={() => pick(it)}
                  className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left transition-colors hover:bg-[rgba(29,79,216,.08)]"
                >
                  <span className="shrink-0 rounded bg-primary-soft px-1.5 py-px text-[9px] font-extrabold text-primary">
                    {it.label}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-text-1">
                    {it.title}
                  </span>
                  {it.meta && (
                    <span className="max-w-[84px] shrink-0 truncate text-[11px] text-text-3">
                      {it.meta}
                    </span>
                  )}
                </button>
              ))
            ) : (
              <div className="px-3 py-3 text-center text-[12px] text-text-3">
                일치하는 결과가 없어요
              </div>
            )}
            <button
              type="button"
              onClick={submit}
              className="mt-0.5 flex w-full items-center rounded-[10px] border-t border-[#f0f3f8] px-3 py-2 text-left text-[12px] font-bold text-primary transition-colors hover:bg-[rgba(29,79,216,.08)]"
            >
              “{q.trim()}” 통합 검색 ›
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
