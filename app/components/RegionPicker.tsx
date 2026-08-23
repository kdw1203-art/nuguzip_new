"use client";

/**
 * 관심 지역 선택기 — 검색 + 인기 지역 칩.
 *
 * ── 왜 만들었나 ─────────────────────────────────────────────────────────────
 * 가입(/signup)과 온보딩(/welcome)이 각자 코드에 지역 목록을 박아 두고 있었다.
 *
 *   · /signup  : `["안양 관양동", "서울 마포구", "과천시"]` — 3개가 전부.
 *                옆의 "⌕ 검색"은 onClick 이 없는 <span> 이라 눌러도 무반응.
 *   · /welcome : 서울·경기·인천 17개 고정. 그 밖에 사는 사람은 선택 불가.
 *
 * 즉 부산·대구·광주에 사는 사용자는 관심 지역을 고를 방법이 아예 없었다.
 * 이제 시군구 265개(legal_regions) 전체를 /api/regions/search 로 검색한다.
 *
 * ── 값의 형식 ───────────────────────────────────────────────────────────────
 * 돌려주는 문자열은 "서울 마포구"·"성남 분당구"·"과천시" 형식(display_name)이다.
 * 기존 소비처(/api/me/alerts 의 value, /notes/new?region=, 홈 개인화 매칭)가
 * 쓰던 표기와 같아서 저장 형식을 바꾸지 않는다.
 *
 * ── 못 하는 것 ──────────────────────────────────────────────────────────────
 * 단위는 시군구다. "송도"·"동탄" 같은 생활권 이름은 시군구 표에 없어서 검색되지
 * 않는다("인천 연수구"·"화성시"로는 찾힌다). 예전 하드코딩 목록에 있던
 * "인천 연수구 송도"·"화성 동탄"·"고양 일산"이 그런 값이었는데, 그 문자열들은
 * 어느 표에도 대응이 없어 알림 구독에 넣어도 매칭되는 지역이 없었다.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSettledSearchQuery } from "@/lib/search/settle";

export interface RegionSuggestItem {
  code: string;
  name: string;
  sido: string;
  sigungu: string;
  lat: number | null;
  lng: number | null;
}

type Props = {
  /** 선택된 지역명 목록 (display_name 문자열) */
  value: string[];
  onChange: (next: string[]) => void;
  /** 선택 가능 개수 상한 */
  max?: number;
  /** 검색 전에 칩으로 깔아 둘 인기 지역 수 */
  popularCount?: number;
  /** 첫 선택 시 1회 호출 — 퍼널 계측용 */
  onFirstPick?: () => void;
  inputId?: string;
};


export function RegionPicker({
  value,
  onChange,
  max = 3,
  popularCount = 12,
  onFirstPick,
  inputId = "region-search",
}: Props) {
  const [query, setQuery] = useState("");
  /* 대기 규칙은 lib/search/settle 한 군데에서만 정한다. 예전에는 이 파일이
     180ms 를 혼자 적어 뒀고, 왜 다른지는 아무 데도 없었다. */
  const { query: settledQuery, compositionProps } = useSettledSearchQuery(query);
  const [popular, setPopular] = useState<RegionSuggestItem[]>([]);
  const [results, setResults] = useState<RegionSuggestItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  /* 조회에 실패했는데 "검색 결과가 없습니다"라고 쓰면 거짓말이 된다.
     없다는 걸 확인한 적이 없고, 못 읽었을 뿐이다. 둘을 구분해서 보여 준다. */
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(-1);

  const boxRef = useRef<HTMLDivElement | null>(null);
  const pickedOnce = useRef(false);

  const full = value.length >= max;

  /* 인기 지역(빈 질의) — 화면 진입 시 1회. 실패하면 칩 줄이 비지만
     검색 입력은 그대로 동작한다. */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/regions/search?limit=${popularCount}`, {
          cache: "force-cache",
        });
        if (!res.ok) return;
        const json = (await res.json()) as { items?: RegionSuggestItem[] };
        if (!cancelled) setPopular(json.items ?? []);
      } catch {
        /* 인기 목록이 없어도 검색으로 고를 수 있다 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [popularCount]);

  /* 검색 — 입력이 멎고 나서 부른다. 이전 요청은 취소한다(늦게 온 옛 응답이
     새 응답을 덮어써 엉뚱한 목록이 뜨던 흔한 버그 방지). */
  useEffect(() => {
    const q = settledQuery;
    if (!q) {
      setResults(null);
      setLoading(false);
      setFailed(false);
      return;
    }
    const ac = new AbortController();
    setLoading(true);
    void (async () => {
      try {
        const res = await fetch(`/api/regions/search?q=${encodeURIComponent(q)}&limit=12`, {
          signal: ac.signal,
        });
        if (!res.ok) {
          setFailed(true);
          setResults([]);
          return;
        }
        const json = (await res.json()) as { items?: RegionSuggestItem[] };
        setFailed(false);
        setResults(json.items ?? []);
        setCursor(-1);
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setFailed(true);
        setResults([]);
      } finally {
        setLoading(false);
      }
    })();
    return () => ac.abort();
  }, [settledQuery]);

  // 바깥 클릭 시 드롭다운 닫기
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const toggle = useCallback(
    (name: string) => {
      if (!pickedOnce.current) {
        pickedOnce.current = true;
        onFirstPick?.();
      }
      if (value.includes(name)) {
        onChange(value.filter((v) => v !== name));
        return;
      }
      if (value.length >= max) return; // 상한 초과분은 조용히 무시(라벨에 상한 표기)
      onChange([...value, name]);
    },
    [value, onChange, max, onFirstPick],
  );

  /* 인기 칩에는 이미 고른 지역도 항상 보여 준다 — 목록에서 사라지면
     체크를 풀 방법이 없어진다. 선택 항목을 앞으로 끌어올린다. */
  const chips = useMemo(() => {
    const names = popular.map((p) => p.name);
    const extras = value.filter((v) => !names.includes(v));
    return [...extras, ...names];
  }, [popular, value]);

  const list = results ?? [];
  /* 아직 굳지 않은 입력은 "아직 안 물어본 상태"다. 이걸 대기로 안 치면 치는
     도중에 "일치하는 시·군·구가 없어요"가 떴다 사라진다 — 확인한 적 없는
     사실을 화면에 쓰는 셈이다. */
  const pending = query.trim() !== "" && query.trim() !== settledQuery;
  const busy = loading || pending;

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || list.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => (c + 1) % list.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => (c <= 0 ? list.length - 1 : c - 1));
    } else if (e.key === "Enter") {
      const pick = list[cursor] ?? list[0];
      if (pick) {
        e.preventDefault();
        toggle(pick.name);
        setQuery("");
        setOpen(false);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {/* 검색 입력 — 예전에는 여기가 아무 동작 없는 "⌕ 검색" 라벨이었다 */}
      <div ref={boxRef} className="relative">
        <input
          id={inputId}
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          {...compositionProps}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="지역 검색 (예: 마포, 분당, 해운대)"
          autoComplete="off"
          role="combobox"
          aria-expanded={open && list.length > 0}
          aria-controls={`${inputId}-listbox`}
          aria-autocomplete="list"
          className="w-full rounded-[12px] border border-line bg-surface px-4 py-2.5 text-sm text-ink outline-none focus:border-primary"
        />
        {open && query.trim() !== "" && (
          <div
            id={`${inputId}-listbox`}
            role="listbox"
            className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 max-h-[260px] overflow-y-auto rounded-[12px] border border-line bg-surface shadow-lg"
          >
            {busy && list.length === 0 && (
              <div className="px-4 py-3 text-xs text-text-3">찾는 중…</div>
            )}
            {!busy && failed && (
              <div className="px-4 py-3 text-xs text-text-3">
                지역을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.
              </div>
            )}
            {!busy && !failed && list.length === 0 && (
              <div className="px-4 py-3 text-xs text-text-3">
                일치하는 시·군·구가 없어요. 구 이름으로 찾아보세요.
              </div>
            )}
            {list.map((it, i) => {
              const active = value.includes(it.name);
              return (
                <button
                  key={it.code}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => {
                    toggle(it.name);
                    setQuery("");
                    setOpen(false);
                  }}
                  disabled={!active && full}
                  className={`flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm disabled:opacity-40 ${
                    i === cursor ? "bg-primary-soft" : "bg-transparent"
                  }`}
                >
                  <span className={`flex-1 ${active ? "font-bold text-primary" : "text-ink"}`}>
                    {active ? "✓ " : ""}
                    {it.name}
                  </span>
                  <span className="text-[11px] text-text-3">{it.sido}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 인기 지역 칩 — 검색어를 치지 않아도 바로 고를 수 있는 지름길 */}
      <div className="flex flex-wrap gap-1.5">
        {chips.map((name) => {
          const active = value.includes(name);
          return (
            <button
              key={name}
              type="button"
              onClick={() => toggle(name)}
              aria-pressed={active}
              disabled={!active && full}
              className={`rounded-full px-[13px] py-[7px] text-xs transition disabled:opacity-40 ${
                active
                  ? "bg-primary-soft font-bold text-primary"
                  : "border border-line bg-surface text-text-2"
              }`}
            >
              {active ? "✓ " : ""}
              {name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
