"use client";

/* 매물 등록 폼 — 지도에서 핀 찍어 등록 → POST /api/listings (authed · 3회/시간) */

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { NaverMap, type MapIdleInfo } from "@/components/map/NaverMap";
import { DISTRICTS } from "@/lib/regions";

const TYPES = [
  { key: "sale", label: "매매" },
  { key: "jeonse", label: "전세" },
  { key: "monthly", label: "월세" },
] as const;

type TypeKey = (typeof TYPES)[number]["key"];

/** 건물 유형(라벨) — 별도 컬럼이 없어 설명 앞에 [유형]으로 함께 저장 */
const CATEGORIES = ["아파트", "오피스텔", "빌라", "원룸", "상가"] as const;
type Category = (typeof CATEGORIES)[number];

const SEOUL_GUS = DISTRICTS["서울특별시"];
const DEFAULT_CENTER = { lat: 37.5665, lng: 126.978 };

/** 매물 사진 업로드 상한 (첫 장이 대표 이미지) */
const MAX_PHOTOS = 5;

interface GeocodeItem {
  address: string;
  roadAddress?: string;
  jibunAddress?: string;
  lat: number;
  lng: number;
}

export function ListingForm() {
  // 지도 / 위치
  const [center, setCenter] = useState(DEFAULT_CENTER);
  const [level, setLevel] = useState(6);
  const mapCenterRef = useRef(DEFAULT_CENTER);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<{ address: string; lat: number; lng: number } | null>(
    null,
  );
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoMsg, setGeoMsg] = useState<string | null>(null);

  // 폼
  const [listingType, setListingType] = useState<TypeKey>("sale");
  const [source, setSource] = useState<"owner" | "agent">("owner");
  const [category, setCategory] = useState<Category>("아파트");
  const [complexName, setComplexName] = useState("");
  const [regionName, setRegionName] = useState("");
  const [priceManwon, setPriceManwon] = useState("");
  const [depositManwon, setDepositManwon] = useState("");
  const [monthlyManwon, setMonthlyManwon] = useState("");
  const [areaM2, setAreaM2] = useState("");
  const [floor, setFloor] = useState("");
  const [description, setDescription] = useState("");
  const [contact, setContact] = useState("");
  const [thumbnailUrl, setThumbnailUrl] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [photosUploading, setPhotosUploading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [agree, setAgree] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const onIdle = useCallback((info: MapIdleInfo) => {
    mapCenterRef.current = info.center;
  }, []);

  /** 주소에서 서울 '구'를 감지해 지역 선택 자동 채움 */
  const autoRegion = useCallback((address: string) => {
    const gu = SEOUL_GUS.find((g) => address.includes(g));
    if (gu) setRegionName(gu);
  }, []);

  /** 주소 검색(정지오코딩) → 지도 이동 + 위치 확정 */
  async function searchAddress(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setGeoBusy(true);
    setGeoMsg(null);
    try {
      const res = await fetch(`/api/map/geocode?q=${encodeURIComponent(q)}`);
      const data = (await res.json().catch(() => ({}))) as { items?: GeocodeItem[] };
      const hit = data.items?.[0];
      if (!hit) {
        setGeoMsg("검색 결과가 없어요. 도로명·지번 주소로 다시 시도해 주세요.");
        return;
      }
      setCenter({ lat: hit.lat, lng: hit.lng });
      setLevel(4);
      mapCenterRef.current = { lat: hit.lat, lng: hit.lng };
      setPicked({ address: hit.address, lat: hit.lat, lng: hit.lng });
      autoRegion(hit.address);
    } catch {
      setGeoMsg("주소 검색 중 오류가 발생했어요.");
    } finally {
      setGeoBusy(false);
    }
  }

  /** 현재 지도 중심(크로스헤어 위치) → 역지오코딩으로 주소 확정 */
  async function useMapCenter() {
    const c = mapCenterRef.current;
    setGeoBusy(true);
    setGeoMsg(null);
    try {
      const res = await fetch(`/api/map/geocode?lat=${c.lat}&lng=${c.lng}`);
      const data = (await res.json().catch(() => ({}))) as { items?: GeocodeItem[] };
      const hit = data.items?.[0];
      if (!hit) {
        setGeoMsg("이 위치의 주소를 찾지 못했어요. 지도를 조금 옮겨 다시 시도해 주세요.");
        return;
      }
      setPicked({ address: hit.address, lat: c.lat, lng: c.lng });
      autoRegion(hit.address);
    } catch {
      setGeoMsg("주소 변환 중 오류가 발생했어요.");
    } finally {
      setGeoBusy(false);
    }
  }

  /** 선택한 이미지들을 POST /api/upload(folder=listings) 로 올려 URL 수집 */
  async function onPhotoFilesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ""; // 같은 파일 재선택 허용
    if (files.length === 0) return;
    setPhotoError(null);

    const remaining = MAX_PHOTOS - photos.length;
    if (remaining <= 0) {
      setPhotoError(`사진은 최대 ${MAX_PHOTOS}장까지 올릴 수 있어요.`);
      return;
    }
    const picked = files.slice(0, remaining);
    setPhotosUploading(true);
    try {
      for (const file of picked) {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("folder", "listings");
        try {
          const res = await fetch("/api/upload", { method: "POST", body: fd });
          const data = (await res.json().catch(() => ({}))) as {
            url?: string;
            error?: string;
          };
          if (!res.ok || !data.url) {
            setPhotoError(data.error ?? "사진 업로드에 실패했어요. 다시 시도해 주세요.");
            continue;
          }
          const url = data.url;
          setPhotos((prev) =>
            prev.includes(url) ? prev : [...prev, url].slice(0, MAX_PHOTOS),
          );
        } catch {
          setPhotoError("사진 업로드 중 네트워크 오류가 발생했어요.");
        }
      }
    } finally {
      setPhotosUploading(false);
    }
  }

  function removePhoto(url: string) {
    setPhotos((prev) => prev.filter((u) => u !== url));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!picked) {
      setError("지도에서 위치를 지정해 주세요. (주소 검색 또는 ‘이 위치로 주소 찾기’)");
      return;
    }
    setSubmitting(true);
    try {
      const desc = description.trim();
      const fullDescription = category ? `[${category}] ${desc}`.trim() : desc;
      const manualThumb = thumbnailUrl.trim();
      // 업로드한 사진 + (있으면) 수기 입력한 대표 URL 을 합쳐 중복 제거 (첫 장이 대표)
      const allPhotos = Array.from(
        new Set([...(manualThumb ? [manualThumb] : []), ...photos]),
      ).slice(0, MAX_PHOTOS);
      const thumb = allPhotos[0] ?? null;
      const res = await fetch("/api/listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingType,
          source,
          complexName,
          regionName,
          priceManwon: priceManwon || null,
          depositManwon: depositManwon || null,
          monthlyManwon: monthlyManwon || null,
          areaM2: areaM2 || null,
          floor: floor || null,
          description: fullDescription,
          contact,
          lat: picked.lat,
          lng: picked.lng,
          address: picked.address,
          thumbnail: thumb,
          thumbnail_url: thumb,
          photos: allPhotos,
          agreeResponsibility: agree,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "등록에 실패했어요. 잠시 후 다시 시도해 주세요.");
        return;
      }
      setDone(true);
    } catch {
      setError("네트워크 오류가 발생했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="rise-in card card-pad-sm flex max-w-[640px] flex-col items-start gap-3 py-8">
        <div className="text-[16px] font-extrabold text-ink">매물 등록이 접수됐어요</div>
        <p className="text-[13px] leading-[1.7] text-text-2">
          <b>검수 후 노출됩니다 (1~2일)</b>. 형식 요건 확인이 끝나면 실매물 목록에 공개돼요.{" "}
          <b>승인되면 포인트가 지급돼요.</b> 반려 시 사유를 안내드립니다.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link href="/my/listings" className="btn-primary btn-md">
            내 매물 보기
          </Link>
          <Link href="/listings" className="btn-outline btn-md">
            실매물 목록으로
          </Link>
        </div>
      </div>
    );
  }

  const label = "mb-1.5 block text-[13px] font-bold text-ink";

  return (
    <form onSubmit={onSubmit} className="flex max-w-[640px] flex-col gap-4">
      {/* 지도 위치 지정 */}
      <div>
        <span className={label}>
          위치 지정 <span className="text-[#d64545]">*</span>
        </span>
        <p className="mb-2 text-[12px] leading-[1.6] text-text-3">
          지도를 움직여 중앙 핀을 매물 위치에 맞춘 뒤 <b>‘이 위치로 주소 찾기’</b>를 누르거나,
          아래에서 주소를 검색하세요.
        </p>

        {/* 주소 검색 */}
        <div className="mb-2 flex gap-2">
          <input
            className="input w-full"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") searchAddress(e as unknown as React.FormEvent);
            }}
            placeholder="도로명·지번 주소 검색 (예: 강남구 테헤란로 152)"
            aria-label="주소 검색"
          />
          <button
            type="button"
            onClick={(e) => searchAddress(e as unknown as React.FormEvent)}
            disabled={geoBusy || !query.trim()}
            className="btn-outline btn-md shrink-0"
          >
            검색
          </button>
        </div>

        {/* 지도 + 크로스헤어 */}
        <div className="relative h-[320px] w-full overflow-hidden rounded-2xl">
          <NaverMap
            center={center}
            level={level}
            onIdle={onIdle}
            enableGeolocation
            geolocationButtonPosition="top-right"
            className="h-full w-full"
          />
          {/* 고정 중앙 핀(크로스헤어) — 지도 조작 방해 금지 */}
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
            <div
              className="-translate-y-[14px] text-[30px] leading-none drop-shadow-[0_2px_3px_rgba(0,0,0,.35)]"
              aria-hidden
            >
              📍
            </div>
          </div>
          {/* 위치 확정 버튼 */}
          <div className="absolute inset-x-0 bottom-0 z-20 flex justify-center p-3">
            <button
              type="button"
              onClick={useMapCenter}
              disabled={geoBusy}
              className="btn-primary btn-md shadow-lg"
            >
              {geoBusy ? "주소 찾는 중…" : "이 위치로 주소 찾기"}
            </button>
          </div>
        </div>

        {geoMsg && (
          <p className="mt-2 text-[12px] font-bold text-[#d64545]">{geoMsg}</p>
        )}
        {picked && (
          <div className="mt-2 rounded-xl bg-[rgba(29,79,216,.06)] px-3 py-2.5 text-[13px] leading-[1.6] text-[#3b56a8]">
            선택한 위치: <b className="text-ink">{picked.address}</b>
          </div>
        )}
      </div>

      {/* 등록 주체 */}
      <div>
        <span className={label}>등록 주체</span>
        <div className="flex gap-1.5">
          {(
            [
              { key: "owner", text: "집주인 직접" },
              { key: "agent", text: "중개사" },
            ] as const
          ).map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setSource(s.key)}
              className={`chip px-4 py-2 text-[13px] ${
                source === s.key ? "chip-active" : "bg-[rgba(255,255,255,.7)] text-text-2"
              }`}
            >
              {s.text}
            </button>
          ))}
        </div>
        {source === "agent" && (
          <p className="mt-1.5 text-[12px] text-text-3">
            중개사무소는{" "}
            <Link href="/partners" className="font-bold text-primary underline">
              제휴 신청
            </Link>
            을 함께 남겨 주시면 노출·프로필 혜택을 안내드려요.
          </p>
        )}
      </div>

      {/* 거래 유형 */}
      <div>
        <span className={label}>거래 유형</span>
        <div className="flex gap-1.5">
          {TYPES.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setListingType(t.key)}
              className={`chip px-4 py-2 text-[13px] ${
                listingType === t.key
                  ? "chip-active"
                  : "bg-[rgba(255,255,255,.7)] text-text-2"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* 건물 유형 */}
      <div>
        <span className={label}>건물 유형</span>
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={`chip px-4 py-2 text-[13px] ${
                category === c ? "chip-active" : "bg-[rgba(255,255,255,.7)] text-text-2"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* 단지명 · 지역 */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="complexName">
            단지명(건물명) <span className="text-[#d64545]">*</span>
          </label>
          <input
            id="complexName"
            className="input w-full"
            value={complexName}
            onChange={(e) => setComplexName(e.target.value)}
            placeholder="예: 래미안대치팰리스"
            maxLength={80}
            required
          />
        </div>
        <div>
          <label className={label} htmlFor="regionName">
            지역(서울 구)
          </label>
          <select
            id="regionName"
            className="input w-full"
            value={regionName}
            onChange={(e) => setRegionName(e.target.value)}
          >
            <option value="">선택 안 함</option>
            {SEOUL_GUS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 유형별 가격 */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {listingType === "sale" && (
          <div>
            <label className={label} htmlFor="priceManwon">
              매매가 (만원) <span className="text-[#d64545]">*</span>
            </label>
            <input
              id="priceManwon"
              className="input w-full"
              type="number"
              inputMode="numeric"
              min={1}
              value={priceManwon}
              onChange={(e) => setPriceManwon(e.target.value)}
              placeholder="예: 180000 (18억)"
              required
            />
          </div>
        )}
        {listingType !== "sale" && (
          <div>
            <label className={label} htmlFor="depositManwon">
              보증금 (만원) <span className="text-[#d64545]">*</span>
            </label>
            <input
              id="depositManwon"
              className="input w-full"
              type="number"
              inputMode="numeric"
              min={1}
              value={depositManwon}
              onChange={(e) => setDepositManwon(e.target.value)}
              placeholder="예: 50000 (5억)"
              required
            />
          </div>
        )}
        {listingType === "monthly" && (
          <div>
            <label className={label} htmlFor="monthlyManwon">
              월세 (만원) <span className="text-[#d64545]">*</span>
            </label>
            <input
              id="monthlyManwon"
              className="input w-full"
              type="number"
              inputMode="numeric"
              min={1}
              value={monthlyManwon}
              onChange={(e) => setMonthlyManwon(e.target.value)}
              placeholder="예: 150"
              required
            />
          </div>
        )}
      </div>

      {/* 면적 · 층 */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label} htmlFor="areaM2">
            전용면적 (㎡)
          </label>
          <input
            id="areaM2"
            className="input w-full"
            type="number"
            inputMode="decimal"
            step="0.01"
            min={1}
            value={areaM2}
            onChange={(e) => setAreaM2(e.target.value)}
            placeholder="예: 84.98"
          />
        </div>
        <div>
          <label className={label} htmlFor="floor">
            층
          </label>
          <input
            id="floor"
            className="input w-full"
            type="number"
            inputMode="numeric"
            value={floor}
            onChange={(e) => setFloor(e.target.value)}
            placeholder="예: 12"
          />
        </div>
      </div>

      {/* 썸네일 URL */}
      <div>
        <label className={label} htmlFor="thumbnailUrl">
          대표 사진 URL (선택)
        </label>
        <input
          id="thumbnailUrl"
          className="input w-full"
          type="url"
          inputMode="url"
          value={thumbnailUrl}
          onChange={(e) => setThumbnailUrl(e.target.value)}
          placeholder="https://... (이미지 주소를 붙여넣기, 없으면 비워두세요)"
          maxLength={500}
        />
      </div>

      {/* 매물 사진 업로드 */}
      <div>
        <span className={label}>매물 사진 (선택 · 최대 {MAX_PHOTOS}장)</span>
        <p className="mb-2 text-[12px] leading-[1.6] text-text-3">
          기기에서 사진을 골라 올리면 <b>첫 번째 사진</b>이 대표 이미지로 사용돼요.
        </p>
        <div className="flex flex-wrap gap-2">
          {photos.map((url, i) => (
            <div
              key={url}
              className="relative h-20 w-20 overflow-hidden rounded-xl border border-[rgba(0,0,0,.06)]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={`매물 사진 ${i + 1}`} className="h-full w-full object-cover" />
              {i === 0 && (
                <span className="absolute left-1 top-1 rounded-md bg-[rgba(29,79,216,.85)] px-1.5 py-0.5 text-[10px] font-bold text-white">
                  대표
                </span>
              )}
              <button
                type="button"
                onClick={() => removePhoto(url)}
                aria-label="사진 삭제"
                className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-[rgba(0,0,0,.55)] text-[13px] leading-none text-white"
              >
                ×
              </button>
            </div>
          ))}
          {photos.length < MAX_PHOTOS && (
            <label
              className={`flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-[rgba(0,0,0,.18)] text-[11px] text-text-3 ${
                photosUploading
                  ? "pointer-events-none opacity-60"
                  : "cursor-pointer hover:border-primary hover:text-primary"
              }`}
            >
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                disabled={photosUploading}
                onChange={onPhotoFilesSelected}
              />
              {photosUploading ? (
                <span>업로드 중…</span>
              ) : (
                <>
                  <span className="text-[18px] leading-none">＋</span>
                  <span>사진 추가</span>
                </>
              )}
            </label>
          )}
        </div>
        {photoError && (
          <p className="mt-2 text-[12px] font-bold text-[#d64545]">{photoError}</p>
        )}
      </div>

      {/* 설명 */}
      <div>
        <label className={label} htmlFor="description">
          설명
        </label>
        <textarea
          id="description"
          className="input min-h-[120px] w-full"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="집 상태, 입주 가능일, 옵션 등을 적어 주세요. 동·호수 등 과도한 개인정보는 적지 마세요."
          maxLength={1980}
        />
      </div>

      {/* 연락 방식 */}
      <div>
        <label className={label} htmlFor="contact">
          연락 방식
        </label>
        <input
          id="contact"
          className="input w-full"
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          placeholder="예: 오픈채팅 링크, 010-0000-0000 (로그인한 문의자에게만 노출)"
          maxLength={120}
        />
      </div>

      {/* 책임 고지 동의 */}
      <label className="flex items-start gap-2 text-[12px] leading-[1.7] text-text-2">
        <input
          type="checkbox"
          checked={agree}
          onChange={(e) => setAgree(e.target.checked)}
          className="mt-1"
          required
        />
        <span>
          허위·과장 매물이 아니며 정보의 정확성에 대한 책임이 등록자 본인에게 있음을
          확인합니다. 집주인 직접 매물은 소유 확인 절차(등기부등본 등)에 협조하겠습니다.
        </span>
      </label>

      {error && (
        <div className="rounded-xl bg-[rgba(214,69,69,.08)] px-4 py-3 text-[13px] font-bold text-[#d64545]">
          {error}
        </div>
      )}

      <button
        type="submit"
        className="btn-primary btn-lg"
        disabled={submitting || !agree || photosUploading}
      >
        {submitting ? "등록 중…" : photosUploading ? "사진 업로드 중…" : "매물 등록 접수"}
      </button>
    </form>
  );
}
