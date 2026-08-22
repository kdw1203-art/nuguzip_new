"use client";

import { useMemo, useState } from "react";

/* [개선 #6, 2026-08-22] 중개보수(중개수수료) 계산기.
 *
 * 요율은 공인중개사법 시행규칙 제20조의 **법정 상한요율표** 그대로다
 * (한국공인중개사협회 게시 요율표와 대조 확인, 2026-08-22).
 * - 상한이지 확정 보수가 아니다 — 실제 보수는 상한 안에서 협의로 정한다.
 * - 임대차 거래금액 = 보증금 + 월세×100. 그 값이 5천만원 미만이면
 *   보증금 + 월세×70 으로 다시 계산한다(시행규칙 산정 방식 그대로).
 * - 부가가치세(10%)는 별도다.
 * 이 사실들은 화면에 그대로 고지한다 — 계산기가 확정 금액처럼 말하면 안 된다.
 */

type DealType = "sale" | "lease";
type PropertyType = "house" | "officetel" | "other";

/** [하한(원), 상한요율, 한도액(원)|null] — 구간은 하한 이상 다음 하한 미만 */
const SALE_HOUSE: Array<[number, number, number | null]> = [
  [0, 0.006, 25_0000_0],
  [5000_0000, 0.005, 80_0000_0],
  [2_0000_0000, 0.004, null],
  [9_0000_0000, 0.005, null],
  [12_0000_0000, 0.006, null],
  [15_0000_0000, 0.007, null],
];
const LEASE_HOUSE: Array<[number, number, number | null]> = [
  [0, 0.005, 20_0000_0],
  [5000_0000, 0.004, 30_0000_0],
  [1_0000_0000, 0.003, null],
  [6_0000_0000, 0.004, null],
  [12_0000_0000, 0.005, null],
  [15_0000_0000, 0.006, null],
];

function bracketFor(table: Array<[number, number, number | null]>, amount: number) {
  let hit = table[0];
  for (const row of table) if (amount >= row[0]) hit = row;
  return hit;
}

function krw(n: number): string {
  return `${Math.round(n).toLocaleString("ko-KR")}원`;
}

const inputCls =
  "w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[14px] text-ink placeholder:text-text-3";
const chip = (on: boolean) =>
  `press rounded-full px-3.5 py-2 text-[13px] ${
    on ? "bg-ink font-bold text-white" : "border border-[#e2e7ee] bg-surface font-semibold text-text-2"
  }`;

export function BrokerageFeeCalc() {
  const [deal, setDeal] = useState<DealType>("sale");
  const [prop, setProp] = useState<PropertyType>("house");
  const [priceMan, setPriceMan] = useState("80000"); // 매매가 (만원)
  const [depositMan, setDepositMan] = useState("30000"); // 보증금 (만원)
  const [monthlyMan, setMonthlyMan] = useState("0"); // 월세 (만원)

  const result = useMemo(() => {
    const toWon = (s: string) => Math.max(0, Number(s.replace(/[^0-9.]/g, "")) || 0) * 10000;
    let amount = 0;
    let amountNote = "";
    if (deal === "sale") {
      amount = toWon(priceMan);
      amountNote = "거래금액 = 매매가";
    } else {
      const dep = toWon(depositMan);
      const mon = toWon(monthlyMan);
      amount = dep + mon * 100;
      amountNote = "거래금액 = 보증금 + 월세×100";
      if (amount < 5000_0000 && mon > 0) {
        amount = dep + mon * 70;
        amountNote = "거래금액 = 보증금 + 월세×70 (환산액 5천만원 미만 규정)";
      }
    }
    if (amount <= 0) return null;

    if (prop === "other") {
      // 주택 외(토지·상가): 0.9% 이내 협의
      return {
        amount,
        amountNote,
        rateLabel: "0.9% 이내 협의",
        fee: amount * 0.009,
        feeLabel: `최대 ${krw(amount * 0.009)}`,
        capped: false,
      };
    }
    if (prop === "officetel") {
      // 전용 85㎡ 이하·주거설비 갖춘 오피스텔: 매매 0.5% / 임대차 0.4% (한도 없음)
      const r = deal === "sale" ? 0.005 : 0.004;
      return {
        amount,
        amountNote,
        rateLabel: `${(r * 100).toFixed(1)}%`,
        fee: amount * r,
        feeLabel: `최대 ${krw(amount * r)}`,
        capped: false,
      };
    }
    const [, rate, cap] = bracketFor(deal === "sale" ? SALE_HOUSE : LEASE_HOUSE, amount);
    const raw = amount * rate;
    const fee = cap != null ? Math.min(raw, cap) : raw;
    return {
      amount,
      amountNote,
      rateLabel: `${(rate * 100).toFixed(1)}%${cap != null ? ` (한도 ${krw(cap)})` : ""}`,
      fee,
      feeLabel: `최대 ${krw(fee)}`,
      capped: cap != null && raw > cap,
    };
  }, [deal, prop, priceMan, depositMan, monthlyMan]);

  return (
    <div className="flex flex-col gap-4">
      <div className="card flex flex-col gap-3 rounded-[18px] p-[18px]">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-extrabold text-ink">중개보수 상한 계산</span>
          <span className="text-[11px] font-medium text-text-3">법정 상한요율 기준</span>
        </div>

        <div className="flex gap-2">
          <button type="button" onClick={() => setDeal("sale")} className={chip(deal === "sale")}>
            매매·교환
          </button>
          <button type="button" onClick={() => setDeal("lease")} className={chip(deal === "lease")}>
            임대차 (전세·월세)
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setProp("house")} className={chip(prop === "house")}>
            주택
          </button>
          <button
            type="button"
            onClick={() => setProp("officetel")}
            className={chip(prop === "officetel")}
          >
            오피스텔 (85㎡ 이하)
          </button>
          <button type="button" onClick={() => setProp("other")} className={chip(prop === "other")}>
            토지·상가 등
          </button>
        </div>

        {deal === "sale" ? (
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-bold text-text-2">매매가 (만원)</span>
            <input
              type="text"
              inputMode="numeric"
              value={priceMan}
              onChange={(e) => setPriceMan(e.target.value)}
              className={inputCls}
              aria-label="매매가 (만원)"
            />
          </label>
        ) : (
          <div className="grid grid-cols-2 gap-2.5">
            <label className="flex flex-col gap-1">
              <span className="text-[12px] font-bold text-text-2">보증금 (만원)</span>
              <input
                type="text"
                inputMode="numeric"
                value={depositMan}
                onChange={(e) => setDepositMan(e.target.value)}
                className={inputCls}
                aria-label="보증금 (만원)"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[12px] font-bold text-text-2">월세 (만원)</span>
              <input
                type="text"
                inputMode="numeric"
                value={monthlyMan}
                onChange={(e) => setMonthlyMan(e.target.value)}
                className={inputCls}
                aria-label="월세 (만원)"
              />
            </label>
          </div>
        )}

        {result && (
          <div className="rounded-2xl bg-bg p-4">
            <div className="text-[11px] text-text-3">{result.amountNote}</div>
            <div className="mt-0.5 text-[12px] text-text-2">
              거래금액 <b className="text-ink">{krw(result.amount)}</b> · 적용 상한요율{" "}
              <b className="text-ink">{result.rateLabel}</b>
            </div>
            <div className="mt-2 text-[22px] font-extrabold text-primary">{result.feeLabel}</div>
            <div className="mt-1 text-[11px] leading-[1.7] text-text-3">
              법정 <b>상한</b>이며 확정 보수가 아니에요 — 실제 보수는 이 금액 이내에서
              중개사와 협의해 정합니다{result.capped ? " (구간 한도액이 적용된 금액)" : ""}.
              부가가치세 10%는 별도입니다.
            </div>
          </div>
        )}
      </div>

      {/* 요율표 전문 — 계산 근거를 그대로 공개한다 (검색 사용자가 찾는 표이기도 하다) */}
      <div className="card flex flex-col gap-3 rounded-[18px] p-[18px]">
        <span className="text-sm font-extrabold text-ink">주택 중개보수 상한요율표</span>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-[12px]">
            <thead>
              <tr className="border-b border-line text-left text-[11px] text-text-3">
                <th className="py-1.5 pr-2 font-semibold">거래금액</th>
                <th className="py-1.5 pr-2 font-semibold">매매·교환</th>
                <th className="py-1.5 font-semibold">임대차</th>
              </tr>
            </thead>
            <tbody className="text-text-1">
              <tr className="border-b border-[#f0f3f8]"><td className="py-1.5 pr-2">5천만원 미만</td><td className="pr-2">0.6% · 한도 25만</td><td>0.5% · 한도 20만</td></tr>
              <tr className="border-b border-[#f0f3f8]"><td className="py-1.5 pr-2">5천만 ~ 1억</td><td className="pr-2">0.5% · 한도 80만</td><td>0.4% · 한도 30만</td></tr>
              <tr className="border-b border-[#f0f3f8]"><td className="py-1.5 pr-2">1억 ~ 2억</td><td className="pr-2">0.5% · 한도 80만</td><td>0.3%</td></tr>
              <tr className="border-b border-[#f0f3f8]"><td className="py-1.5 pr-2">2억 ~ 6억</td><td className="pr-2">0.4%</td><td>0.3%</td></tr>
              <tr className="border-b border-[#f0f3f8]"><td className="py-1.5 pr-2">6억 ~ 9억</td><td className="pr-2">0.4%</td><td>0.4%</td></tr>
              <tr className="border-b border-[#f0f3f8]"><td className="py-1.5 pr-2">9억 ~ 12억</td><td className="pr-2">0.5%</td><td>0.4%</td></tr>
              <tr className="border-b border-[#f0f3f8]"><td className="py-1.5 pr-2">12억 ~ 15억</td><td className="pr-2">0.6%</td><td>0.5%</td></tr>
              <tr><td className="py-1.5 pr-2">15억 이상</td><td className="pr-2">0.7%</td><td>0.6%</td></tr>
            </tbody>
          </table>
        </div>
        <p className="text-[11px] leading-[1.7] text-text-3">
          오피스텔(전용 85㎡ 이하·주거설비 갖춤): 매매 0.5% · 임대차 0.4%. 토지·상가 등
          주택 외: 0.9% 이내 협의. 근거: 공인중개사법 시행규칙 제20조(법정 상한요율) ·
          한국공인중개사협회 게시 요율표 대조(2026-08). 지자체 조례로 일부 다를 수 있어요.
        </p>
      </div>
    </div>
  );
}
