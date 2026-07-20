"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { resolveRegion } from "./region-map";

/* ============================================================
   단지 선택기 (분석 도구 공용) — 검색 → 서제스트 드롭다운 → 단지 선택.
   - 입력: 디바운스(250ms) 후 GET /api/search/suggest?q=
   - 선택: GET /api/complex/[id]/detail 로 지역·최근 실거래가 보강
   - 딥링크: props(initialComplexId/initialApt)가 없으면 현재 URL의
     ?complexId= / ?apt= 를 읽어 초기 선택 (지도/검색 → 분석 seamless)
   - onSelect 로 부모에 선택 단지(id·name·region·regionId) 전달
   ============================================================ */

export type PickedComplex = {
  id: string;
  name: string;
  /** 사람이 읽는 지역 표기 (예: "안양시 동안구") — 실시세 지역명 매칭용 */
  region: string;
  /** 시세 API regionId (해석 실패 시 null) */
  regionId: string | null;
  /** 표시용 라벨 (예: "서울 강남구") */
  regionLabel: string | null;
  /** 최근 실거래가 라벨 (예: "8.4억") — 없으면 null */
  priceLabel: string | null;
};

type Suggestion = { id: string; name: string; region: string; dong: string };

function manwonLabel(manwon: number | null | undefined): string | null {
  if (manwon == null || !Number.isFinite(manwon) || manwon <= 0) return null;
  if (manwon >= 10_000) {
    const eok = manwon / 10_000;
    return `${eok >= 10 ? Math.round(eok).toLocaleString("ko-KR") : eok.toFixed(1)}억`;
  }
  return `${Math.round(manwon).toLocaleString("ko-KR")}만`;
}

function toPicked(
  id: string,
  name: string,
  region: string,
  priceLabel: string | null,
): PickedComplex {
  const ref = resolveRegion(region);
  return {
    id,
    name,
    region,
    regionId: ref?.id ?? null,
    regionLabel: ref?.label ?? (region.trim() || null),
    priceLabel,
  };
}

async function fetchDetail(
  id: string,
): Promise<{ region: string; priceLabel: string | null; name: string | null } | null> {
  try {
    const res = await fetch(`/api/complex/${encodeURIComponent(id)}/detail`);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      complex?: { name?: string; city?: string; district?: string } | null;
      transactions?: { avg_manwon?: number }[];
    };
    const c = data.complex ?? null;
    const region = c ? [c.city, c.district].filter(Boolean).join(" ") : "";
    const tx = Array.isArray(data.transactions) ? data.transactions : [];
    const latest = tx.length ? tx[tx.length - 1] : null;
    return { region, priceLabel: manwonLabel(latest?.avg_manwon), name: c?.name ?? null };
  } catch {
    return null;
  }
}

export function ComplexPicker({
  onSelect,
  initialComplexId,
  initialApt,
  showChip = true,
  clearOnSelect = false,
  placeholder = "단지명으로 검색 (예: 공작아파트)",
  label = "단지 선택",
}: {
  onSelect: (c: PickedComplex) => void;
  /** ?complexId= 딥링크 값 (undefined면 URL에서 자동 인식) */
  initialComplexId?: string | null;
  /** ?apt= 딥링크 값 (undefined면 URL에서 자동 인식) */
  initialApt?: string | null;
  /** 선택 단지 칩 표시 (compare처럼 자체 표시가 있으면 false) */
  showChip?: boolean;
  /** 선택 후 입력창 비우기 (여러 단지 연속 담기용) */
  clearOnSelect?: boolean;
  placeholder?: string;
  label?: string;
}) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<PickedComplex | null>(null);

  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const boxRef = useRef<HTMLDivElement | null>(null);
  const initRef = useRef(false);

  const choose = useCallback(
    async (s: { id: string; name: string; region: string }) => {
      setOpen(false);
      setItems([]);
      // 후보 데이터로 즉시 반영 후 상세로 보강
      let picked = toPicked(s.id, s.name, s.region, null);
      setSelected(picked);
      setQuery(clearOnSelect ? "" : s.name);
      onSelectRef.current(picked);
      const detail = await fetchDetail(s.id);
      if (detail) {
        picked = toPicked(
          s.id,
          detail.name ?? s.name,
          detail.region || s.region,
          detail.priceLabel,
        );
        if (!clearOnSelect) setSelected(picked);
        onSelectRef.current(picked);
      }
    },
    [clearOnSelect],
  );

  const runSuggest = useCallback(
    async (q: string, autoselect = false) => {
      const term = q.trim();
      if (!term) {
        setItems([]);
        setOpen(false);
        return;
      }
      setLoading(true);
      try {
        const res = await fetch(`/api/search/suggest?q=${encodeURIComponent(term)}`);
        const data = (await res.json()) as { suggestions?: Suggestion[] };
        const list = Array.isArray(data.suggestions) ? data.suggestions : [];
        if (autoselect) {
          const exact =
            list.find((s) => s.name === term) ?? (list.length === 1 ? list[0] : null);
          if (exact) {
            await choose(exact);
            return;
          }
        }
        setItems(list);
        setOpen(list.length > 0);
      } catch {
        setItems([]);
        setOpen(false);
      } finally {
        setLoading(false);
      }
    },
    [choose],
  );

  // 딥링크 초기값 (?complexId= / ?apt=)
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    let cid = initialComplexId ?? null;
    let apt = initialApt ?? null;
    if (
      initialComplexId === undefined &&
      initialApt === undefined &&
      typeof window !== "undefined"
    ) {
      const sp = new URLSearchParams(window.location.search);
      cid = sp.get("complexId");
      apt = sp.get("apt");
    }
    if (cid) {
      const id = cid;
      void (async () => {
        const detail = await fetchDetail(id);
        if (detail && (detail.region || detail.name)) {
          const picked = toPicked(
            id,
            detail.name ?? apt ?? "단지",
            detail.region,
            detail.priceLabel,
          );
          if (!clearOnSelect) setSelected(picked);
          setQuery(clearOnSelect ? "" : picked.name);
          onSelectRef.current(picked);
        } else if (apt) {
          setQuery(apt);
          void runSuggest(apt, true);
        }
      })();
    } else if (apt) {
      setQuery(apt);
      void runSuggest(apt, true);
    }
  }, [initialComplexId, initialApt, clearOnSelect, runSuggest]);

  // 입력 디바운스 검색
  useEffect(() => {
    if (!query.trim()) {
      setItems([]);
      setOpen(false);
      return;
    }
    if (selected && query === selected.name) return; // 방금 선택한 값은 재검색 안 함
    const t = setTimeout(() => void runSuggest(query), 250);
    return () => clearTimeout(t);
  }, [query, selected, runSuggest]);

  // 바깥 클릭 시 드롭다운 닫기
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  return (
    <div ref={boxRef} className="relative flex flex-col gap-1.5">
      <span className="text-[11px] font-bold text-text-3">{label}</span>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => {
          if (items.length) setOpen(true);
        }}
        placeholder={placeholder}
        aria-label={label}
        className="w-full rounded-[10px] border border-line bg-surface px-3 py-2 text-xs font-bold text-ink outline-none focus:border-primary"
      />

      {open && items.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-[12px] border border-line bg-surface shadow-[0_14px_36px_rgba(16,28,54,.16)]">
          {items.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => void choose(s)}
              className="flex w-full flex-col items-start gap-0.5 border-b border-[#f0f3f8] px-3 py-2 text-left last:border-b-0 hover:bg-primary-soft"
            >
              <span className="text-xs font-extrabold text-ink">{s.name}</span>
              <span className="text-[10px] text-text-3">{s.region || s.dong}</span>
            </button>
          ))}
        </div>
      )}

      {loading && <span className="text-[10px] text-text-3">검색 중…</span>}

      {showChip && selected && (
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 rounded-[12px] bg-primary-soft px-3 py-2">
          <span className="text-xs font-extrabold text-primary">{selected.name}</span>
          {selected.regionLabel && (
            <span className="text-[10px] font-bold text-text-2">{selected.regionLabel}</span>
          )}
          {selected.priceLabel && (
            <span className="text-[10px] font-bold text-text-2">· 최근 {selected.priceLabel}</span>
          )}
          <span className="ml-auto rounded border border-line px-1 py-px text-[9px] font-bold text-text-3">
            실데이터 기준
          </span>
        </div>
      )}
    </div>
  );
}
