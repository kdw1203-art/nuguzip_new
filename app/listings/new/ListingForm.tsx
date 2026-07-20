"use client";

/* 매물 등록 폼 — POST /api/listings (authed · 3회/시간) */

import { useState } from "react";
import Link from "next/link";
import { DISTRICTS } from "@/lib/regions";

const TYPES = [
  { key: "sale", label: "매매" },
  { key: "jeonse", label: "전세" },
  { key: "monthly", label: "월세" },
] as const;

type TypeKey = (typeof TYPES)[number]["key"];

export function ListingForm() {
  const [listingType, setListingType] = useState<TypeKey>("sale");
  const [source, setSource] = useState<"owner" | "agent">("owner");
  const [complexName, setComplexName] = useState("");
  const [regionName, setRegionName] = useState("");
  const [priceManwon, setPriceManwon] = useState("");
  const [depositManwon, setDepositManwon] = useState("");
  const [monthlyManwon, setMonthlyManwon] = useState("");
  const [areaM2, setAreaM2] = useState("");
  const [floor, setFloor] = useState("");
  const [description, setDescription] = useState("");
  const [contact, setContact] = useState("");
  const [agree, setAgree] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const seoulGus = DISTRICTS["서울특별시"];

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
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
          description,
          contact,
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
        <div className="text-[16px] font-extrabold text-ink">
          매물 등록이 접수됐어요
        </div>
        <p className="text-[13px] leading-[1.7] text-text-2">
          <b>검수 후 노출됩니다 (1~2일)</b>. 형식 요건 확인이 끝나면 실매물 목록에
          공개돼요. 반려 시 사유를 안내드립니다.
        </p>
        <Link href="/listings" className="btn-primary btn-md">
          실매물 목록으로
        </Link>
      </div>
    );
  }

  const label = "mb-1.5 block text-[13px] font-bold text-ink";

  return (
    <form onSubmit={onSubmit} className="flex max-w-[640px] flex-col gap-4">
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

      {/* 유형 */}
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
            {seoulGus.map((g) => (
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
          maxLength={2000}
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
          placeholder="예: 오픈채팅 링크, 010-0000-0000 (검수 담당자·문의자에게만 공유)"
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
          허위·과장 매물이 아니며 정보의 정확성에 대한 책임이 등록자 본인에게
          있음을 확인합니다. 집주인 직접 매물은 소유 확인 절차(등기부등본 등)에
          협조하겠습니다.
        </span>
      </label>

      {error && (
        <div className="rounded-xl bg-[rgba(214,69,69,.08)] px-4 py-3 text-[13px] font-bold text-[#d64545]">
          {error}
        </div>
      )}

      <button type="submit" className="btn-primary btn-lg" disabled={submitting || !agree}>
        {submitting ? "등록 중…" : "매물 등록 접수"}
      </button>
    </form>
  );
}
