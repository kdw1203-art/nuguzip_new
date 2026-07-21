"use client";

import { useEffect, useRef, useState } from "react";
import {
  NAVER_MAP_CLIENT_ID,
  ensureNaverPanorama,
  getNaverMapsWindow,
  loadNaverMapsScript,
  type NaverPanorama,
} from "@/lib/map/naver-maps-sdk";
import { Icon } from "@/app/components/Icon";

interface RoadviewButtonProps {
  lat: number;
  lng: number;
  /** 접근성/타이틀용 장소명 (예: 단지명·매물명) */
  label?: string;
}

/**
 * 거리뷰(로드뷰) 버튼 — 항목 A5.
 * 클릭 시 네이버 파노라마(거리뷰)를 인라인으로 토글한다.
 * - Client ID 미설정 또는 좌표가 유한하지 않으면 렌더하지 않는다(null).
 * - SDK 호출은 try/catch + 인증 실패 핸들러로 감싸, 실패 시 조용한 폴백 문구를 보인다.
 *   (파노라마 키는 도메인 잠금이라 로컬에선 인증 실패 → 폴백 문구가 정상 동작이다.)
 */
export function RoadviewButton({ lat, lng, label }: RoadviewButtonProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const panoramaRef = useRef<NaverPanorama | null>(null);

  const hasClientId = Boolean(NAVER_MAP_CLIENT_ID);
  const validCoord = Number.isFinite(lat) && Number.isFinite(lng);

  useEffect(() => {
    if (!open || !containerRef.current) return;
    let cancelled = false;
    setError(false);
    setLoading(true);

    void (async () => {
      try {
        // 도메인 잠금(로컬 등) 인증 실패는 throw 되지 않고 전역 콜백으로 통지되므로
        // loadNaverMapsScript 로 인증 실패 핸들러를 등록해 폴백을 확실히 노출한다.
        await loadNaverMapsScript(NAVER_MAP_CLIENT_ID, {
          onAuthFailure: () => {
            if (!cancelled) {
              setError(true);
              setLoading(false);
            }
          },
        });
        // 거리뷰 서브모듈 지연 로드 (모달 진입 시 1회).
        await ensureNaverPanorama(NAVER_MAP_CLIENT_ID);
        if (cancelled || !containerRef.current) return;

        const maps = getNaverMapsWindow().naver?.maps;
        if (!maps?.Panorama || !maps.LatLng) {
          throw new Error("네이버 파노라마 SDK를 사용할 수 없습니다.");
        }

        panoramaRef.current = new maps.Panorama(containerRef.current, {
          position: new maps.LatLng(lat, lng),
          pov: { pan: 0, tilt: 0, fov: 100 },
          visible: true,
        });
        if (!cancelled) setLoading(false);
      } catch {
        if (!cancelled) {
          setError(true);
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      try {
        panoramaRef.current?.destroy?.();
      } catch {
        // 정리 실패는 무시
      }
      panoramaRef.current = null;
    };
  }, [open, lat, lng]);

  // 가드: Client ID 미설정 또는 좌표 비유한 → 렌더 안 함
  if (!hasClientId || !validCoord) return null;

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title={label ? `${label} 거리뷰` : "거리뷰"}
        className="chip glass inline-flex w-fit items-center gap-1.5 px-3 py-1.5 text-[12px] font-bold text-ink"
      >
        <Icon name="map" size={16} />
        거리뷰
      </button>

      {open && (
        <div className="relative h-64 w-full overflow-hidden rounded-2xl bg-[rgba(0,0,0,.04)]">
          <div ref={containerRef} className="h-full w-full" />
          {loading && !error && (
            <div className="absolute inset-0 flex items-center justify-center text-[12px] text-text-3">
              거리뷰 불러오는 중…
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center px-4 text-center text-[12px] leading-[1.6] text-text-3">
              거리뷰를 불러올 수 없어요
            </div>
          )}
        </div>
      )}
    </div>
  );
}
