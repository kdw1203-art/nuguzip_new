"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "@/app/components/Icon";

/**
 * 지도 매물 마커 클릭 시 뜨는 미리보기 패널(하단 시트).
 * /api/map/listing?id= 를 호출해 사진·가격·핵심정보를 보여주고, 상세로 이동 링크 제공.
 * 화면 이탈 없이 지도 위에서 매물을 훑어볼 수 있게 한다.
 */

type Preview = {
  id: string;
  listingType: string;
  listingTypeLabel: string;
  complexName: string | null;
  regionName: string | null;
  priceLabel: string;
  areaLabel: string | null;
  floor: number | null;
  description: string | null;
  thumbnailUrl: string | null;
  ownerVerified: boolean;
  boosted: boolean;
};

export function ListingPreviewPanel({
  listingId,
  onClose,
}: {
  listingId: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<Preview | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");

  useEffect(() => {
    const controller = new AbortController();
    setState("loading");
    setData(null);
    fetch(`/api/map/listing?id=${encodeURIComponent(listingId)}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("not found"))))
      .then((json: Preview) => {
        setData(json);
        setState("ok");
      })
      .catch(() => {
        if (!controller.signal.aborted) setState("error");
      });
    return () => controller.abort();
  }, [listingId]);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[55] flex justify-center px-3 pb-[max(12px,env(safe-area-inset-bottom))]">
      <div className="glass-strong pointer-events-auto w-full max-w-[440px] rounded-2xl border border-line p-3 shadow-xl [animation:riseIn_200ms_var(--ease-out)_backwards]">
        <div className="flex items-start gap-3">
          {/* 썸네일 */}
          <div className="h-[68px] w-[68px] shrink-0 overflow-hidden rounded-xl bg-[rgba(127,140,158,.12)]">
            {data?.thumbnailUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={data.thumbnailUrl}
                alt=""
                className="h-full w-full object-cover"
                loading="lazy"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-text-3">
                <Icon name="house" size={22} />
              </div>
            )}
          </div>

          {/* 본문 */}
          <div className="min-w-0 flex-1">
            {state === "loading" ? (
              <div className="py-3 t-sub text-text-3">매물 정보를 불러오는 중…</div>
            ) : state === "error" || !data ? (
              <div className="py-3 t-sub text-text-3">매물 정보를 불러올 수 없어요.</div>
            ) : (
              <>
                <div className="flex items-center gap-1.5">
                  <span className="rounded-full bg-primary-soft chip-pad t-sub font-bold text-primary">
                    {data.listingTypeLabel}
                  </span>
                  {data.ownerVerified ? (
                    <span className="rounded-full bg-[rgba(14,159,110,.12)] chip-pad t-caption font-bold text-success">
                      소유확인
                    </span>
                  ) : null}
                  {data.boosted ? (
                    <span className="rounded-full bg-[rgba(245,166,35,.14)] chip-pad t-caption font-bold text-warning">
                      부스트
                    </span>
                  ) : null}
                </div>
                <div className="mt-1 truncate t-section text-ink">
                  {data.priceLabel}
                </div>
                <div className="truncate t-sub font-semibold text-text-1">
                  {data.complexName || "매물"}
                </div>
                <div className="truncate t-sub text-text-3">
                  {[data.regionName, data.areaLabel, data.floor ? `${data.floor}층` : ""]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              </>
            )}
          </div>

          {/* 닫기 */}
          <button
            type="button"
            aria-label="닫기"
            onClick={onClose}
            className="press relative -mr-1 -mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-text-3 after:absolute after:-inset-2 after:content-[''] active:bg-[rgba(29,79,216,.08)]"
          >
            <Icon name="x" size={16} />
          </button>
        </div>

        {state === "ok" && data ? (
          <div className="mt-2.5 flex items-center gap-2">
            <Link
              href={`/listings/${data.id}`}
              className="btn-primary flex-1 rounded-xl py-2.5 text-center t-body"
            >
              상세 보기
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}
