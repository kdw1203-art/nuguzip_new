"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/app/components/Icon";

/**
 * 임장노트 위치 검색 — 단지명·주소로 검색해 노트에 위치를 연결한다.
 * /api/search/suggest 재사용: 내부 단지(suggestions) + 장소검색 폴백(places).
 * 선택 시 상위로 {aptName, region, complexId?, lat?, lng?} 전달.
 */

export type NoteLocation = {
  aptName: string;
  region: string;
  complexId?: string | null;
  lat?: number | null;
  lng?: number | null;
};

type Suggestion = { id: string; name: string; region: string; dong?: string };
type Place = { name: string; address: string; lat: number; lng: number };

export function NoteLocationSearch({
  value,
  onChange,
}: {
  value: NoteLocation;
  onChange: (loc: NoteLocation) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // 바깥 클릭 시 닫기
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  // 디바운스 검색
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setSuggestions([]);
      setPlaces([]);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    const t = setTimeout(() => {
      fetch(`/api/search/suggest?q=${encodeURIComponent(term)}`, { signal: controller.signal })
        .then((r) => (r.ok ? r.json() : { suggestions: [], places: [] }))
        .then((json: { suggestions?: Suggestion[]; places?: Place[] }) => {
          setSuggestions(Array.isArray(json.suggestions) ? json.suggestions.slice(0, 8) : []);
          setPlaces(Array.isArray(json.places) ? json.places.slice(0, 5) : []);
        })
        .catch(() => {
          /* abort/오류 무시 */
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 250);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [q]);

  const pickComplex = (s: Suggestion) => {
    onChange({ aptName: s.name, region: s.region, complexId: s.id, lat: null, lng: null });
    setOpen(false);
    setQ("");
  };
  const pickPlace = (p: Place) => {
    // 주소에서 시군구까지를 지역으로 사용
    const region = p.address.split(" ").slice(0, 2).join(" ") || p.address;
    onChange({ aptName: p.name, region, complexId: null, lat: p.lat, lng: p.lng });
    setOpen(false);
    setQ("");
  };

  return (
    <div ref={boxRef} className="relative">
      {/* 현재 위치 카드 (클릭 시 검색 열림) */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rise-in-1 card flex w-full items-center gap-2 rounded-[14px] px-3.5 py-3 text-left"
      >
        <Icon name="📍" size={16} className="shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold text-ink">{value.aptName || "단지·주소 검색"}</div>
          <div className="truncate text-[11px] text-text-3">
            {value.region ? `${value.region} · 눌러서 변경` : "단지명이나 주소를 검색해 연결"}
          </div>
        </div>
        <Icon name="search" size={15} className="shrink-0 text-text-3" />
      </button>

      {/* 검색 드롭다운 */}
      {open ? (
        <div className="glass-strong absolute left-0 right-0 top-[calc(100%+6px)] z-30 rounded-[14px] border border-line p-2 shadow-xl">
          <div className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2">
            <Icon name="search" size={15} className="text-text-3" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="단지명 또는 주소 (예: 은마아파트, 대치동)"
              className="w-full bg-transparent text-[13px] text-ink outline-none placeholder:text-text-3"
            />
            {q ? (
              <button type="button" aria-label="지우기" onClick={() => setQ("")} className="press">
                <Icon name="x" size={14} className="text-text-3" />
              </button>
            ) : null}
          </div>

          <div className="mt-2 max-h-[280px] overflow-y-auto">
            {loading ? (
              <div className="px-2 py-3 text-[12px] text-text-3">검색 중…</div>
            ) : q.trim().length < 2 ? (
              <div className="px-2 py-3 text-[12px] text-text-3">두 글자 이상 입력해 주세요.</div>
            ) : suggestions.length === 0 && places.length === 0 ? (
              <div className="px-2 py-3 text-[12px] text-text-3">
                검색 결과가 없어요. 단지명·지역을 직접 입력해도 돼요.
              </div>
            ) : (
              <>
                {suggestions.length > 0 ? (
                  <div className="mb-1">
                    <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-text-3">
                      단지
                    </div>
                    {suggestions.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => pickComplex(s)}
                        className="press flex w-full items-center gap-2 rounded-[10px] px-2 py-2 text-left active:bg-primary-soft"
                      >
                        <Icon name="building2" size={15} className="shrink-0 text-primary" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-semibold text-ink">
                            {s.name}
                          </span>
                          <span className="block truncate text-[11px] text-text-3">{s.region}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}
                {places.length > 0 ? (
                  <div>
                    <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-text-3">
                      주소·장소
                    </div>
                    {places.map((p, i) => (
                      <button
                        key={`${p.name}-${i}`}
                        type="button"
                        onClick={() => pickPlace(p)}
                        className="press flex w-full items-center gap-2 rounded-[10px] px-2 py-2 text-left active:bg-primary-soft"
                      >
                        <Icon name="map" size={15} className="shrink-0 text-text-2" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-semibold text-ink">
                            {p.name}
                          </span>
                          <span className="block truncate text-[11px] text-text-3">{p.address}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
