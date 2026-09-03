"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { TrendChart } from "@/app/components/viz/TrendChart";
import { Bars } from "@/app/components/viz/Bars";
import Link from "next/link";
import { useToast } from "@/app/components/toast/ToastProvider";
import { useSoftSignup } from "@/app/components/soft-signup/SoftSignupProvider";
import { regionIdForName } from "@/lib/region/catalog";
import { useUpgradePaywall } from "@/app/components/UpgradePaywallProvider";

/* ============================================================
   단지 정보 패널 — 검색/마커/목록 선택 시.
   GET /api/complex/[id]/detail 로 실데이터·지역대비·면적대·후기·인근을
   한 화면에 밀도 있게 표시 (허브의 축약판, 2~3배 정보량).
   ============================================================ */

interface ComplexDetail {
  id: string;
  name: string;
  city: string;
  district: string;
  address: string | null;
  road_address: string | null;
  lat: number | null;
  lng: number | null;
  build_year: number | null;
  total_floors: number | null;
  households: number | null;
  building_count: number | null;
  parking_count: number | null;
  parking_per_hh: number | null;
  building_type: string | null;
  builder_name: string | null;
  heating: string | null;
  kapt_code: string | null;
}

interface TxRow {
  yyyymm: string;
  area_m2: number | null;
  avg_manwon: number;
  min_manwon: number | null;
  max_manwon: number | null;
  deal_count: number;
}

interface ReviewSummary {
  count: number;
  noise: number | null;
  parking: number | null;
  mgmt: number | null;
  neighbor: number | null;
  transport: number | null;
}

interface PostRow {
  id?: string;
  title: string;
  district?: string | null;
  like_count?: number | null;
  comment_count?: number | null;
  view_count?: number | null;
  created_at?: string;
}

interface AreaBandRow {
  label: string;
  count: number;
  latestManwon: number;
  latestYm: string;
  avgManwon: number;
}

interface RegionRelativeRow {
  district: string;
  complexPerM2Manwon: number;
  districtPerM2Manwon: number;
  deltaPct: number;
  saleChangePct: number | null;
  jeonseRatio: number | null;
  period: string | null;
}

interface NearbyRow {
  id: string;
  name: string;
  meta: string;
}

interface DetailResponse {
  complex: ComplexDetail | null;
  transactions: TxRow[];
  posts?: PostRow[];
  reviews?: ReviewSummary | null;
  areaBands?: AreaBandRow[];
  regionRelative?: RegionRelativeRow | null;
  nearby?: NearbyRow[];
  listingCount?: number | null;
  /** 조회에 실패한 부가 섹션 이름들 — 빈 값("없음")과 실패를 구분한다 */
  sideFailures?: string[];
  fetchedAt?: string;
  mode: string;
}

export interface ComplexInfoPanelProps {
  complexId: string;
  initialName?: string;
  /** 노트→지도 핸드오프 — 해당 임장노트·AI로 바로 이어가기 */
  focusNoteId?: string | null;
  onClose: () => void;
  onLoaded?: (info: { id: string; name: string; lat: number; lng: number }) => void;
}

function manwonLabel(manwon: number | null | undefined): string | null {
  if (manwon == null || !Number.isFinite(manwon) || manwon <= 0) return null;
  if (manwon >= 10_000) {
    const eok = manwon / 10_000;
    return `${eok >= 10 ? Math.round(eok).toLocaleString("ko-KR") : eok.toFixed(1)}억`;
  }
  return `${Math.round(manwon).toLocaleString("ko-KR")}만`;
}

function ymLabel(yyyymm: string): string {
  if (!yyyymm || yyyymm.length < 6) return yyyymm;
  return `${yyyymm.slice(0, 4)}.${yyyymm.slice(4, 6)}`;
}

function postDateLabel(iso?: string): string | null {
  if (!iso || iso.length < 10) return null;
  return `${iso.slice(5, 7)}.${iso.slice(8, 10)}`;
}

function Sparkline({ tx }: { tx: TxRow[] }) {
  /* 월별로 접어 평균 평단가와 거래 건수를 함께 만든다.
     예전엔 여기서 자체 SVG 를 그리고 색을 #1d4fd8 / #c62828 로 박아 두었다 —
     다크에서 토큰을 안 타고, 격자·범위 표기가 없어 값을 읽을 수 없었다.
     공통 차트(TrendChart·Bars)로 옮기면 색은 currentColor 를 타고, 최고·최저
     범위와 격자가 함께 온다. */
  const byYm = new Map<string, { sum: number; n: number; deals: number }>();
  for (const t of tx) {
    if (!t.yyyymm || !Number.isFinite(t.avg_manwon) || t.avg_manwon <= 0) continue;
    const cur = byYm.get(t.yyyymm) ?? { sum: 0, n: 0, deals: 0 };
    cur.sum += t.avg_manwon;
    cur.n += 1;
    cur.deals += t.deal_count || 0;
    byYm.set(t.yyyymm, cur);
  }
  const series = [...byYm.entries()]
    .map(([ym, v]) => ({ ym, avg: v.sum / v.n, deals: v.deals }))
    .sort((a, b) => a.ym.localeCompare(b.ym));
  if (series.length < 3) return null;

  const vals = series.map((s) => s.avg);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const first = vals[0];
  const lastVal = vals[vals.length - 1];
  const deltaPct = first > 0 ? Math.round(((lastVal - first) / first) * 1000) / 10 : 0;
  const up = lastVal >= first;
  const dealSum = series.reduce((s, t) => s + t.deals, 0);
  const labels = series.map((s) => ymLabel(s.ym));
  const tone = up ? "text-primary" : "text-danger";

  return (
    <div className="flex flex-col gap-2 rounded-[14px] border border-line bg-surface px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="t-section text-ink">실거래가 추이</div>
          <div className="t-caption text-text-3">
            {series.length}개월 · 거래 {dealSum.toLocaleString("ko-KR")}건 · 국토부
          </div>
        </div>
        <span className={`delta shrink-0 ${up ? "delta-up-b" : "delta-down-b"}`}>
          {up ? "▲" : "▼"} {Math.abs(deltaPct)}%
        </span>
      </div>

      <div className={tone}>
        <TrendChart
          values={vals}
          labels={labels}
          height={112}
          bands={3}
          valueSuffix="만"
          ariaLabel={`실거래 평단가 ${series.length}개월 추이`}
        />
      </div>

      {/* 거래 건수 — 가격만 보면 "그 값이 몇 건에서 나왔는지"를 모른다.
          한 건짜리 달의 평균과 스무 건짜리 달의 평균은 무게가 다르다. */}
      {dealSum > 0 && (
        <div className="text-text-3">
          <div className="t-caption pb-0.5">월별 거래 건수</div>
          <Bars
            values={series.map((s) => s.deals)}
            height={40}
            valueSuffix="건"
            ariaLabel="월별 거래 건수"
          />
        </div>
      )}

      <div className="flex justify-between t-caption text-text-3">
        <span>{labels[0]}</span>
        <span>
          {manwonLabel(Math.round(min))} ~ {manwonLabel(Math.round(max))}
        </span>
        <span>{labels[labels.length - 1]}</span>
      </div>
    </div>
  );
}

function WatchlistToggle({
  complexId,
  complexName,
}: {
  complexId: string;
  complexName: string;
}) {
  const { showToast } = useToast();
  const { promptSignup } = useSoftSignup();
  const { handleUpgradeResponse } = useUpgradePaywall();
  const [watching, setWatching] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  const askSignup = () =>
    promptSignup({
      action: "watchlist_add",
      title: "관심 단지로 저장할까요?",
      benefit:
        "가입하면 이 단지의 국토부 실거래가가 새로 등록될 때 알림을 받고, 임장노트와 함께 모아볼 수 있어요.",
      callbackUrl: "/map",
    });

  const disabled = !complexId || complexId.startsWith("mock-");

  useEffect(() => {
    if (disabled) {
      setWatching(false);
      return;
    }
    let cancelled = false;
    fetch(`/api/me/watchlist?complexId=${encodeURIComponent(complexId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!cancelled && j) setWatching(Boolean(j.watching));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [complexId, disabled]);

  if (disabled) return null;

  async function toggle() {
    if (busy) return;
    setBusy(true);
    try {
      if (watching) {
        const res = await fetch(
          `/api/me/watchlist?complexId=${encodeURIComponent(complexId)}`,
          { method: "DELETE" },
        );
        if (res.status === 401) {
          askSignup();
          return;
        }
        if (res.ok) {
          setWatching(false);
          showToast("관심 단지에서 뺐어요");
        }
      } else {
        const res = await fetch("/api/me/watchlist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ complexId, complexName }),
        });
        if (res.status === 401) {
          askSignup();
          return;
        }
        const j = (await res.json().catch(() => ({}))) as {
          error?: string;
          code?: string;
        };
        if (handleUpgradeResponse(res.status, j)) {
          showToast(j.error ?? "관심 단지 한도를 초과했어요");
          return;
        }
        if (res.status === 403) {
          showToast(j.error ?? "관심 단지 한도를 초과했어요");
          return;
        }
        if (res.ok) {
          setWatching(true);
          showToast("관심 단지에 담았어요. 시세 변동 알림을 받아요.");
        } else {
          showToast(j.error ?? "관심 담기에 실패했어요");
        }
      }
    } catch {
      showToast("네트워크 오류가 발생했어요");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void toggle()}
      disabled={busy}
      aria-pressed={watching === true}
      className={`flex w-full items-center justify-center gap-1.5 rounded-xl border p-[11px] text-xs font-extrabold transition-colors disabled:opacity-60 ${
        watching
          ? "border-primary bg-[rgba(29,79,216,.08)] text-primary"
          : "border-line bg-surface text-text-2"
      }`}
    >
      <span className={watching ? "text-primary" : "text-danger"}>
        {watching ? "♥" : "♡"}
      </span>
      {watching ? "관심 단지 담김 · 알림 받는 중" : "관심 단지 담고 시세 알림 받기"}
    </button>
  );
}

const REVIEW_LABELS: { key: keyof Omit<ReviewSummary, "count">; label: string }[] = [
  { key: "noise", label: "소음" },
  { key: "parking", label: "주차" },
  { key: "mgmt", label: "관리" },
  { key: "neighbor", label: "이웃" },
  { key: "transport", label: "교통" },
];

function SectionHead({
  title,
  sub,
  right,
}: {
  title: string;
  sub?: string;
  right?: ReactNode;
}) {
  return (
    <div className="mb-2 flex items-end justify-between gap-2">
      <div>
        <div className="t-body font-extrabold text-ink">{title}</div>
        {sub ? <div className="mt-0.5 t-caption text-text-3">{sub}</div> : null}
      </div>
      {right}
    </div>
  );
}

export function ComplexInfoPanel({
  complexId,
  initialName,
  focusNoteId = null,
  onClose,
  onLoaded,
}: ComplexInfoPanelProps) {
  const [data, setData] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setLoading(true);
    setFailed(false);
    setData(null);
    fetch(`/api/complex/${encodeURIComponent(complexId)}/detail`, { signal: controller.signal })
      .then((r) => (r.ok ? (r.json() as Promise<DetailResponse>) : null))
      .then((j) => {
        if (cancelled) return;
        if (!j) {
          setFailed(true);
          return;
        }
        setData(j);
        const c = j.complex;
        if (c && c.lat != null && c.lng != null && onLoaded) {
          onLoaded({ id: complexId, name: c.name, lat: c.lat, lng: c.lng });
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [complexId, onLoaded]);

  const complex = data?.complex ?? null;
  const name = complex?.name ?? initialName ?? "단지";
  // ?? [] 를 그대로 두면 렌더마다 새 배열이라 tx 를 의존하는 useMemo 가 매번 다시 돈다
  const tx = useMemo(() => data?.transactions ?? [], [data?.transactions]);
  const posts = data?.posts ?? [];
  const reviews = data?.reviews ?? null;
  const bands = data?.areaBands ?? [];
  const region = data?.regionRelative ?? null;
  const nearby = data?.nearby ?? [];
  const sideFailed = new Set(data?.sideFailures ?? []);
  const listingCount = data?.listingCount;
  const latest = tx.length > 0 ? tx[tx.length - 1] : null;
  const prev = tx.length > 1 ? tx[tx.length - 2] : null;
  const recent = useMemo(() => [...tx].reverse().slice(0, 14), [tx]);
  const cityDistrict = [complex?.city, complex?.district].filter(Boolean).join(" ");
  const address =
    complex?.road_address ??
    complex?.address ??
    (cityDistrict || (initialName ? "" : "주소 준비 중"));

  const priceLabel = manwonLabel(latest?.avg_manwon);
  const momPct =
    latest && prev && prev.avg_manwon > 0
      ? Math.round(((latest.avg_manwon - prev.avg_manwon) / prev.avg_manwon) * 1000) / 10
      : null;
  const dealSum = recent.reduce((s, t) => s + (t.deal_count || 0), 0);
  const dealAll = tx.reduce((s, t) => s + (t.deal_count || 0), 0);

  const detailHref = `/complex/${encodeURIComponent(complexId)}`;
  const noteHref = (() => {
    const params = new URLSearchParams({ apt: name });
    if (cityDistrict) params.set("region", cityDistrict);
    if (complexId && !complexId.startsWith("mock-")) params.set("complexId", complexId);
    if (complex?.lat != null && complex?.lng != null) {
      params.set("lat", String(complex.lat));
      params.set("lng", String(complex.lng));
    }
    return `/notes/new?${params.toString()}`;
  })();
  const analysisHref = focusNoteId
    ? `/analysis?noteId=${encodeURIComponent(focusNoteId)}`
    : `/analysis?complexId=${encodeURIComponent(complexId)}`;
  const focusNoteHref = focusNoteId
    ? `/notes/${encodeURIComponent(focusNoteId)}`
    : null;

  const chips = [
    complex?.build_year
      ? `${complex.build_year}년 · ${new Date().getFullYear() - complex.build_year}년차`
      : null,
    complex?.households ? `${complex.households.toLocaleString("ko-KR")}세대` : null,
    complex?.building_count ? `${complex.building_count}동` : null,
    complex?.building_type || null,
    complex?.parking_per_hh ? `주차 ${complex.parking_per_hh}대/세대` : null,
    complex?.heating || null,
    complex?.builder_name || null,
    listingCount != null && listingCount > 0 ? `매물 ${listingCount}건` : null,
    posts.length > 0 ? `이야기 ${posts.length}건` : null,
  ].filter((v): v is string => Boolean(v));

  const specRows = [
    complex?.builder_name ? { label: "시공사", value: complex.builder_name } : null,
    complex?.heating ? { label: "난방", value: complex.heating } : null,
    complex?.parking_count
      ? { label: "총 주차", value: `${complex.parking_count.toLocaleString("ko-KR")}대` }
      : null,
    complex?.parking_per_hh
      ? { label: "세대당 주차", value: `${complex.parking_per_hh}대` }
      : null,
    complex?.households
      ? { label: "세대수", value: `${complex.households.toLocaleString("ko-KR")}세대` }
      : null,
    complex?.building_count
      ? { label: "동 수", value: `${complex.building_count}동` }
      : null,
    complex?.build_year
      ? {
          label: "준공",
          value: `${complex.build_year}년 (${new Date().getFullYear() - complex.build_year}년차)`,
        }
      : null,
    complex?.total_floors ? { label: "층수", value: `${complex.total_floors}층` } : null,
    complex?.building_type ? { label: "유형", value: complex.building_type } : null,
    complex?.kapt_code ? { label: "단지코드", value: complex.kapt_code } : null,
    cityDistrict ? { label: "지역", value: cityDistrict } : null,
  ].filter((v): v is { label: string; value: string } => Boolean(v));

  const fetchedLabel = data?.fetchedAt
    ? (() => {
        const t = Date.parse(data.fetchedAt);
        if (!Number.isFinite(t)) return null;
        const d = new Date(t);
        return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")} 갱신`;
      })()
    : null;

  return (
    <div
      className="fixed inset-0 z-[48] flex items-end justify-center px-0 py-0 sm:items-center sm:px-4 sm:py-6"
      role="dialog"
      aria-modal="true"
      aria-label={`${name} 단지 정보`}
    >
      <button
        type="button"
        aria-label="단지 정보 닫기"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-[rgba(11,20,40,.48)]"
      />
      {/* 소유자 캡처 제보(2026-08-16): glass-strong(반투명+블러)이 뒤의 어두운
          지도 딤과 겹쳐, backdrop-filter 가 약한 환경에서 패널이 탁한 어둠으로
          렌더돼 "보기가 힘들다". 시트/모달은 불투명이 정답 — bg-surface 로 고정해
          어떤 GPU·브라우저에서도 같은 흰 패널을 보장한다. */}
      <aside className="rise-in relative z-10 flex max-h-[min(94dvh,960px)] w-full max-w-[820px] flex-col overflow-hidden rounded-t-[22px] bg-surface shadow-[0_28px_70px_rgba(16,28,54,.34)] sm:rounded-[24px]">
        {/* 히어로 — 가격 중심 + 칩 */}
        <div className="relative border-b border-[rgba(16,28,54,.06)] bg-gradient-to-br from-primary-soft via-surface to-bg px-5 pb-3.5 pt-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="truncate t-title tracking-tight text-ink sm:t-title">
                  {name}
                </h2>
                {loading && (
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                )}
              </div>
              {address ? (
                <div className="mt-0.5 truncate t-sub text-text-2">{address}</div>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="패널 닫기"
              className="relative ml-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/70 t-body text-text-3 after:absolute after:-inset-1.5 after:content-['']"
            >
              ✕
            </button>
          </div>

          <div className="mt-3 flex items-end justify-between gap-3">
            <div>
              <div className="t-caption font-bold uppercase tracking-wide text-text-3">
                최근 실거래 평균
              </div>
              <div className="mt-0.5 flex items-baseline gap-2">
                <span className="t-title leading-none text-ink tabular-nums sm:t-title">
                  {priceLabel ?? (loading ? "…" : "—")}
                </span>
                {momPct != null && (
                  <span
                    className={`text-[13px] font-extrabold ${
                      momPct > 0 ? "text-primary" : momPct < 0 ? "text-danger" : "text-text-3"
                    }`}
                  >
                    {momPct > 0 ? "+" : ""}
                    {momPct}%
                    <span className="ml-1 t-caption font-semibold text-text-3">전월</span>
                  </span>
                )}
              </div>
              <div className="mt-1 t-sub text-text-3">
                {latest
                  ? `${ymLabel(latest.yyyymm)} · ${latest.deal_count}건${
                      latest.min_manwon && latest.max_manwon
                        ? ` · ${manwonLabel(latest.min_manwon)}~${manwonLabel(latest.max_manwon)}`
                        : ""
                    }`
                  : failed
                    ? "불러오지 못함"
                    : "실거래 없음"}
                {dealAll > 0 ? ` · ${tx.length}개월 ${dealAll}건` : ""}
              </div>
            </div>
            <div className="grid shrink-0 grid-cols-2 gap-1.5 text-center">
              <div className="min-w-[68px] rounded-xl bg-white/80 px-2 py-1.5 shadow-sm">
                <div className="t-caption text-text-3">거래</div>
                <div className="t-body font-extrabold text-ink">
                  {dealSum > 0 ? `${dealSum}` : "—"}
                </div>
              </div>
              <div className="min-w-[68px] rounded-xl bg-white/80 px-2 py-1.5 shadow-sm">
                <div className="t-caption text-text-3">세대</div>
                <div className="t-body font-extrabold text-ink">
                  {complex?.households
                    ? complex.households >= 1000
                      ? `${(complex.households / 1000).toFixed(1)}천`
                      : complex.households.toLocaleString("ko-KR")
                    : "—"}
                </div>
              </div>
            </div>
          </div>

          {chips.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-1">
              {chips.map((c) => (
                <span
                  key={c}
                  className="chip-soft rounded-full chip-pad t-caption font-bold text-text-2"
                >
                  {c}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-3.5 sm:px-5">
          {failed && (
            <div className="rounded-xl border border-danger-border bg-danger-soft px-3.5 py-2.5 text-xs text-text-2">
              단지 상세를 불러오지 못했어요. 전체 화면에서 다시 확인해 주세요.
            </div>
          )}

          {data?.mode === "not_found" && !failed && (
            <div className="rounded-xl bg-bg px-3.5 py-2.5 text-xs text-text-2">
              단지 마스터와 아직 연결되지 않았어요. 실거래·이야기는 아래를 참고해 주세요.
            </div>
          )}

          {focusNoteHref && (
            <div className="rounded-2xl border border-primary/25 bg-primary-soft/60 px-3.5 py-3">
              <div className="t-sub font-extrabold text-ink">임장노트에서 이어보기</div>
              <p className="mt-0.5 t-sub text-text-2">
                이 단지를 노트·AI와 함께 지도에서 비교하고 있어요.
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Link
                  href={focusNoteHref}
                  className="rounded-xl bg-surface px-2.5 py-2 text-center t-sub font-extrabold text-primary shadow-sm"
                >
                  노트 보기
                </Link>
                <Link
                  href={analysisHref}
                  className="rounded-xl bg-primary px-2.5 py-2 text-center t-sub font-extrabold text-white"
                >
                  AI 정리 보기
                </Link>
              </div>
            </div>
          )}

          {/* 지역 대비 */}
          {region && (
            <div className="rounded-2xl border border-line bg-surface px-3.5 py-3">
              <SectionHead
                title="이 동네 대비"
                sub={`${region.district} · ㎡당 · ${region.period ? ymLabel(region.period) : "최근"} 기준`}
                right={
                  <span
                    className={`text-[19px] font-extrabold tabular-nums ${
                      region.deltaPct >= 0 ? "text-primary" : "text-danger"
                    }`}
                  >
                    {region.deltaPct >= 0 ? "+" : ""}
                    {region.deltaPct}%
                  </span>
                }
              />
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-bg px-3 py-2">
                  <div className="t-caption text-text-3">이 단지</div>
                  <div className="t-section text-ink tabular-nums">
                    {region.complexPerM2Manwon.toLocaleString("ko-KR")}
                    <span className="t-caption font-bold text-text-3">만/㎡</span>
                  </div>
                </div>
                <div className="rounded-xl bg-bg px-3 py-2">
                  <div className="t-caption text-text-3">{region.district} 평균</div>
                  <div className="t-section text-ink tabular-nums">
                    {region.districtPerM2Manwon.toLocaleString("ko-KR")}
                    <span className="t-caption font-bold text-text-3">만/㎡</span>
                  </div>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 t-caption text-text-3">
                {region.saleChangePct != null && (
                  <span>
                    구 변동{" "}
                    <b className={region.saleChangePct >= 0 ? "text-primary" : "text-danger"}>
                      {region.saleChangePct >= 0 ? "+" : ""}
                      {region.saleChangePct}%
                    </b>
                  </span>
                )}
                {region.jeonseRatio != null && (
                  <span>
                    전세가율 <b className="text-text-2">{region.jeonseRatio}%</b>
                  </span>
                )}
              </div>
            </div>
          )}

          <Sparkline tx={tx} />

          {/* 스펙 그리드 */}
          {specRows.length > 0 && (
            <div className="rounded-[14px] border border-line bg-surface px-3.5 py-2.5">
              <SectionHead title="단지 스펙" sub="공공·단지 마스터 기준" />
              <div className="grid grid-cols-2 gap-x-4 gap-y-0 sm:grid-cols-3">
                {specRows.map((row) => (
                  <div
                    key={row.label}
                    className="flex items-baseline justify-between gap-2 border-b border-divider py-2 t-body last:border-b-0"
                  >
                    <span className="shrink-0 text-text-3">{row.label}</span>
                    <span className="truncate text-right font-bold text-ink">{row.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 면적대 — 전체 */}
          {bands.length > 0 && (
            <div className="rounded-[14px] border border-line bg-surface px-3.5 py-2.5">
              <SectionHead title="면적대별 시세" sub={`${bands.length}개 구간 · 국토부`} />
              {/* 면적대 간 격차를 배경 길이로 먼저 보인다 — 숫자 네 줄을
                  세로로 읽어야 "어느 평형이 비싼가"가 잡히던 자리. */}
              <div className="overflow-hidden rounded-[10px] bg-bg">
                {bands.map((b, i) => {
                  const maxLatest = Math.max(1, ...bands.map((x) => x.latestManwon || 0));
                  const w = Math.round(((b.latestManwon || 0) / maxLatest) * 100);
                  return (
                    <div
                      key={b.label}
                      className={`cell-bar row-hl flex items-center justify-between gap-2 px-3 py-2 t-sub text-primary ${
                        i > 0 ? "border-t border-line" : ""
                      }`}
                      style={{ ["--w" as string]: `${w}%` }}
                    >
                      <div className="min-w-0">
                        <div className="font-bold text-ink">{b.label}</div>
                        <div className="t-caption text-text-3">
                          {b.count}건 · {ymLabel(b.latestYm)}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="t-num text-ink">
                          {manwonLabel(b.latestManwon) ?? "—"}
                        </div>
                        <div className="t-caption text-text-3">
                          평균 {manwonLabel(b.avgManwon) ?? "—"}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 최근 실거래 14개월 */}
          {recent.length > 0 && (
            <div className="rounded-[14px] border border-line bg-surface px-3.5 py-2.5">
              <SectionHead
                title="월별 실거래"
                sub={`최근 ${recent.length}개월 · 합 ${dealSum}건`}
              />
              <div className="max-h-[220px] overflow-y-auto rounded-xl bg-bg">
                {recent.map((t, i) => {
                  const p = recent[i + 1];
                  const d =
                    p && p.avg_manwon > 0
                      ? Math.round(((t.avg_manwon - p.avg_manwon) / p.avg_manwon) * 1000) / 10
                      : null;
                  return (
                    <div
                      key={`${t.yyyymm}-${i}`}
                      className={`flex items-center justify-between gap-2 px-3 py-2 text-[13px] ${
                        i > 0 ? "border-t border-line" : ""
                      }`}
                    >
                      <span className="text-text-2">
                        {ymLabel(t.yyyymm)}
                        <span className="ml-1.5 text-text-3">{t.deal_count}건</span>
                        {t.min_manwon && t.max_manwon && t.min_manwon !== t.max_manwon ? (
                          <span className="ml-1 hidden t-caption text-text-3 sm:inline">
                            {manwonLabel(t.min_manwon)}~{manwonLabel(t.max_manwon)}
                          </span>
                        ) : null}
                      </span>
                      <span className="flex items-baseline gap-1.5">
                        <span className="font-extrabold text-ink">
                          {manwonLabel(t.avg_manwon) ?? "—"}
                        </span>
                        {d != null && (
                          <span
                            className={`text-[10px] font-bold ${
                              d > 0 ? "text-primary" : d < 0 ? "text-danger" : "text-text-3"
                            }`}
                          >
                            {d > 0 ? "+" : ""}
                            {d}%
                          </span>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {!loading && recent.length === 0 && !failed && (
            <div className="rounded-xl bg-bg px-3.5 py-2.5 text-xs text-text-3">
              최근 실거래 데이터가 아직 없어요.
            </div>
          )}

          {/* 후기 */}
          {reviews && reviews.count > 0 && (
            <div className="rounded-2xl border border-line bg-surface px-3.5 py-3">
              <SectionHead title="거주민 후기" sub={`${reviews.count}건 평균`} />
              <div className="grid grid-cols-5 gap-1.5">
                {REVIEW_LABELS.map(({ key, label }) => {
                  const v = reviews[key];
                  const pct = v != null ? Math.min(100, Math.round((v / 5) * 100)) : 0;
                  return (
                    <div key={key} className="rounded-xl bg-bg px-1 py-2 text-center">
                      <div className="t-caption text-text-3">{label}</div>
                      <div className="t-section text-ink">
                        {v != null ? v : "—"}
                      </div>
                      <div className="mx-auto mt-1 h-1 w-[80%] overflow-hidden rounded-full bg-line">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 이야기 6건 */}
          {posts.length > 0 && (
            <div className="rounded-[14px] border border-line bg-surface px-3.5 py-2.5">
              <SectionHead title="단지 이야기" sub={`${posts.length}건 · 공개 글`} />
              <div className="flex flex-col gap-1">
                {posts.slice(0, 6).map((p, i) => (
                  <div
                    key={p.id || `${p.title}-${i}`}
                    className="rounded-xl bg-bg px-3 py-2"
                  >
                    <div className="truncate t-sub font-bold text-ink">{p.title}</div>
                    <div className="mt-0.5 flex flex-wrap gap-x-2 t-caption text-text-3">
                      {postDateLabel(p.created_at) && <span>{postDateLabel(p.created_at)}</span>}
                      {p.district && <span>{p.district}</span>}
                      {p.like_count != null && <span>공감 {p.like_count}</span>}
                      {p.comment_count != null && p.comment_count > 0 && (
                        <span>댓글 {p.comment_count}</span>
                      )}
                      {p.view_count != null && p.view_count > 0 && (
                        <span>조회 {p.view_count}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 부가 섹션 조회 실패 고지 — 섹션이 안 보이는 이유가 "없어서"가
              아니라 "지금 못 읽어서"일 때, 그 사실을 말한다. */}
          {(sideFailed.has("regionRelative") || sideFailed.has("nearby")) && (
            <div className="rounded-2xl border border-warning-border bg-warning-soft px-3.5 py-2.5 t-sub text-warning">
              {[
                sideFailed.has("regionRelative") ? "이 동네 대비" : null,
                sideFailed.has("nearby") ? "인근 단지" : null,
              ]
                .filter(Boolean)
                .join(" · ")}{" "}
              정보를 지금 불러오지 못했어요 — 없는 게 아니라 조회가 실패했습니다.
            </div>
          )}

          {/* 인근 단지 */}
          {nearby.length > 0 && (
            <div className="rounded-[14px] border border-line bg-surface px-3.5 py-2.5">
              <SectionHead
                title={`${complex?.district || "근처"} 다른 단지`}
                sub="같은 지역 비교"
              />
              <div className="grid grid-cols-2 gap-1.5">
                {nearby.map((n) => (
                  <Link
                    key={n.id}
                    href={`/complex/${encodeURIComponent(n.id)}`}
                    className="rounded-xl border border-line bg-bg px-3 py-2 transition-colors hover:border-primary/40"
                  >
                    <div className="truncate t-sub font-extrabold text-ink">{n.name}</div>
                    <div className="mt-0.5 truncate t-caption text-text-3">
                      {n.meta || "단지 정보"}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          <WatchlistToggle complexId={complexId} complexName={name} />

          <div className="grid grid-cols-2 gap-2">
            <Link href={noteHref} className="btn-secondary rounded-xl p-[11px] text-center text-xs">
              임장노트 쓰기
            </Link>
            <Link
              href={analysisHref}
              className="btn-secondary rounded-xl p-[11px] text-center text-xs"
            >
              AI 분석
            </Link>
          </div>

          {/* [3차] 지도 → 지역 허브 연결 — 단지에서 그 동네 시장 전체(지수·거래량·
              입주·시장 흐름 읽기)로 이어지는 유일한 다리. cityDistrict 가 카탈로그와
              매칭될 때만 그린다(없는 링크를 만들지 않는다). */}
          {(() => {
            const rid = cityDistrict ? regionIdForName(cityDistrict) : null;
            if (!rid) return null;
            return (
              <Link
                href={`/region/${rid}`}
                className="btn-secondary block rounded-xl p-[11px] text-center text-xs"
              >
                {cityDistrict} 시장 전체 보기 — 지수·거래량·입주
              </Link>
            );
          })()}

          {fetchedLabel && (
            <p className="text-center t-caption text-text-3">{fetchedLabel} · 실거래·공공데이터</p>
          )}
        </div>

        {/* 이 줄은 시트 맨 아래에 고정으로 붙는 CTA 바다. 모바일에서 시트가
            화면 바닥에 닿으므로 아래 여백에 safe-area 를 더한다(점검 337).
            안 더하면 standalone 에서 12px 만 남아 버튼 아래쪽이 홈 인디케이터
            자리에 들어간다 — 탭 모드에서는 인셋이 0이라 아무 일도 안 일어나
            조용히 지나가는 종류의 버그다. sm 이상은 시트가 가운데 뜬다. */}
        <div className="border-t border-[rgba(16,28,54,.06)] bg-surface px-5 py-3 pb-[calc(12px+env(safe-area-inset-bottom,0px))] sm:pb-3">
          <Link
            href={detailHref}
            className="btn-primary btn-cta block rounded-xl p-3 text-center t-body font-extrabold text-white"
          >
            전체 화면으로 더 자세히 보기 ›
          </Link>
        </div>
      </aside>
    </div>
  );
}
