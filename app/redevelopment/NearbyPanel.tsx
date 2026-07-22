"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "@/app/components/Icon";

/**
 * 선택한 정비사업 구역의 인근 매물 + 최근 실거래 패널.
 * /api/redevelopment/nearby?id= 를 호출한다. (매물=좌표 bbox, 실거래=시군구 단위)
 */

type NearbyTransaction = {
  complexName: string;
  areaM2: number | null;
  floor: number | null;
  priceLabel: string;
  contractYmd: string;
};
type NearbyListing = {
  id: string;
  listingType: string;
  complexName: string | null;
  priceLabel: string;
};
type NearbyResp = {
  regionLabel: string;
  transactions: NearbyTransaction[];
  listings: NearbyListing[];
};

const TYPE_LABEL: Record<string, string> = {
  sale: "매매",
  jeonse: "전세",
  monthly: "월세",
};

function pyeong(areaM2: number | null): string {
  if (areaM2 == null || !Number.isFinite(areaM2) || areaM2 <= 0) return "";
  return `${Math.round(areaM2)}㎡(${Math.round(areaM2 / 3.3058)}평)`;
}

export function NearbyPanel({
  projectId,
  projectName,
}: {
  projectId: string;
  projectName: string;
}) {
  const [data, setData] = useState<NearbyResp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setData(null);
    fetch(`/api/redevelopment/nearby?id=${encodeURIComponent(projectId)}`, {
      signal: controller.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((json: NearbyResp | null) => {
        if (json) setData(json);
      })
      .catch(() => {
        /* abort/네트워크 오류 무시 */
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [projectId]);

  return (
    <div className="card rounded-2xl p-[var(--pad-card)]">
      <div className="flex items-center gap-1.5">
        <Icon name="landmark" size={16} className="text-primary" />
        <h3 className="text-[14px] font-extrabold text-ink">
          「{projectName}」 인근 매물 · 최근 실거래
        </h3>
      </div>

      {loading ? (
        <div className="mt-3 text-[12px] text-text-3">인근 정보를 불러오는 중…</div>
      ) : (
        <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* 최근 실거래 */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[12px] font-bold text-text-2">
                최근 실거래 {data?.regionLabel ? `· ${data.regionLabel}` : ""}
              </span>
            </div>
            {data && data.transactions.length > 0 ? (
              <ul className="flex flex-col divide-y divide-border">
                {data.transactions.map((t, i) => (
                  <li key={`${t.complexName}-${i}`} className="flex items-center justify-between gap-2 py-2">
                    <div className="min-w-0">
                      <div className="truncate text-[12.5px] font-semibold text-ink">
                        {t.complexName}
                      </div>
                      <div className="text-[11px] text-text-3">
                        {[pyeong(t.areaM2), t.floor ? `${t.floor}층` : "", t.contractYmd]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    </div>
                    <div className="delta-up shrink-0 text-[13px]">{t.priceLabel}</div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="rounded-[10px] border border-line bg-surface px-3 py-4 text-center text-[12px] text-text-3">
                최근 실거래 정보가 없어요.
              </div>
            )}
          </div>

          {/* 인근 매물 */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[12px] font-bold text-text-2">인근 매물 (약 2km)</span>
              <Link href="/listings/new" className="text-[11px] font-semibold text-primary">
                매물 등록 ›
              </Link>
            </div>
            {data && data.listings.length > 0 ? (
              <ul className="flex flex-col divide-y divide-border">
                {data.listings.map((l) => (
                  <li key={l.id} className="py-2">
                    <Link
                      href={`/listings/${l.id}`}
                      className="flex items-center justify-between gap-2 no-underline"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-[12.5px] font-semibold text-ink">
                          {l.complexName || "매물"}
                        </div>
                        <span className="rounded-full bg-primary-soft px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                          {TYPE_LABEL[l.listingType] ?? "매물"}
                        </span>
                      </div>
                      <div className="shrink-0 text-[13px] font-extrabold text-ink">
                        {l.priceLabel}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="rounded-[10px] border border-line bg-surface px-3 py-4 text-center text-[12px] text-text-3">
                등록된 인근 매물이 없어요.
              </div>
            )}
          </div>
        </div>
      )}

      <p className="mt-3 text-[10px] leading-[1.6] text-text-3">
        실거래는 시군구 단위 최근 매매(국토부 실거래가) 기준이며, 매물은 반경 약 2km의 등록 매물이에요.
        구역 경계와 정확히 일치하지 않을 수 있어요.
      </p>
    </div>
  );
}
