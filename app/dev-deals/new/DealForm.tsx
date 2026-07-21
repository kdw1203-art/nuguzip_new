"use client";

/* 개발물건 등록 폼 — POST /api/dev-deals/deal (로그인 필수) */

import { useState } from "react";
import Link from "next/link";
import { DEAL_TYPES, PARTNER_FIELDS } from "@/lib/dev-deals/types";

export function DealForm() {
  const [title, setTitle] = useState("");
  const [dealType, setDealType] = useState<string>(DEAL_TYPES[0]);
  const [region, setRegion] = useState("");
  const [address, setAddress] = useState("");
  const [landAreaM2, setLandAreaM2] = useState("");
  const [grossFloorAreaM2, setGrossFloorAreaM2] = useState("");
  const [units, setUnits] = useState("");
  const [totalCostEok, setTotalCostEok] = useState("");
  const [neededPartners, setNeededPartners] = useState<string[]>([]);
  const [budgetText, setBudgetText] = useState("");
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needLogin, setNeedLogin] = useState(false);
  const [doneId, setDoneId] = useState<string | null>(null);

  function togglePartner(p: string) {
    setNeededPartners((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p],
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNeedLogin(false);
    if (title.trim().length < 2) {
      setError("제목을 2자 이상 입력해 주세요.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/dev-deals/deal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          dealType,
          region: region.trim() || null,
          address: address.trim() || null,
          landAreaM2: landAreaM2 || null,
          grossFloorAreaM2: grossFloorAreaM2 || null,
          units: units || null,
          totalCostEok: totalCostEok || null,
          neededPartners,
          budgetText: budgetText.trim() || null,
          summary: summary.trim() || null,
          description: description.trim() || null,
          contactName: contactName.trim() || null,
          contactPhone: contactPhone.trim() || null,
        }),
      });
      if (res.status === 401) {
        setNeedLogin(true);
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string; id?: string };
      if (!res.ok) {
        setError(data.error ?? "등록에 실패했어요. 잠시 후 다시 시도해 주세요.");
        return;
      }
      setDoneId(data.id ?? null);
    } catch {
      setError("네트워크 오류가 발생했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setSubmitting(false);
    }
  }

  if (doneId) {
    return (
      <div className="rise-in card flex max-w-[640px] flex-col items-start gap-3 p-6">
        <div className="text-[16px] font-extrabold text-ink">개발물건이 등록됐어요</div>
        <p className="text-[13px] leading-[1.7] text-text-2">
          협력업체가 이 물건을 발견하면 참여 문의를 보낼 수 있어요. 문의가 접수되면 등록한
          연락 수단으로 확인해 주세요.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link href={`/dev-deals/${doneId}`} className="btn-primary btn-md no-underline">
            등록한 물건 보기
          </Link>
          <Link href="/dev-deals" className="btn-outline btn-md no-underline">
            목록으로
          </Link>
        </div>
      </div>
    );
  }

  const label = "mb-1.5 block text-[13px] font-bold text-ink";

  return (
    <form onSubmit={onSubmit} className="flex max-w-[680px] flex-col gap-4">
      {/* 제목 */}
      <div>
        <label className={label} htmlFor="title">
          제목 <span className="text-[#d64545]">*</span>
        </label>
        <input
          id="title"
          className="input w-full"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="예: 강남권 노후 상가 재건축 부지 — 시공·PF 협력사 모집"
          maxLength={120}
          required
        />
      </div>

      {/* 유형 · 지역 */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="dealType">
            개발물건 유형 <span className="text-[#d64545]">*</span>
          </label>
          <select
            id="dealType"
            className="input w-full"
            value={dealType}
            onChange={(e) => setDealType(e.target.value)}
          >
            {DEAL_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={label} htmlFor="region">
            지역
          </label>
          <input
            id="region"
            className="input w-full"
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            placeholder="예: 서울 강남구"
            maxLength={60}
          />
        </div>
      </div>

      {/* 주소 */}
      <div>
        <label className={label} htmlFor="address">
          주소 (선택)
        </label>
        <input
          id="address"
          className="input w-full"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="지번·도로명 주소"
          maxLength={200}
        />
      </div>

      {/* 규모 지표 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div>
          <label className={label} htmlFor="landAreaM2">
            부지면적 (㎡)
          </label>
          <input
            id="landAreaM2"
            className="input w-full"
            type="number"
            inputMode="decimal"
            step="0.01"
            min={0}
            value={landAreaM2}
            onChange={(e) => setLandAreaM2(e.target.value)}
            placeholder="예: 3300"
          />
        </div>
        <div>
          <label className={label} htmlFor="grossFloorAreaM2">
            연면적 (㎡)
          </label>
          <input
            id="grossFloorAreaM2"
            className="input w-full"
            type="number"
            inputMode="decimal"
            step="0.01"
            min={0}
            value={grossFloorAreaM2}
            onChange={(e) => setGrossFloorAreaM2(e.target.value)}
            placeholder="예: 12000"
          />
        </div>
        <div>
          <label className={label} htmlFor="units">
            세대수
          </label>
          <input
            id="units"
            className="input w-full"
            type="number"
            inputMode="numeric"
            min={0}
            value={units}
            onChange={(e) => setUnits(e.target.value)}
            placeholder="예: 220"
          />
        </div>
      </div>

      {/* 총사업비 */}
      <div>
        <label className={label} htmlFor="totalCostEok">
          총사업비 (억원)
        </label>
        <input
          id="totalCostEok"
          className="input w-full"
          type="number"
          inputMode="decimal"
          step="0.1"
          min={0}
          value={totalCostEok}
          onChange={(e) => setTotalCostEok(e.target.value)}
          placeholder="예: 420 (= 420억)"
        />
        <p className="mt-1 text-[11px] text-text-3">
          억 단위로 입력하세요. 예상 중개수수료 구간 산정에 사용됩니다.
        </p>
      </div>

      {/* 필요 협력 분야 */}
      <div>
        <span className={label}>필요 협력 분야 (복수 선택)</span>
        <div className="flex flex-wrap gap-1.5">
          {PARTNER_FIELDS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => togglePartner(p)}
              className={`chip px-4 py-2 text-[13px] ${
                neededPartners.includes(p)
                  ? "chip-active"
                  : "bg-[rgba(255,255,255,.7)] text-text-2"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* 예산 설명 */}
      <div>
        <label className={label} htmlFor="budgetText">
          사업비·조건 메모 (선택)
        </label>
        <input
          id="budgetText"
          className="input w-full"
          value={budgetText}
          onChange={(e) => setBudgetText(e.target.value)}
          placeholder="예: 총사업비 약 420억 / PF 200억 조달 예정 / 도급 협의 가능"
          maxLength={200}
        />
      </div>

      {/* 요약 */}
      <div>
        <label className={label} htmlFor="summary">
          한 줄 요약 (선택)
        </label>
        <input
          id="summary"
          className="input w-full"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="목록·검색에 노출되는 한 줄 소개"
          maxLength={300}
        />
      </div>

      {/* 상세 설명 */}
      <div>
        <label className={label} htmlFor="description">
          상세 설명 (선택)
        </label>
        <textarea
          id="description"
          className="input min-h-[140px] w-full"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="사업 개요, 진행 단계, 인허가 현황, 협력 조건 등을 적어 주세요. 과도한 개인정보는 적지 마세요."
          maxLength={4000}
        />
      </div>

      {/* 연락처 */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="contactName">
            담당자명 (선택)
          </label>
          <input
            id="contactName"
            className="input w-full"
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            placeholder="예: 김담당"
            maxLength={60}
          />
        </div>
        <div>
          <label className={label} htmlFor="contactPhone">
            연락처 (선택)
          </label>
          <input
            id="contactPhone"
            className="input w-full"
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
            placeholder="예: 010-0000-0000 (일부만 공개 표시됩니다)"
            maxLength={40}
          />
          <p className="mt-1 text-[11px] text-text-3">
            공개 화면에는 가운데를 가린 형태로만 표시됩니다.
          </p>
        </div>
      </div>

      {needLogin && (
        <div className="rounded-xl bg-[rgba(214,69,69,.08)] px-4 py-3 text-[13px] leading-[1.7] text-[#d64545]">
          등록은 로그인 후 이용할 수 있어요.{" "}
          <Link
            href="/login?callbackUrl=/dev-deals/new"
            className="font-bold underline"
          >
            로그인 후 등록
          </Link>
        </div>
      )}

      {error && (
        <div className="rounded-xl bg-[rgba(214,69,69,.08)] px-4 py-3 text-[13px] font-bold text-[#d64545]">
          {error}
        </div>
      )}

      <button type="submit" className="btn-primary btn-lg" disabled={submitting}>
        {submitting ? "등록 중…" : "개발물건 등록"}
      </button>
    </form>
  );
}
