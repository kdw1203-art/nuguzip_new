"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/* ============================================================
   단지 정보 패널 (6a·item2) — 검색 결과/포인트 마커 선택 시.
   GET /api/complex/[id]/detail 로 실데이터(이름·주소·최근 실거래가·세대수·
   준공연도)를 가져와 하단 시트(모바일)/사이드 패널(데스크톱)로 표시한다.
   CTA: 단지 상세 / 이 단지 임장노트(?apt=) / AI 분석(?complexId=).
   데이터 없거나 실패해도 이름·닫기만으로 graceful. 서버 모듈 import 없이 로컬 타입. */

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
  parking_per_hh: number | null;
  building_type: string | null;
}

interface TxRow {
  yyyymm: string;
  area_m2: number | null;
  avg_manwon: number;
  deal_count: number;
}

interface DetailResponse {
  complex: ComplexDetail | null;
  transactions: TxRow[];
  mode: string;
}

export interface ComplexInfoPanelProps {
  complexId: string;
  /** 로딩 중 즉시 표시할 이름(검색 결과에서 전달) */
  initialName?: string;
  onClose: () => void;
  /** 상세 로드 완료 시 좌표 통지 → 지도 recenter·마커 하이라이트 */
  onLoaded?: (info: { id: string; name: string; lat: number; lng: number }) => void;
}

/** 만원 → "12.3억" / "8,200만" (없으면 null) */
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

export function ComplexInfoPanel({
  complexId,
  initialName,
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
  const tx = data?.transactions ?? [];
  const latest = tx.length > 0 ? tx[tx.length - 1] : null;
  const recent = [...tx].reverse().slice(0, 3);
  const cityDistrict = [complex?.city, complex?.district].filter(Boolean).join(" ");
  const address =
    complex?.road_address ??
    complex?.address ??
    (cityDistrict || (initialName ? "" : "주소 준비 중"));

  const priceLabel = manwonLabel(latest?.avg_manwon);
  const detailHref = complexId.startsWith("mock-") ? "/complex/mock-1" : `/complex/${complexId}`;
  // 임장노트 연결 — 단지명·지역·단지ID·좌표까지 프리필해 노트가 위치와 완전히 연동되게 한다.
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
  const analysisHref = `/analysis?complexId=${encodeURIComponent(complexId)}`;

  const metaParts = [
    complex?.build_year ? `${complex.build_year}년 준공` : null,
    complex?.households ? `${complex.households.toLocaleString("ko-KR")}세대` : null,
    complex?.building_type || null,
  ].filter((v): v is string => Boolean(v));

  return (
    <aside
      className="glass-strong rise-in fixed left-4 right-4 z-[45] flex flex-col overflow-hidden rounded-[22px] md:left-5 md:right-auto md:w-[420px]"
      style={{
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)",
        maxHeight: "calc(100dvh - env(safe-area-inset-top, 0px) - 200px)",
        top: "auto",
      }}
      role="dialog"
      aria-label={`${name} 단지 정보`}
    >
      <div className="flex items-start justify-between border-b border-[rgba(16,28,54,.06)] px-5 pb-3 pt-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-[18px] font-extrabold text-ink">{name}</span>
            {loading && (
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            )}
          </div>
          {address && <div className="mt-1 truncate text-xs text-text-2">{address}</div>}
          {metaParts.length > 0 && (
            <div className="mt-0.5 text-[11px] text-text-3">{metaParts.join(" · ")}</div>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="패널 닫기"
          className="ml-2 shrink-0 text-[15px] text-text-3"
        >
          ✕
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-5 py-4">
        {failed && (
          <div className="card rounded-[14px] px-4 py-3 text-xs text-text-2">
            단지 상세 정보를 불러오지 못했어요. 아래 버튼으로 단지 홈에서 확인해 주세요.
          </div>
        )}

        <div className="grid grid-cols-3 gap-2">
          <div className="card rounded-xl px-3 py-[11px]">
            <div className="text-[10px] text-text-3">최근 실거래가</div>
            <div className="mt-0.5 text-base font-extrabold text-ink">
              {priceLabel ?? (loading ? "…" : "준비 중")}
            </div>
            <div className="text-[10px] text-text-3">
              {latest ? ymLabel(latest.yyyymm) : "실거래 없음"}
            </div>
          </div>
          <div className="card rounded-xl px-3 py-[11px]">
            <div className="text-[10px] text-text-3">세대수</div>
            <div className="mt-0.5 text-base font-extrabold text-ink">
              {complex?.households ? complex.households.toLocaleString("ko-KR") : "—"}
            </div>
            <div className="text-[10px] text-text-3">
              {complex?.parking_per_hh ? `주차 ${complex.parking_per_hh}대/세대` : "세대"}
            </div>
          </div>
          <div className="card rounded-xl px-3 py-[11px]">
            <div className="text-[10px] text-text-3">준공연도</div>
            <div className="mt-0.5 text-base font-extrabold text-ink">
              {complex?.build_year ?? "—"}
            </div>
            <div className="text-[10px] text-text-3">
              {complex?.total_floors ? `${complex.total_floors}층` : "년"}
            </div>
          </div>
        </div>

        {recent.length > 0 && (
          <div className="card flex flex-col rounded-[14px] px-[15px] py-1">
            <div className="py-2 text-[11px] font-bold text-text-2">최근 실거래</div>
            {recent.map((t, i) => (
              <div
                key={`${t.yyyymm}-${i}`}
                className={`flex items-center justify-between py-2 text-[13px] ${
                  i < recent.length - 1 ? "border-t border-[#f0f3f8]" : "border-t border-[#f0f3f8]"
                }`}
              >
                <span className="text-text-2">
                  {ymLabel(t.yyyymm)} · {t.deal_count}건
                  {t.area_m2 ? ` · ${Math.round(t.area_m2)}㎡` : ""}
                </span>
                <span className="font-extrabold text-ink">{manwonLabel(t.avg_manwon) ?? "—"}</span>
              </div>
            ))}
          </div>
        )}

        {!loading && recent.length === 0 && !failed && (
          <div className="card rounded-[14px] px-4 py-3 text-xs text-text-3">
            최근 실거래 데이터가 아직 없어요.
          </div>
        )}

        <div className="grid grid-cols-3 gap-2">
          <Link
            href={detailHref}
            className="btn-primary btn-cta rounded-xl p-[11px] text-center text-xs"
          >
            단지 상세
          </Link>
          <Link href={noteHref} className="btn-secondary rounded-xl p-[11px] text-center text-xs">
            임장노트
          </Link>
          <Link href={analysisHref} className="btn-secondary rounded-xl p-[11px] text-center text-xs">
            AI 분석
          </Link>
        </div>
      </div>
    </aside>
  );
}
