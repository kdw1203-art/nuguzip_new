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
 *
 * ── 2026-08-16 리디자인 (소유자 캡처 제보) ─────────────────────────────────
 * 1) 세로 띠 결함: 래퍼가 flex 아이템이라 패널의 w-full 이 "버튼 폭"이 됐다
 *    (단지 허브 히어로의 justify-between 행에서 ~80px 세로 띠로 렌더).
 *    래퍼를 display:contents 로 바꾸고 패널에 basis-full 을 줘, 어떤 부모
 *    (flex-wrap 행·flex-col)에서든 패널이 **한 줄 전체**를 차지하게 한다.
 * 2) "눌러도 안 나옴": 좌표가 단지 중심점이라 근처에 촬영 지점이 없으면
 *    파노라마가 빈 화면으로 초기화됐다. pano_status 를 구독해 실패를
 *    문구로 말하고, 네이버 지도 새 탭 폴백을 항상 제공한다.
 * 3) 갓 나타난 컨테이너에서 SDK 가 크기를 0 으로 읽는 문제는 초기화 직후
 *    resize 이벤트를 쏴서 재계산시킨다.
 */
export function RoadviewButton({ lat, lng, label }: RoadviewButtonProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const panoramaRef = useRef<NaverPanorama | null>(null);

  const hasClientId = Boolean(NAVER_MAP_CLIENT_ID);
  const validCoord = Number.isFinite(lat) && Number.isFinite(lng);
  const naverMapHref = `https://map.naver.com/p/search/${encodeURIComponent(
    (label ?? "").trim() || `${lat},${lng}`,
  )}`;

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

        const pano = new maps.Panorama(containerRef.current, {
          position: new maps.LatLng(lat, lng),
          pov: { pan: 0, tilt: 0, fov: 100 },
          visible: true,
        });
        panoramaRef.current = pano;

        /* 촬영 지점 탐색 실패(단지 중심 좌표 근처에 파노라마 없음)를 문구로.
           이벤트 API 가 없거나 형태가 달라도 죽지 않게 전부 옵셔널로 감싼다. */
        try {
          const ev = (maps as unknown as {
            Event?: {
              addListener?: (
                target: unknown,
                name: string,
                cb: (status: unknown) => void,
              ) => void;
            };
          }).Event;
          ev?.addListener?.(pano, "pano_status", (status) => {
            if (cancelled) return;
            if (String(status).toUpperCase() !== "OK") {
              setError(true);
            }
            setLoading(false);
          });
        } catch {
          // 상태 이벤트 구독 실패는 무시 — 아래 기본 흐름으로 진행
        }

        /* 방금 펼쳐진(직전 프레임까지 크기 0) 컨테이너에서 SDK 가 뷰포트를
           잘못 읽는 고전적 문제 — 한 프레임 뒤 resize 로 재계산을 강제한다. */
        requestAnimationFrame(() => {
          if (!cancelled) window.dispatchEvent(new Event("resize"));
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
    <div className="contents">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title={label ? `${label} 거리뷰` : "거리뷰"}
        className={`chip inline-flex w-fit shrink-0 items-center gap-1.5 px-3 py-1.5 text-[12px] font-bold transition-colors ${
          open ? "bg-ink text-white" : "glass text-ink"
        }`}
      >
        <Icon name="map" size={16} />
        {open ? "거리뷰 닫기" : "거리뷰"}
      </button>

      {open && (
        <div className="w-full basis-full">
          <div className="overflow-hidden rounded-2xl border border-line bg-surface">
            <div className="relative h-64 w-full bg-[rgba(0,0,0,.04)] md:h-80">
              <div ref={containerRef} className="h-full w-full" />
              {loading && !error && (
                <div className="absolute inset-0 flex items-center justify-center text-[12px] text-text-3">
                  거리뷰 불러오는 중…
                </div>
              )}
              {error && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center">
                  <p className="text-[12.5px] font-semibold leading-[1.6] text-text-2">
                    이 위치 근처의 거리뷰 촬영 지점을 찾지 못했어요
                  </p>
                  <a
                    href={naverMapHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="chip glass inline-flex items-center gap-1 px-3 py-1.5 text-[12px] font-bold text-primary"
                  >
                    네이버 지도에서 열기 ↗
                  </a>
                </div>
              )}
            </div>
            <div className="flex items-center justify-between gap-2 px-3.5 py-2">
              <span className="truncate text-[11px] text-text-3">
                네이버 거리뷰{label ? ` · ${label}` : ""}
              </span>
              <a
                href={naverMapHref}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 text-[11px] font-bold text-primary no-underline"
              >
                크게 보기 ↗
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
