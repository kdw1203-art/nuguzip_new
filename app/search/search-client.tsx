"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Icon } from "@/app/components/Icon";
import { CoverageRequestCard } from "./CoverageRequestCard";
import {
  RECENT_SEARCH_MAX,
  readRecentSearches,
  writeRecentSearches,
} from "@/lib/search/recent-searches";
import { useSettledSearchQuery } from "@/lib/search/settle";
import { complexHrefFromId } from "@/lib/seo/complex-slug";
import { trackPlatformEvent } from "@/lib/platform-events-client";

/* ============================================================
   통합 검색 경험 — 단지·매물·임장노트·뉴스 통합 결과
   /api/search/unified?q= (대기 규칙은 lib/search/settle) · 그룹별 섹션 + 더 보기
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

/** 측정된 인기가 아님 — 전국 주요 권역 추천 검색어 (가짜 KPI 금지) */
const SUGGESTED_REGIONS = ["강남구", "분당", "마포구", "해운대구"] as const;

/* 최근 검색어 읽기/쓰기는 헤더 검색과 공유한다(항목 12) — lib/search/recent-searches */

type SectionKey = keyof UnifiedResults;

/** [937 검색] 결과 제목에서 검색어 일치 구간만 강조 — 왜 이 결과가 나왔는지
 *  한눈에 보이게 한다. 대소문자 무시, 첫 일치 구간만(과한 강조는 소음). */
function highlightMatch(text: string, query: string): ReactNode {
  const q = query.trim();
  if (!q) return text;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-transparent font-extrabold text-primary">
        {text.slice(idx, idx + q.length)}
      </mark>
      {text.slice(idx + q.length)}
    </>
  );
}

function hrefFor(key: SectionKey, id: string): string {
  const enc = encodeURIComponent(id);
  switch (key) {
    case "complexes":
      return complexHrefFromId(id);
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
  const [suggestions, setSuggestions] = useState<UnifiedResults["complexes"]>([]);
  /* 못 불러온 그룹 이름. "결과가 없어요"와 "지금 못 불러왔어요"는 다른 문장이라
     따로 들고 있는다 — 예전엔 조회가 실패해도 빈 결과가 되어 검색어를 의심하게
     만들었다. failed 가 비어 있지 않으면 아래 빈 결과 문구를 쓰지 않는다. */
  const [failed, setFailed] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  /* [937 검색] 빈 화면의 "많이 찾는 단지" — 추측이 아니라 실측(최근 6개월
     실거래 + 조회수, popular_complexes RPC). 실패하면 섹션째 조용히 접는다 —
     부가 정보가 검색 화면을 볼모로 잡지 않는다. */
  const [popular, setPopular] = useState<
    Array<{ id: string; name: string; regionName: string; recentTradeCount: number; avgPriceManwon: number | null }>
  >([]);
  const abortRef = useRef<AbortController | null>(null);
  const { query: settledQuery, compositionProps } = useSettledSearchQuery(q);
  /* 아직 굳지 않은 입력은 "아직 안 물어본 상태"다. 이걸 대기로 안 치면 치는
     도중에 "검색 결과가 없어요"가 떴다 사라진다 — 확인한 적 없는 사실을
     화면에 쓰는 셈이다. */
  const busy = loading || (q.trim() !== "" && q.trim() !== settledQuery);
  const inputRef = useRef<HTMLInputElement>(null);

  /* 마운트: 최근 검색 로드 + URL(?q=) 프리필 */
  useEffect(() => {
    setRecent(readRecentSearches());
    try {
      const initial = new URLSearchParams(window.location.search).get("q")?.trim();
      if (initial) {
        setQ(initial);
      } else {
        /* 제안 모바일7 — 빈 검색으로 새로 들어온 경우는 검색 의도가 명확하다:
           바로 입력할 수 있게 포커스(모바일은 키보드가 올라온다). ?q= 가 있는
           복귀·공유 진입은 결과를 읽는 상황이라 포커스하지 않는다. */
        inputRef.current?.focus();
      }
    } catch {
      // URL 파싱 실패 — 무시
    }
  }, []);

  /* [937 검색] 많이 찾는 단지 로드 — 마운트 1회, 전국 기준 상위 6곳 */
  useEffect(() => {
    const ac = new AbortController();
    fetch("/api/map/popular?limit=6", { signal: ac.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((json: { items?: typeof popular }) => {
        if (!ac.signal.aborted && Array.isArray(json.items)) setPopular(json.items);
      })
      .catch(() => {
        /* 실패 시 섹션 미노출 — 검색 자체와 무관 */
      });
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* 통합 검색 — 대기 규칙은 lib/search/settle 한 군데에서만 정한다.
     한글 조합 중에는 더 길게 기다린다(조합 중간 상태 "ㄹ","래ㅁ" 로는 아무도
     검색하지 않는데, 예전에는 그 상태가 그대로 요청으로 나갔다). */
  useEffect(() => {
    const query = settledQuery;
    if (!query) {
      setResults(EMPTY);
      setSuggestions([]);
      setFailed([]);
      setLoading(false);
      abortRef.current?.abort();
      return;
    }
    setLoading(true);
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    void (async () => {
      try {
        const res = await fetch(`/api/search/unified?q=${encodeURIComponent(query)}`, {
          signal: ac.signal,
        });
        if (!res.ok) throw new Error("unified failed");
        const json = (await res.json()) as Partial<UnifiedResults> & {
          suggestions?: UnifiedResults["complexes"];
          failed?: string[];
        };
        setResults({
          complexes: json.complexes ?? [],
          listings: json.listings ?? [],
          notes: json.notes ?? [],
          news: json.news ?? [],
        });
        setSuggestions(Array.isArray(json.suggestions) ? json.suggestions : []);
        setFailed(Array.isArray(json.failed) ? json.failed : []);
        /* [937 검색] 무결과 실측 — 커버리지 카드는 버튼을 눌러야 남지만,
           "찾았는데 없었다"는 사실 자체가 확장 우선순위 데이터다. */
        const n =
          (json.complexes?.length ?? 0) +
          (json.listings?.length ?? 0) +
          (json.notes?.length ?? 0) +
          (json.news?.length ?? 0);
        if (n === 0 && (!json.failed || json.failed.length === 0)) {
          trackPlatformEvent({
            eventName: "search_no_result",
            source: "client",
            campaign: "funnel",
            metadata: { query: query.slice(0, 80) },
          });
        }
      } catch {
        if (!ac.signal.aborted) {
          setResults(EMPTY);
          setSuggestions([]);
          /* 503(전 그룹 실패)·네트워크 오류 — 결과가 없는 게 아니라 못 물어본 것이다. */
          setFailed(["단지", "매물", "임장노트", "뉴스"]);
        }
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    })();
    /* 검색어가 바뀌면 직전 요청을 취소한다 — 늦게 온 옛 응답이 새 결과를
       덮으면 화면이 사용자가 치지 않은 말에 답하게 된다. */
    return () => ac.abort();
  }, [settledQuery]);

  const saveRecent = useCallback((keyword: string) => {
    const k = keyword.trim();
    if (!k) return;
    setRecent((prev) => {
      const next = [k, ...prev.filter((v) => v !== k)].slice(0, RECENT_SEARCH_MAX);
      writeRecentSearches(next);
      return next;
    });
  }, []);

  const removeRecent = useCallback((keyword: string) => {
    setRecent((prev) => {
      const next = prev.filter((v) => v !== keyword);
      writeRecentSearches(next);
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
          ref={inputRef}
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          {...compositionProps}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              runSearch(q);
            }
          }}
          placeholder="단지·매물·임장노트·뉴스 통합 검색"
          aria-label="통합 검색"
          autoComplete="off"
          // 16px 미만 입력은 iOS 가 포커스 시 화면을 강제 줌한다(모바일 실측 7).
          // 모바일 16px, md+ 는 기존 15px 유지.
          className="w-full bg-transparent t-body text-ink outline-none placeholder:text-text-3 md:t-body"
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
          className="btn-soft rise-in inline-flex w-fit items-center gap-1.5 rounded-xl px-3.5 py-2 t-body font-bold text-primary"
        >
          <Icon name="🗺" size={16} /> ‘{q.trim()}’ 지도에서 보기 ›
        </Link>
      )}

      {/* 검색어 없음 — 최근·인기 검색 */}
      {!hasQuery && (
        <div className="rise-in mt-2 flex flex-col gap-5">
          {recent.length > 0 && (
            <div>
              <div className="mb-2 flex items-center justify-between px-1">
                <span className="text-xs font-extrabold text-text-3">최근 검색</span>
                <button
                  type="button"
                  onClick={() => {
                    setRecent([]);
                    writeRecentSearches([]);
                  }}
                  className="t-caption text-text-3 underline underline-offset-2"
                >
                  전체 삭제
                </button>
              </div>
              <div className="flex flex-wrap gap-[6px]">
                {recent.map((k) => (
                  <span
                    key={k}
                    className="chip flex items-center gap-1.5 border border-line bg-bg px-3 py-1.5 t-sub text-text-2"
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
            <div className="mb-2 px-1 text-xs font-extrabold text-text-3">
              추천 지역{" "}
              <span className="font-medium text-text-3">(인기 순위 아님)</span>
            </div>
            <div className="flex flex-wrap gap-[6px]">
              {SUGGESTED_REGIONS.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => runSearch(k)}
                  className="chip bg-bg px-3 py-1.5 t-sub text-text-2"
                >
                  {k}
                </button>
              ))}
            </div>
          </div>
          {/* [937 검색] 많이 찾는 단지 — 실측 순위(최근 6개월 실거래 + 조회수).
              추천 지역과 달리 이건 진짜 측정값이라 근거를 그대로 적는다. */}
          {popular.length > 0 && (
            <div>
              <div className="mb-2 px-1 t-caption font-extrabold text-text-3">
                많이 찾는 단지{" "}
                <span className="font-medium">(최근 6개월 실거래·조회 기준)</span>
              </div>
              <div className="flex flex-col gap-1.5">
                {popular.map((c) => (
                  <Link
                    key={c.id}
                    href={complexHrefFromId(c.id)}
                    onClick={() =>
                      trackPlatformEvent({
                        eventName: "search_popular_click",
                        source: "client",
                        campaign: "funnel",
                        metadata: { complexId: c.id },
                      })
                    }
                    className="card tile flex items-center justify-between gap-3 rounded-2xl px-4 py-2.5 no-underline"
                  >
                    <div className="min-w-0">
                      <div className="truncate t-body font-bold text-ink">{c.name}</div>
                      <div className="truncate t-caption text-text-3">
                        {c.regionName}
                        {c.recentTradeCount > 0 ? ` · 6개월 거래 ${c.recentTradeCount}건` : ""}
                      </div>
                    </div>
                    {c.avgPriceManwon != null && c.avgPriceManwon > 0 && (
                      <span className="shrink-0 t-sub font-bold text-text-2">
                        {c.avgPriceManwon >= 10_000
                          ? `${(c.avgPriceManwon / 10_000).toFixed(1).replace(/\.0$/, "")}억`
                          : `${c.avgPriceManwon.toLocaleString("ko-KR")}만`}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 로딩 */}
      {hasQuery && busy && total === 0 && (
        <div className="mt-6 text-center text-sm text-text-3">검색 중…</div>
      )}

      {/* 조회 실패 — "없음"이 아니라 "못 불러왔음"으로 적는다 */}
      {hasQuery && !busy && failed.length > 0 && (
        <div className="mt-8 flex flex-col items-center gap-2 text-center">
          <div className="t-section text-ink">
            지금은 {failed.join("·")} 검색이 되지 않아요
          </div>
          <div className="t-sub text-text-3">
            결과가 없는 게 아니라 조회에 실패한 거예요. 잠시 후 다시 시도해 주세요.
          </div>
        </div>
      )}

      {/* 빈 결과 + A8 대안 단지 제안 */}
      {hasQuery && !busy && failed.length === 0 && total === 0 && (
        <div className="mt-8 flex flex-col items-center gap-2 text-center">
          <div className="t-section text-ink">
            ‘{q.trim()}’ 검색 결과가 없어요
          </div>
          <div className="t-sub text-text-3">
            단지명·지역·매물·임장노트·뉴스를 검색할 수 있어요.
          </div>

          {/* 항목 13 — 막다른 화면 금지: 결과가 없어도 다음 행동은 있어야 한다.
              지도는 텍스트 매칭이 아니라 위치 탐색이라 같은 검색어로도 찾아질 수
              있고, 둘러보기·실거래 허브는 검색어 없이 시작하는 대안 경로다. */}
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            <Link
              href={`/map?q=${encodeURIComponent(q.trim())}`}
              onClick={() => saveRecent(q)}
              className="chip border border-line bg-bg px-3.5 py-2 t-sub font-bold text-primary"
            >
              🗺 지도에서 찾아보기
            </Link>
            <Link
              href="/complex/browse"
              className="chip border border-line bg-bg px-3.5 py-2 t-sub font-bold text-text-2"
            >
              단지 둘러보기
            </Link>
            <Link
              href="/tx"
              className="chip border border-line bg-bg px-3.5 py-2 t-sub font-bold text-text-2"
            >
              실거래가 허브
            </Link>
          </div>

          {suggestions.length > 0 && (
            <div className="mt-5 w-full max-w-[520px] text-left">
              <div className="mb-2 px-1 t-body font-extrabold text-ink">
                혹시 이 단지를 찾으셨나요?
              </div>
              <div className="flex flex-col gap-2">
                {suggestions.map((c) => (
                  <Link
                    key={c.id}
                    href={complexHrefFromId(c.id)}
                    className="card tile flex items-center justify-between gap-3 rounded-2xl px-4 py-3 no-underline"
                  >
                    <div className="min-w-0">
                      <div className="truncate t-section text-ink">
                        {c.name}
                      </div>
                      {c.region && (
                        <div className="truncate t-sub text-text-3">{c.region}</div>
                      )}
                    </div>
                    <span className="shrink-0 t-body text-[#c3cad6]">›</span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* #413 — 커버리지 수요 수집: 무결과를 그냥 보내지 않고 확장 우선순위
              데이터로 바꾼다. 유사 단지 제안이 있어도 함께 보여준다(제안이
              틀렸을 수 있고, 지역 검색은 제안 자체가 안 뜬다). */}
          <CoverageRequestCard query={q.trim()} />
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
                  <div className="t-body font-extrabold text-ink">
                    {g.label} <span className="text-text-3">{g.rows.length}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {g.key === "complexes" && (
                      <Link
                        href={`/map?q=${encodeURIComponent(q.trim())}`}
                        onClick={() => saveRecent(q)}
                        className="t-sub font-bold text-primary"
                      >
                        지도 ›
                      </Link>
                    )}
                    <Link href={g.more} className="t-sub font-bold text-primary">
                      더 보기 ›
                    </Link>
                  </div>
                </header>
                <div className="flex flex-col">
                  {g.rows.map((r, i) => (
                    <Link
                      key={r.id}
                      href={hrefFor(g.key, r.id)}
                      onClick={() => {
                        saveRecent(q);
                        /* [937 검색] 그룹별 클릭 실측 — 어떤 결과 묶음이 실제로
                           쓰이는지 없이는 검색 개선의 다음 순서를 정할 수 없다. */
                        trackPlatformEvent({
                          eventName: "search_result_click",
                          source: "client",
                          campaign: "funnel",
                          metadata: { group: g.key, query: q.trim().slice(0, 80) },
                        });
                      }}
                      className={`flex items-center justify-between gap-3 py-2.5 transition-colors hover:text-primary ${
                        i < g.rows.length - 1 ? "border-b border-divider" : ""
                      }`}
                    >
                      <span className="min-w-0 truncate t-body font-bold text-ink">
                        {highlightMatch(r.title, settledQuery)}
                      </span>
                      {r.meta && (
                        <span className="shrink-0 t-sub text-text-3">{r.meta}</span>
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
