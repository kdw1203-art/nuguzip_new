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
  detailNotice?: string;
  fetchedAt?: string;
};

/** 조회 실패 — 원인 원문을 같이 들고 다닌다(화면에 그대로 노출한다). */
type ErrState = { message: string; cause?: string } | null;

function fromPayload(p: ApplyhomeSearchPayload, prevItems?: ApplyhomeListingItem[]): ViewState {
  const merged = prevItems ? [...prevItems, ...p.items] : p.items;
  // 페이지 경계 중복 방어 — id 기준 dedupe
  const seen = new Set<string>();
  const items = merged.filter((it) => {
    if (seen.has(it.id)) return false;
    seen.add(it.id);
    return true;
  });
  return {
    tab: p.tab,
    region: p.filters.region,
    q: p.filters.q,
    page: 1,
    items,
    totalCount: p.totalCount,
    mode: p.mode,
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
};

/** "2026-07-27T09:12:33Z" → "07-27 09:12". 파싱 실패 시 앞부분만 그대로 보여준다. */
function fetchedLabel(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(iso);
  if (!m) return iso.slice(0, 16);
  return `${m[2]}-${m[3]} ${m[4]}:${m[5]}`;
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

  const canLoadMore =
    !error &&
    state.mode === "live" &&
    state.items.length > 0 &&
    state.items.length < state.totalCount;

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
          ) : (
            <EmptyState
              icon="search"
              title="이 조건에 맞는 공고가 없어요"
              desc={`${state.region === "전체" ? "전국" : state.region}${
                state.q ? ` · ‘${state.q}’` : ""
              } 조건으로는 조회 결과가 0건이었어요. 지역이나 검색어를 바꿔 보세요.`}
            />
          )}
        </div>
      ) : (
        <div className="rise-in-2 card overflow-x-auto rounded-2xl px-[18px] py-1">
          <div className="min-w-[540px]">
            {state.tab === "competition" ? (
              <>
                <div className="grid grid-cols-[1.6fr_.9fr_.8fr_.9fr_1fr] gap-2 border-b border-[#f0f3f8] py-2 text-[10px] text-text-3">
                  <span>단지 · 지역</span>
                  <span className="text-center">타입</span>
                  <span className="text-center">공급</span>
                  <span className="text-center">접수</span>
                  <span className="text-center">경쟁률</span>
                </div>
                {state.items.map((item, i, arr) => (
                  <div
                    key={item.id}
                    className={`grid grid-cols-[1.6fr_.9fr_.8fr_.9fr_1fr] items-center gap-2 py-2.5 text-xs ${
                      i < arr.length - 1 ? "border-b border-[#f0f3f8]" : ""
                    }`}
                  >
                    <span className="font-bold text-ink">
                      {item.houseName}
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
                  </div>
                ))}
              </>
            ) : (
              <>
                <div className="grid grid-cols-[1.6fr_.9fr_.8fr_.8fr_1fr] gap-2 border-b border-[#f0f3f8] py-2 text-[10px] text-text-3">
                  <span>단지 · 지역</span>
                  <span className="text-center">타입</span>
                  <span className="text-center">특공 세대</span>
                  <span className="text-center">접수</span>
                  <span className="text-center">결과</span>
                </div>
                {state.items.map((item, i, arr) => {
                  const requests = item.specialMetrics?.reduce((s, m) => s + m.requests, 0);
                  return (
                    <div
                      key={item.id}
                      className={`grid grid-cols-[1.6fr_.9fr_.8fr_.8fr_1fr] items-center gap-2 py-2.5 text-xs ${
                        i < arr.length - 1 ? "border-b border-[#f0f3f8]" : ""
                      }`}
                    >
                      <span className="font-bold text-ink">
                        {item.houseName}
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
            : `더보기 (${state.items.length.toLocaleString()} / ${state.totalCount.toLocaleString()}건)`}
        </button>
      )}
    </div>
  );
}
