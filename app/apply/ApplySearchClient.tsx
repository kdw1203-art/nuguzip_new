"use client";

import { useState } from "react";
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
 */

const PER_PAGE = 15;

type Props = { initial: ApplyhomeSearchPayload | null };

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

export function ApplySearchClient({ initial }: Props) {
  const [state, setState] = useState<ViewState>(
    initial ? fromPayload(initial) : EMPTY_STATE,
  );
  const [qInput, setQInput] = useState(initial?.filters.q ?? "");
  const [loading, setLoading] = useState(false);
  const [appending, setAppending] = useState(false);
  const [error, setError] = useState<string | null>(
    initial ? null : "청약홈 데이터를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.",
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
      if (!res.ok) throw new Error("청약홈 데이터를 불러오지 못했어요.");
      const data = (await res.json()) as ApplyhomeSearchPayload;
      setState((prev) => ({
        ...fromPayload(data, append ? prev.items : undefined),
        page,
      }));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "청약홈 데이터를 불러오지 못했어요.",
      );
    } finally {
      setLoading(false);
      setAppending(false);
    }
  }

  const canLoadMore =
    state.mode === "live" && state.items.length > 0 && state.items.length < state.totalCount;

  const tabPill = (on: boolean) =>
    on
      ? "press rounded-full bg-primary px-4 py-2 text-[13px] font-bold text-white"
      : "press glass rounded-full px-4 py-2 text-[13px] font-semibold text-text-2";

  return (
    <div className="flex flex-col gap-3">
      {/* 탭 + 필터 행 */}
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
          <select
            value={state.region}
            onChange={(e) => void load({ region: e.target.value, page: 1 })}
            aria-label="지역"
            className="rounded-xl border border-line bg-surface px-3 py-2 text-[13px] text-ink"
          >
            {APPLYHOME_REGIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
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

      {/* 상세 API 미승인 등 데이터 한계 안내 — 서버가 준 사실 그대로 */}
      {state.detailNotice && (
        <p className="rise-in-1 rounded-xl bg-[rgba(29,79,216,.06)] px-4 py-2.5 text-[11px] leading-[1.6] text-[#5b74b8]">
          {state.detailNotice}
        </p>
      )}

      {error && (
        <div
          role="alert"
          className="rise-in-1 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface px-4 py-3 text-[12px] text-danger"
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={() => void load({ page: 1 })}
            className="press rounded-full bg-primary-soft px-3 py-1.5 text-[12px] font-bold text-primary"
          >
            다시 시도
          </button>
        </div>
      )}

      {/* 결과 표 */}
      <div className="rise-in-2 px-1 text-xs font-extrabold text-text-3">
        {state.mode === "live"
          ? `${state.tab === "competition" ? "청약 경쟁률" : "특별공급 접수현황"} · 청약홈 실데이터 ${state.totalCount.toLocaleString()}건`
          : "청약홈 실데이터"}
      </div>

      {loading ? (
        <div className="rise-in-2 card rounded-2xl px-4 py-12 text-center text-[13px] text-text-3">
          청약홈 데이터를 불러오는 중…
        </div>
      ) : state.items.length === 0 ? (
        <div className="rise-in-2 card rounded-2xl px-4 py-12 text-center text-[13px] text-text-3">
          {state.mode === "mock"
            ? "청약홈 공공데이터 연동(DATA_GO_KR_SERVICE_KEY)이 설정되지 않아 표시할 데이터가 없어요. 지어낸 수치는 보여드리지 않아요."
            : "현재 조건에 표시할 청약 데이터가 없어요. 지역·검색어를 바꿔 보세요."}
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
