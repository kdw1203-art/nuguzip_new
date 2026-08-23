"use client";

import { useState } from "react";
import { EmptyState, ErrorState } from "@/app/components/ui/EmptyState";
import { APPLYHOME_REGIONS } from "@/lib/applyhome/regions";
import type {
  ApplyhomeListingItem,
  ApplyhomeSearchPayload,
  ApplyhomeSearchTab,
} from "@/lib/applyhome/types";

/**
 * 청약홈 실데이터 검색 — 이미 완성돼 있던 /api/applyhome/search 를 화면에 배선.
 * 경쟁률/특별공급 탭 + 지역·단지명 필터 + 더보기(페이지네이션).
 * 서버에서 만든 초기 페이로드(initial)로 첫 화면을 그리고, 이후 상호작용은
 * 클라이언트에서 API 를 호출한다. 실패·미설정 시에도 지어내지 않고 상태를 말한다.
 *
 * 2026-07-27 고도화(#225) — /supply·/auctions 와 같은 수준으로 올린다.
 *   - 지역 필터를 <select> → 칩 줄로 (한 번에 어떤 지역이 있는지 보인다)
 *   - 요약 타일 추가. 단, **세는 대상을 라벨에 그대로 쓴다** — "총 공고"는 서버가 준
 *     totalCount, "표시 중"은 지금 화면에 그려진 행 수다. 평균 경쟁률처럼 일부 페이지만
 *     보고 계산하면 틀리는 값은 만들지 않는다.
 *   - 손으로 만든 에러/빈 카드 → 공용 ErrorState/EmptyState. 세 상태(키 미설정 mock /
 *     조회 실패 / 진짜 0건)를 절대 한 문장으로 합치지 않는다.
 */

const PER_PAGE = 15;

/** 서버(page.tsx)에서 넘어오는 초기 조회 결과 — 성공/실패를 구분해 받는다. */
export type ApplyInitialResult =
  | { ok: true; payload: ApplyhomeSearchPayload }
  | { ok: false; cause: string };

type Props = { initial: ApplyInitialResult };

type ViewState = {
  tab: ApplyhomeSearchTab;
  region: string;
  q: string;
  page: number;
  items: ApplyhomeListingItem[];
  totalCount: number;
  mode: "live" | "mock" | "error";
  /** 분양정보(상세) API 사용 가능 여부 — false면 지역·검색 필터 자체가 불가하다 */
  detailAvailable: boolean;
  detailNotice?: string;
  fetchedAt?: string;
};

/** 조회 실패 — 원인 원문을 같이 들고 다닌다(화면에 그대로 노출한다). */
type ErrState = { message: string; cause?: string } | null;

function fromPayload(p: ApplyhomeSearchPayload, prevItems?: ApplyhomeListingItem[]): ViewState {
  /* 모양이 어긋난 200 응답(items 누락 등)에도 TypeError 로 터지지 않게 방어 —
     이전에는 `[... p.items]` 가 undefined 전개로 죽을 수 있었다. */
  const incoming = Array.isArray(p.items) ? p.items : [];
  const merged = prevItems ? [...prevItems, ...incoming] : incoming;
  // 페이지 경계 중복 방어 — id 기준 dedupe
  const seen = new Set<string>();
  const items = merged.filter((it) => {
    if (seen.has(it.id)) return false;
    seen.add(it.id);
    return true;
  });
  return {
    tab: p.tab,
    region: p.filters?.region ?? "전체",
    q: p.filters?.q ?? "",
    page: 1,
    items,
    totalCount: typeof p.totalCount === "number" ? p.totalCount : items.length,
    mode: p.mode,
    detailAvailable: Boolean(p.detailAvailable),
    detailNotice: p.detailNotice,
    fetchedAt: p.fetchedAt,
  };
}

const EMPTY_STATE: ViewState = {
  tab: "competition",
  region: "전체",
  q: "",
  page: 1,
  items: [],
  totalCount: 0,
  mode: "error",
  detailAvailable: false,
};

/** "2026-07-27T09:12:33Z" → "07-27 09:12". 파싱 실패 시 앞부분만 그대로 보여준다. */
function fetchedLabel(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(iso);
  if (!m) return iso.slice(0, 16);
  return `${m[2]}-${m[3]} ${m[4]}:${m[5]}`;
}

type SortKey = "default" | "rate" | "supply";

/** 경쟁률 문자열("152.3:1" | "152.3" | "△" | "-")에서 숫자만. 없으면 null(미달·미공개). */
function parseRate(raw?: string): number | null {
  if (!raw) return null;
  const m = /(\d+(?:\.\d+)?)/.exec(raw);
  return m ? Number(m[1]) : null;
}

/** 표시 중인 행만 정렬한다(전체가 아니라 '화면에 그려진 것' 기준 — 라벨로 명시). */
function sortItems(items: ApplyhomeListingItem[], key: SortKey): ApplyhomeListingItem[] {
  if (key === "default") return items;
  const arr = [...items];
  if (key === "rate") {
    arr.sort((a, b) => (parseRate(b.competitionRate) ?? -1) - (parseRate(a.competitionRate) ?? -1));
  } else {
    arr.sort((a, b) => (b.supplyCount ?? 0) - (a.supplyCount ?? 0));
  }
  return arr;
}

/** 특공 유형별 경쟁률 라벨 — 접수/공급. 공급 0이면 "—", 미달이면 "미달". */
function typeRateLabel(supply: number, requests: number): string {
  if (!supply || supply <= 0) return "—";
  if (requests <= 0) return "0";
  const r = requests / supply;
  return requests < supply ? "미달" : `${r.toFixed(1)}:1`;
}

/** "YYYYMMDD" | "YYYY-MM-DD" → "YYYY.MM.DD". 형식이 다르면 원문. */
function ymd(raw?: string): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[^0-9]/g, "");
  if (digits.length >= 8) return `${digits.slice(0, 4)}.${digits.slice(4, 6)}.${digits.slice(6, 8)}`;
  return raw;
}

/** 접수 기간("2026-08-19 ~ 2026-08-21")으로 지금 상태를 계산 — 데이터에 이미 있는
    날짜만 쓴다(추정 없음). 과거 공고가 대부분이라 '마감' 칩은 소음 — 진행·예정만
    칩으로 강조하고, 파싱 실패·과거는 null 로 아무것도 그리지 않는다. */
function applyStatus(period?: string): { label: string; cls: string } | null {
  if (!period) return null;
  const dates = period.match(/\d{4}[-.]?\d{2}[-.]?\d{2}/g);
  if (!dates || dates.length === 0) return null;
  const toMs = (s: string) => {
    const d = s.replace(/[^0-9]/g, "");
    return Date.parse(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T00:00:00+09:00`);
  };
  const start = toMs(dates[0]);
  const endDay = toMs(dates[dates.length - 1]);
  if (!Number.isFinite(start) || !Number.isFinite(endDay)) return null;
  const end = endDay + 24 * 60 * 60 * 1000 - 1; // 마감일 그날 자정(KST)까지 접수 중
  const now = Date.now();
  if (now < start) return { label: "접수 예정", cls: "bg-primary-soft text-primary" };
  if (now <= end) return { label: "접수 중", cls: "bg-success-soft text-success" };
  return null;
}

function StatusChip({ period }: { period?: string }) {
  const st = applyStatus(period);
  if (!st) return null;
  return (
    <span
      className={`ml-1.5 inline-block rounded-md px-1.5 py-0.5 align-middle text-[9.5px] font-extrabold ${st.cls}`}
    >
      {st.label}
    </span>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-semibold text-text-3">{label}</span>
      <span className="font-bold text-ink">{value}</span>
    </div>
  );
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card flex min-w-0 flex-col gap-0.5 rounded-2xl px-3.5 py-3">
      <span className="text-[10.5px] font-bold text-text-3">{label}</span>
      <span className="truncate text-[17px] font-extrabold text-ink">{value}</span>
      {hint && <span className="truncate text-[10.5px] text-text-3">{hint}</span>}
    </div>
  );
}

export function ApplySearchClient({ initial }: Props) {
  const [state, setState] = useState<ViewState>(
    initial.ok ? fromPayload(initial.payload) : EMPTY_STATE,
  );
  const [qInput, setQInput] = useState(initial.ok ? initial.payload.filters.q : "");
  const [loading, setLoading] = useState(false);
  const [appending, setAppending] = useState(false);
  const [error, setError] = useState<ErrState>(
    initial.ok
      ? null
      : { message: "청약홈 데이터를 지금 불러오지 못했어요.", cause: initial.cause },
  );
  /* 정렬은 '표시 중인 행'만 다시 세운다(서버 전체가 아니라). 확장 행은 청약 일정·
     시행사·원문(경쟁률 탭) 또는 8개 특공 유형별 물량·접수(특별공급 탭)를 편다 —
     이미 받아 놓고 표에서 버리던 데이터를 여는 것뿐이라 지어낸 값이 아니다. */
  const [sortKey, setSortKey] = useState<SortKey>("default");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  async function load(opts: {
    tab?: ApplyhomeSearchTab;
    region?: string;
    q?: string;
    page?: number;
    append?: boolean;
  }): Promise<void> {
    const tab = opts.tab ?? state.tab;
    const region = opts.region ?? state.region;
    const q = opts.q ?? state.q;
    const page = opts.page ?? 1;
    const append = Boolean(opts.append);
    if (append) setAppending(true);
    else setLoading(true);
    setError(null);
    if (!append) setExpanded(new Set()); // 새 결과엔 이전 확장 상태를 남기지 않는다
    try {
      const params = new URLSearchParams({
        tab,
        region,
        q,
        page: String(page),
        perPage: String(PER_PAGE),
      });
      const res = await fetch(`/api/applyhome/search?${params.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`청약홈 조회 응답 ${res.status}`);
      const data = (await res.json()) as ApplyhomeSearchPayload;
      setState((prev) => ({
        ...fromPayload(data, append ? prev.items : undefined),
        page,
      }));
    } catch (err) {
      setError({
        message: "청약홈 데이터를 지금 불러오지 못했어요.",
        cause: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setLoading(false);
      setAppending(false);
    }
  }

  /* 페이지 단위가 경로마다 다르다(2026-08-22 수리):
       필터 없음 → 행(row) 페이지네이션: 행 수 vs 행 총계 비교가 맞다.
       필터 있음 → 공고(detail) 페이지네이션: 한 공고가 타입·순위별 여러 행을
         만들므로 행 수와 공고 총계를 비교하면 안 된다(45행 > 공고 20건이라
         더 있는데도 버튼이 사라지는 식). 소비한 공고 수(page×PER_PAGE)로 센다. */
  const filteredMode = state.region !== "전체" || state.q.trim().length > 0;
  const canLoadMore =
    !error &&
    state.mode === "live" &&
    state.items.length > 0 &&
    (filteredMode
      ? state.page * PER_PAGE < state.totalCount
      : state.items.length < state.totalCount);

  const tabPill = (on: boolean) =>
    on
      ? "press rounded-full bg-primary px-4 py-2 text-[13px] font-bold text-white"
      : "press glass rounded-full px-4 py-2 text-[13px] font-semibold text-text-2";

  const regionPill = (on: boolean) =>
    on
      ? "press chip-active shrink-0 rounded-full px-3 py-1.5 text-[12px] font-bold"
      : "press chip shrink-0 rounded-full px-3 py-1.5 text-[12px] font-semibold";

  const tabLabel = state.tab === "competition" ? "청약 경쟁률" : "특별공급 접수현황";
  const showTiles = !error && state.mode === "live" && state.items.length > 0;
  const displayItems = sortItems(state.items, sortKey);
  const hasResults = !error && !loading && state.items.length > 0;

  const sortPill = (on: boolean) =>
    on
      ? "press rounded-full bg-ink px-3 py-1.5 text-[11px] font-bold text-surface"
      : "press glass rounded-full px-3 py-1.5 text-[11px] font-semibold text-text-2";

  return (
    <div className="flex flex-col gap-3">
      {/* 탭 + 검색 행 */}
      <div className="rise-in-1 flex flex-wrap items-center gap-2">
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => void load({ tab: "competition", page: 1 })}
            aria-pressed={state.tab === "competition"}
            className={tabPill(state.tab === "competition")}
            style={state.tab === "competition" ? { color: "#fff" } : undefined}
          >
            경쟁률
          </button>
          <button
            type="button"
            onClick={() => void load({ tab: "special", page: 1 })}
            aria-pressed={state.tab === "special"}
            className={tabPill(state.tab === "special")}
            style={state.tab === "special" ? { color: "#fff" } : undefined}
          >
            특별공급
          </button>
        </div>
        <form
          className="flex flex-1 flex-wrap items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            void load({ q: qInput.trim(), page: 1 });
          }}
        >
          <input
            type="search"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            maxLength={80}
            placeholder="단지명·주소 검색"
            aria-label="단지명·주소 검색"
            className="min-w-[160px] flex-1 rounded-xl border border-line bg-surface px-3.5 py-2 text-[13px] text-ink placeholder:text-text-3"
          />
          <button
            type="submit"
            disabled={loading}
            className="btn-primary press rounded-xl px-4 py-2 text-[13px] disabled:opacity-60"
          >
            검색
          </button>
        </form>
      </div>

      {/* 지역 칩 — <select> 였다. 어떤 지역이 있는지 한눈에 보이고 한 번에 눌린다. */}
      <div
        role="group"
        aria-label="지역 필터"
        className="rise-in-1 -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1"
      >
        {APPLYHOME_REGIONS.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => void load({ region: r, page: 1 })}
            aria-pressed={state.region === r}
            className={regionPill(state.region === r)}
          >
            {r}
          </button>
        ))}
      </div>

      {/* 요약 타일 — 라벨이 곧 세는 대상이다(추정치 아님). */}
      {showTiles && (
        <div className="rise-in-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Tile
            label={`${tabLabel} 총 공고`}
            value={`${state.totalCount.toLocaleString()}건`}
            hint={state.region === "전체" ? "전국" : state.region}
          />
          <Tile
            label="지금 화면에 표시 중"
            value={`${state.items.length.toLocaleString()}건`}
            hint={canLoadMore ? "더보기로 이어서" : "전부 표시됨"}
          />
          <Tile
            label="조회 시각"
            value={state.fetchedAt ? fetchedLabel(state.fetchedAt) : "—"}
            hint="청약홈 공공데이터"
          />
        </div>
      )}

      {/* 상세 API 미승인 등 데이터 한계 안내 — 서버가 준 사실 그대로 */}
      {state.detailNotice && (
        <p className="rise-in-2 rounded-xl bg-primary-soft px-4 py-2.5 text-[11px] leading-[1.6] text-primary">
          {state.detailNotice}
        </p>
      )}

      {/* 결과 — 실패 / 미설정 / 0건 / 목록을 절대 섞지 않는다 */}
      {error ? (
        <div role="alert" className="rise-in-2">
          <ErrorState
            title={error.message}
            desc="공고가 없는 게 아니라 조회 자체가 실패했습니다. 잠시 후 다시 시도해 주세요."
            cause={error.cause}
            onRetry={() => void load({ page: 1 })}
          />
        </div>
      ) : loading ? (
        <div className="rise-in-2 card rounded-2xl px-4 py-12 text-center text-[13px] text-text-3">
          청약홈 데이터를 불러오는 중…
        </div>
      ) : state.items.length === 0 ? (
        <div className="rise-in-2">
          {state.mode === "mock" ? (
            <EmptyState
              icon="lock"
              title="청약홈 공공데이터 연동이 아직 설정되지 않았어요"
              desc="DATA_GO_KR_SERVICE_KEY 가 없어 실데이터를 부를 수 없습니다. 지어낸 수치로 표를 채우지는 않아요."
              action={{ href: "https://www.applyhome.co.kr", label: "청약홈에서 직접 보기 ↗" }}
            />
          ) : filteredMode && !state.detailAvailable ? (
            /* 0건이 아니라 **필터 기능 자체가 지금 불가**한 상태 — 상세(분양정보)
               API 미승인이면 지역·검색 필터를 걸 수 없다. "조건에 맞는 공고가
               없어요"라고 말하면 있는 공고를 없다고 말하는 셈이라 구분한다. */
            <EmptyState
              icon="lock"
              title="지역·단지명 필터를 지금 사용할 수 없어요"
              desc="분양정보(상세) API 연동이 준비되지 않아 필터 검색이 불가합니다. 공고가 없다는 뜻이 아니에요 — ‘전체’로 돌아가면 전국 공고를 볼 수 있어요."
              action={{ href: "/apply", label: "전체 공고 보기" }}
            />
          ) : (
            <EmptyState
              icon="search"
              title="이 조건에 맞는 공고가 없어요"
              desc={`${state.region === "전체" ? "전국" : state.region}${
                state.q ? ` · ‘${state.q}’` : ""
              } 조건으로는 조회 결과가 0건이었어요. 지역이나 검색어를 바꿔 보세요.`}
              action={{ href: "/apply", label: "전체 공고 다시 보기" }}
            />
          )}
        </div>
      ) : (
        <>
          {/* 정렬 — 표시 중인 행만 다시 세운다(전체 아님). 라벨로 그 사실을 밝힌다. */}
          {hasResults && (
            <div className="rise-in-2 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-bold text-text-3">정렬</span>
              <button type="button" onClick={() => setSortKey("default")} className={sortPill(sortKey === "default")}>
                기본
              </button>
              <button type="button" onClick={() => setSortKey("rate")} className={sortPill(sortKey === "rate")}>
                경쟁률 높은 순
              </button>
              <button type="button" onClick={() => setSortKey("supply")} className={sortPill(sortKey === "supply")}>
                공급 많은 순
              </button>
              {sortKey !== "default" && (
                <span className="text-[10px] text-text-3">표시 중 {state.items.length}건 기준</span>
              )}
            </div>
          )}

          <div className="rise-in-2 card overflow-x-auto rounded-2xl px-[18px] py-1">
            <div className="min-w-[540px]">
              {state.tab === "competition" ? (
                <>
                  <div className="grid grid-cols-[1.6fr_.9fr_.8fr_.9fr_1fr] gap-2 border-b border-divider py-2 text-[10px] text-text-3">
                    <span>단지 · 지역</span>
                    <span className="text-center">타입</span>
                    <span className="text-center">공급</span>
                    <span className="text-center">접수</span>
                    <span className="text-center">경쟁률</span>
                  </div>
                  {displayItems.map((item, i, arr) => {
                    const open = expanded.has(item.id);
                    const hasDetail = Boolean(
                      item.rankCode ||
                        item.subscriptionPeriod ||
                        item.announceDate ||
                        item.builder ||
                        item.portalUrl,
                    );
                    return (
                      <div
                        key={item.id}
                        className={i < arr.length - 1 ? "border-b border-divider" : ""}
                      >
                        <button
                          type="button"
                          onClick={() => hasDetail && toggleExpand(item.id)}
                          aria-expanded={open}
                          className={`grid w-full grid-cols-[1.6fr_.9fr_.8fr_.9fr_1fr] items-center gap-2 py-2.5 text-left text-xs ${
                            hasDetail ? "press" : "cursor-default"
                          }`}
                        >
                          <span className="font-bold text-ink">
                            {hasDetail && (
                              <span className="mr-1 inline-block w-2.5 text-center text-[11px] font-extrabold text-text-3">
                                {open ? "−" : "+"}
                              </span>
                            )}
                            {item.houseName}
                            <StatusChip period={item.subscriptionPeriod} />
                            <span className="ml-1 text-[10px] font-medium text-text-3">
                              {item.region}
                              {item.resideLabel ? ` · ${item.resideLabel}` : ""}
                            </span>
                          </span>
                          <span className="text-center font-bold text-text-1">{item.houseType}</span>
                          <span className="text-center font-bold text-text-1">
                            {item.supplyCount.toLocaleString()}
                          </span>
                          <span className="text-center font-bold text-text-1">
                            {item.requestCount ?? "—"}
                          </span>
                          <span className="text-center font-extrabold text-danger">
                            {item.competitionRate ?? "—"}
                          </span>
                        </button>
                        {open && hasDetail && (
                          <div className="mb-2 grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-xl bg-bg px-3.5 py-3 text-[11px] sm:grid-cols-3">
                            {item.rankCode ? (
                              <DetailField label="순위" value={`${item.rankCode}순위`} />
                            ) : null}
                            {item.subscriptionPeriod ? (
                              <DetailField label="청약 접수" value={item.subscriptionPeriod} />
                            ) : null}
                            {ymd(item.announceDate) ? (
                              <DetailField label="모집공고일" value={ymd(item.announceDate)!} />
                            ) : null}
                            {item.builder ? <DetailField label="시행사" value={item.builder} /> : null}
                            {item.houseKind ? <DetailField label="구분" value={item.houseKind} /> : null}
                            {item.portalUrl ? (
                              <div className="col-span-2 sm:col-span-3">
                                <a
                                  href={item.portalUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="font-bold text-primary underline"
                                >
                                  청약홈 공고 원문 보기 ↗
                                </a>
                              </div>
                            ) : null}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </>
              ) : (
                <>
                  <div className="grid grid-cols-[1.6fr_.9fr_.8fr_.8fr_1fr] gap-2 border-b border-divider py-2 text-[10px] text-text-3">
                    <span>단지 · 지역</span>
                    <span className="text-center">타입</span>
                    <span className="text-center">특공 세대</span>
                    <span className="text-center">접수</span>
                    <span className="text-center">결과</span>
                  </div>
                  {displayItems.map((item, i, arr) => {
                    const requests = item.specialMetrics?.reduce((s, m) => s + m.requests, 0);
                    const typeRows = (item.specialMetrics ?? []).filter(
                      (m) => m.supply > 0 || m.requests > 0,
                    );
                    const open = expanded.has(item.id);
                    const hasDetail = typeRows.length > 0;
                    return (
                      <div
                        key={item.id}
                        className={i < arr.length - 1 ? "border-b border-divider" : ""}
                      >
                        <button
                          type="button"
                          onClick={() => hasDetail && toggleExpand(item.id)}
                          aria-expanded={open}
                          className={`grid w-full grid-cols-[1.6fr_.9fr_.8fr_.8fr_1fr] items-center gap-2 py-2.5 text-left text-xs ${
                            hasDetail ? "press" : "cursor-default"
                          }`}
                        >
                          <span className="font-bold text-ink">
                            {hasDetail && (
                              <span className="mr-1 inline-block w-2.5 text-center text-[11px] font-extrabold text-text-3">
                                {open ? "−" : "+"}
                              </span>
                            )}
                            {item.houseName}
                            <StatusChip period={item.subscriptionPeriod} />
                            <span className="ml-1 text-[10px] font-medium text-text-3">
                              {item.region}
                            </span>
                          </span>
                          <span className="text-center font-bold text-text-1">{item.houseType}</span>
                          <span className="text-center font-bold text-text-1">
                            {(item.specialSupplyTotal ?? item.supplyCount).toLocaleString()}
                          </span>
                          <span className="text-center font-bold text-text-1">
                            {requests != null ? requests.toLocaleString() : "—"}
                          </span>
                          <span className="text-center font-extrabold text-danger">
                            {item.resultLabel ?? "—"}
                          </span>
                        </button>
                        {open && hasDetail && (
                          <div className="mb-2 rounded-xl bg-bg px-3.5 py-3">
                            <div className="mb-1.5 text-[10px] font-bold text-text-3">
                              특별공급 유형별 · 공급 / 접수 / 경쟁률
                            </div>
                            <div className="grid grid-cols-[1.4fr_.8fr_.8fr_.9fr] gap-x-2 gap-y-1 text-[11px]">
                              {typeRows.map((m) => (
                                <div key={m.id} className="contents">
                                  <span className="text-text-2">{m.label}</span>
                                  <span className="text-center tabular-nums text-text-1">
                                    {m.supply.toLocaleString()}
                                  </span>
                                  <span className="text-center tabular-nums text-text-1">
                                    {m.requests.toLocaleString()}
                                  </span>
                                  <span className="text-center font-bold text-danger">
                                    {typeRateLabel(m.supply, m.requests)}
                                  </span>
                                </div>
                              ))}
                            </div>
                            <div className="mt-1.5 text-[10px] text-text-3">
                              경쟁률 = 접수 ÷ 공급 · 접수가 공급보다 적으면 &lsquo;미달&rsquo;
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </>
              )}
              <div className="pb-2 pt-1 text-[10px] text-text-3">
                출처 청약홈(한국부동산원) 공공데이터
                {state.fetchedAt ? ` · ${state.fetchedAt.slice(0, 10)} 조회` : ""}
              </div>
            </div>
          </div>
        </>
      )}

      {/* 더보기 (페이지네이션) */}
      {canLoadMore && (
        <button
          type="button"
          disabled={appending}
          onClick={() => void load({ page: state.page + 1, append: true })}
          className="rise-in-3 press card rounded-2xl px-4 py-3 text-center text-[13px] font-bold text-primary disabled:opacity-60"
        >
          {appending
            ? "불러오는 중…"
            : filteredMode
              ? `더보기 — 공고 ${state.totalCount.toLocaleString()}건 중 ${Math.min(
                  state.page * PER_PAGE,
                  state.totalCount,
                ).toLocaleString()}건 확인함`
              : `더보기 (${state.items.length.toLocaleString()} / ${state.totalCount.toLocaleString()}건)`}
        </button>
      )}
    </div>
  );
}
