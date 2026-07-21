"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/app/components/Icon";

/* ============================================================
   지도 단지 검색 박스 (6a·item1) — 아파트명·주소 자동완성.
   - 입력(디바운스) → GET /api/search/suggest?q= 로 단지 후보 드롭다운.
   - 주소성 질의(숫자·로/길/동/구/시)면 GET /api/map/geocode?q= 도 함께 조회해
     "📍 '주소'로 이동" 옵션을 상단에 제시(설정 안 됐거나 실패하면 조용히 생략).
   - 선택 시 상위(map-client)로 위임: 단지→recenter+하이라이트, 주소→지도 이동.
   자체 fetch·아웃사이드 클릭·키보드(Enter/Esc)만 담당하는 프레젠테이션 컴포넌트. */

interface SuggestItem {
  id: string;
  name: string;
  region: string;
  dong: string;
}

interface GeocodeItem {
  address: string;
  lat: number;
  lng: number;
}

export interface MapSearchSelectComplex {
  id: string;
  name: string;
  region: string;
}

export interface MapSearchSelectAddress {
  address: string;
  lat: number;
  lng: number;
}

interface MapSearchBoxProps {
  onSelectComplex: (item: MapSearchSelectComplex) => void;
  onSelectAddress: (item: MapSearchSelectAddress) => void;
  className?: string;
  placeholder?: string;
  /** header: 헤더 인라인(투명 배경) / floating: 독립 글래스 바 */
  variant?: "header" | "floating";
  autoFocus?: boolean;
}

const DEBOUNCE_MS = 280;

/** 주소성 질의 판정 — 숫자 포함 또는 행정구역/도로명 접미 */
function looksLikeAddress(q: string): boolean {
  return /\d/.test(q) || /(로|길|동|구|시|번지|읍|면|리)$/.test(q);
}

export function MapSearchBox({
  onSelectComplex,
  onSelectAddress,
  className = "",
  placeholder = "아파트명·주소 검색",
  variant = "header",
  autoFocus = false,
}: MapSearchBoxProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [complexes, setComplexes] = useState<SuggestItem[]>([]);
  const [address, setAddress] = useState<GeocodeItem | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<number | null>(null);

  // 디바운스 검색 — 단지 서제스트 + (주소성) 지오코딩 best-effort
  useEffect(() => {
    const q = query.trim();
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    if (q.length < 1) {
      abortRef.current?.abort();
      setComplexes([]);
      setAddress(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    timerRef.current = window.setTimeout(() => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const suggestP = fetch(`/api/search/suggest?q=${encodeURIComponent(q)}`, {
        signal: controller.signal,
      })
        .then((r) => (r.ok ? (r.json() as Promise<{ suggestions?: SuggestItem[] }>) : null))
        .then((j) => (controller.signal.aborted ? null : (j?.suggestions ?? [])))
        .catch(() => null);

      const geoP: Promise<GeocodeItem | null> = looksLikeAddress(q)
        ? fetch(`/api/map/geocode?q=${encodeURIComponent(q)}&limit=1`, {
            signal: controller.signal,
          })
            .then((r) => (r.ok ? (r.json() as Promise<{ items?: GeocodeItem[] }>) : null))
            .then((j) => {
              const it = j?.items?.[0];
              return it && Number.isFinite(it.lat) && Number.isFinite(it.lng) ? it : null;
            })
            .catch(() => null)
        : Promise.resolve(null);

      void Promise.all([suggestP, geoP]).then(([sug, geo]) => {
        if (controller.signal.aborted) return;
        setComplexes(sug ?? []);
        setAddress(geo);
        setLoading(false);
        setOpen(true);
      });
    }, DEBOUNCE_MS);
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, [query]);

  // 아웃사이드 클릭 → 드롭다운 닫기
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const clear = useCallback(() => {
    setQuery("");
    setComplexes([]);
    setAddress(null);
    setOpen(false);
  }, []);

  const pickComplex = useCallback(
    (c: SuggestItem) => {
      onSelectComplex({ id: c.id, name: c.name, region: c.region });
      setQuery(c.name);
      setOpen(false);
    },
    [onSelectComplex],
  );

  const pickAddress = useCallback(
    (a: GeocodeItem) => {
      onSelectAddress({ address: a.address, lat: a.lat, lng: a.lng });
      setQuery(a.address);
      setOpen(false);
    },
    [onSelectAddress],
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (e.key === "Enter") {
      if (complexes.length > 0) pickComplex(complexes[0]);
      else if (address) pickAddress(address);
    }
  };

  const hasResults = complexes.length > 0 || address !== null;
  const shellClass =
    variant === "floating"
      ? "glass-strong flex items-center gap-2 rounded-[16px] px-3.5 py-2.5"
      : "flex w-full items-center gap-2 rounded-xl border border-[rgba(255,255,255,.9)] bg-[rgba(255,255,255,.7)] px-3.5 py-2";

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <div className={shellClass}>
        <span aria-hidden="true" className="text-sm text-text-3">
          ⌕
        </span>
        <input
          type="search"
          value={query}
          autoFocus={autoFocus}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => hasResults && setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          aria-label="단지·주소 검색"
          className="min-w-0 flex-1 bg-transparent text-sm text-text-1 outline-none placeholder:text-text-3"
        />
        {query && (
          <button
            type="button"
            onClick={clear}
            aria-label="검색어 지우기"
            className="shrink-0 text-xs text-text-3"
          >
            ✕
          </button>
        )}
      </div>

      {open && query.trim().length >= 1 && (
        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 max-h-[60vh] overflow-y-auto rounded-2xl border border-[rgba(255,255,255,.9)] bg-[rgba(255,255,255,.98)] p-1.5 shadow-[0_16px_40px_rgba(16,28,54,.2)]">
          {loading && !hasResults && (
            <div className="px-3 py-3 text-xs text-text-3">검색 중…</div>
          )}
          {!loading && !hasResults && (
            <div className="px-3 py-3 text-xs text-text-3">일치하는 단지가 없어요.</div>
          )}
          {address && (
            <button
              type="button"
              onClick={() => pickAddress(address)}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left hover:bg-[#f2f4f8]"
            >
              <Icon name="📍" size={16} className="shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-bold text-ink">
                  {address.address}
                </span>
                <span className="text-[11px] text-text-3">이 주소로 지도 이동</span>
              </span>
            </button>
          )}
          {complexes.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => pickComplex(c)}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left hover:bg-[#f2f4f8]"
            >
              <Icon name="🏢" size={16} className="shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-bold text-ink">{c.name}</span>
                {c.region && (
                  <span className="block truncate text-[11px] text-text-3">{c.region}</span>
                )}
              </span>
              <span className="shrink-0 text-[11px] font-bold text-primary">선택 ›</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
