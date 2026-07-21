"use client";

/* 항목 B10 — 부동산 계산기 (전월세 전환 · 갭/전세가율 · 임대수익률)
   전부 클라이언트 계산 · 외부 데이터/ API 없음. 기존 계산기 UI 패턴(카드·다크 결과패널·
   풀라운드 탭·억/만원 포맷)에 맞춤. */

import { useState } from "react";
import { Icon } from "@/app/components/Icon";

const TOOLS = ["전월세 전환", "갭·전세가율", "임대수익률"] as const;
type Tool = (typeof TOOLS)[number];

/* ---------- 공통 유틸 ---------- */

/** 입력 문자열 → 숫자 (비어있거나 파싱 불가 시 0) */
function num(s: string): number {
  const n = parseFloat(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/** 만원 → "N억 N만원" (음수·0 처리 포함, 반올림) */
function formatEok(manwon: number): string {
  const neg = manwon < 0;
  const abs = Math.round(Math.abs(manwon));
  const eok = Math.floor(abs / 10000);
  const rest = abs % 10000;
  let body: string;
  if (eok === 0) body = `${rest.toLocaleString()}만원`;
  else if (rest === 0) body = `${eok}억원`;
  else body = `${eok}억 ${rest.toLocaleString()}만원`;
  return neg ? `-${body}` : body;
}

/** 만원 (소수 1자리까지) — 월세 등 소액 표시용 */
function formatMan1(manwon: number): string {
  const v = Math.round(manwon * 10) / 10;
  return `${v.toLocaleString()}만원`;
}

/** 퍼센트 (기본 2자리) */
function pct(x: number, digits = 2): string {
  return `${x.toFixed(digits)}%`;
}

/* ---------- 공통 컴포넌트 ---------- */

function Field({
  label,
  value,
  onChange,
  unit,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  unit: string;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] text-text-2">{label}</span>
      <div className="relative flex items-center">
        <input
          type="number"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="input w-full px-3 py-2.5 pr-12 text-right text-sm font-extrabold text-ink"
          aria-label={label}
        />
        <span className="pointer-events-none absolute right-3 text-[11px] font-semibold text-text-3">
          {unit}
        </span>
      </div>
    </label>
  );
}

/** 다크 결과 패널 안의 보조 행 */
function ResultRow({
  label,
  value,
  tone = "text-ai-text",
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="flex items-baseline justify-between text-xs">
      <span className="text-ai-muted">{label}</span>
      <span className={`font-bold ${tone}`}>{value}</span>
    </div>
  );
}

/** 다크 결과 패널 (기존 "계산 결과" 패널과 동일 톤) */
function ResultPanel({
  primaryLabel,
  primaryValue,
  children,
  note,
}: {
  primaryLabel: string;
  primaryValue: string;
  children?: React.ReactNode;
  note?: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="ai-panel flex flex-col gap-2.5 rounded-[20px] p-[18px] shadow-[0_14px_36px_rgba(16,28,54,.22)]">
        <div className="flex items-baseline justify-between">
          <span className="text-[13px] text-ai-muted">{primaryLabel}</span>
          <span className="text-2xl font-extrabold text-white">{primaryValue}</span>
        </div>
        {children}
      </div>
      {note && <div className="px-1 text-[11px] leading-[1.6] text-text-3">{note}</div>}
    </div>
  );
}

function ToolCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="card flex flex-col gap-3 rounded-[18px] p-[18px]">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-extrabold text-ink">{title}</span>
        <span className="text-[11px] font-medium text-text-3">{subtitle}</span>
      </div>
      {children}
    </div>
  );
}

/* ---------- 1. 전월세 전환 ---------- */

function JeonseWolse() {
  const [dir, setDir] = useState<"toWolse" | "toJeonse">("toWolse");
  const [jeonse, setJeonse] = useState("50000"); // 전세보증금 (만원)
  const [deposit, setDeposit] = useState("10000"); // 월세보증금 (만원)
  const [rate, setRate] = useState("5.5"); // 전월세전환율 (%)
  const [monthly, setMonthly] = useState("165"); // 월세 (만원) — 역산 입력

  const rateN = num(rate);
  const monthlyRent = ((num(jeonse) - num(deposit)) * (rateN / 100)) / 12; // 전세→월세
  const convertedJeonse = rateN > 0 ? num(deposit) + (num(monthly) * 12) / (rateN / 100) : 0; // 월세→전세

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ToolCard title="1. 전월세 전환" subtitle="전세 ↔ 월세 환산">
        <div className="flex gap-2">
          {(
            [
              ["toWolse", "전세 → 월세"],
              ["toJeonse", "월세 → 전세"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setDir(key)}
              className={`flex-1 rounded-full p-[9px] text-center text-[13px] ${
                dir === key
                  ? "bg-ink font-bold text-white"
                  : "border border-[#e2e7ee] bg-surface font-semibold text-text-2"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {dir === "toWolse" ? (
          <>
            <Field label="전세보증금" value={jeonse} onChange={setJeonse} unit="만원" />
            <Field label="월세보증금" value={deposit} onChange={setDeposit} unit="만원" />
          </>
        ) : (
          <>
            <Field label="월세보증금" value={deposit} onChange={setDeposit} unit="만원" />
            <Field label="월세" value={monthly} onChange={setMonthly} unit="만원" />
          </>
        )}
        <Field label="전월세 전환율" value={rate} onChange={setRate} unit="%" />
      </ToolCard>

      {dir === "toWolse" ? (
        <ResultPanel
          primaryLabel="예상 월세"
          primaryValue={formatMan1(Math.max(monthlyRent, 0))}
          note="월세 = (전세보증금 − 월세보증금) × 전환율 ÷ 12"
        >
          <ResultRow label="전환 대상 금액" value={formatEok(num(jeonse) - num(deposit))} />
          <ResultRow label="연 환산 (월세 × 12)" value={formatEok(Math.max(monthlyRent, 0) * 12)} />
        </ResultPanel>
      ) : (
        <ResultPanel
          primaryLabel="환산 전세보증금"
          primaryValue={formatEok(convertedJeonse)}
          note="전세보증금 = 월세보증금 + (월세 × 12 ÷ 전환율)"
        >
          <ResultRow label="월세보증금" value={formatEok(num(deposit))} />
          <ResultRow label="월세 자본환산분" value={formatEok(convertedJeonse - num(deposit))} />
        </ResultPanel>
      )}
    </div>
  );
}

/* ---------- 2. 갭·전세가율 ---------- */

function GapRatio() {
  const [price, setPrice] = useState("84000"); // 매매가 (만원)
  const [jeonse, setJeonse] = useState("60000"); // 전세가 (만원)

  const gap = num(price) - num(jeonse);
  const ratio = num(price) > 0 ? (num(jeonse) / num(price)) * 100 : 0;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ToolCard title="2. 갭 · 전세가율" subtitle="갭투자 실투자금 · 전세가율">
        <Field label="매매가" value={price} onChange={setPrice} unit="만원" />
        <Field label="전세가" value={jeonse} onChange={setJeonse} unit="만원" />
      </ToolCard>

      <ResultPanel
        primaryLabel="갭 (매매 − 전세)"
        primaryValue={formatEok(gap)}
        note="갭은 매매가에서 전세가를 뺀 갭투자 실투자금이며, 전세가율(전세 ÷ 매매)이 높을수록 갭이 작아집니다."
      >
        <div className="flex items-baseline justify-between text-xs">
          <span className="text-ai-muted">전세가율 (전세 ÷ 매매)</span>
          <span className="text-base font-extrabold text-[#7ea2ff]">{pct(ratio, 1)}</span>
        </div>
        <ResultRow label="매매가" value={formatEok(num(price))} />
        <ResultRow label="전세가" value={formatEok(num(jeonse))} />
      </ResultPanel>
    </div>
  );
}

/* ---------- 3. 임대수익률 ---------- */

function RentalYield() {
  const [price, setPrice] = useState("84000"); // 매매가 (만원)
  const [deposit, setDeposit] = useState("5000"); // 보증금 (만원)
  const [monthly, setMonthly] = useState("200"); // 월세 (만원)
  const [loan, setLoan] = useState("0"); // 대출금 (만원, 선택)
  const [loanRate, setLoanRate] = useState("4.0"); // 금리 (%, 선택)

  const priceN = num(price);
  const depositN = num(deposit);
  const loanN = num(loan);

  const annualRent = num(monthly) * 12; // 연 임대수익 (총)
  const annualInterest = loanN * (num(loanRate) / 100); // 연 대출이자
  const netAnnual = annualRent - annualInterest; // 대출이자 차감 순수익

  const investNoLoan = priceN - depositN; // 실투자금 (무대출)
  const equity = priceN - depositN - loanN; // 자기자본 (레버리지)

  const simpleYield = investNoLoan > 0 ? (annualRent / investNoLoan) * 100 : null;
  const leveragedYield = equity > 0 ? (netAnnual / equity) * 100 : null;

  const hasLoan = loanN > 0;
  const primaryYield = hasLoan ? leveragedYield : simpleYield;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ToolCard title="3. 임대수익률" subtitle="연 수익률 · 자기자본수익률">
        <Field label="매매가" value={price} onChange={setPrice} unit="만원" />
        <Field label="보증금" value={deposit} onChange={setDeposit} unit="만원" />
        <Field label="월세" value={monthly} onChange={setMonthly} unit="만원" />
        <div className="flex items-center gap-2 border-t border-[#f0f3f8] pt-3">
          <Icon name="landmark" size={14} className="text-text-3" />
          <span className="text-[11px] font-semibold text-text-3">대출 (선택 · 레버리지 반영)</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="대출금" value={loan} onChange={setLoan} unit="만원" />
          <Field label="금리" value={loanRate} onChange={setLoanRate} unit="%" />
        </div>
      </ToolCard>

      <ResultPanel
        primaryLabel={hasLoan ? "자기자본수익률 (레버리지)" : "연 임대수익률"}
        primaryValue={primaryYield === null ? "—" : pct(primaryYield)}
        note={
          hasLoan
            ? "자기자본수익률 = (연 임대수익 − 연 대출이자) ÷ 실투자금(매매가 − 보증금 − 대출금)"
            : "연 수익률 = 연 임대수익(월세 × 12) ÷ 실투자금(매매가 − 보증금)"
        }
      >
        <ResultRow label="연 임대수익 (월세 × 12)" value={formatEok(annualRent)} />
        {hasLoan && (
          <>
            <ResultRow label="연 대출이자" value={formatEok(annualInterest)} tone="text-[#ff9d9d]" />
            <ResultRow label="순 임대수익" value={formatEok(netAnnual)} />
          </>
        )}
        <ResultRow
          label={hasLoan ? "실투자금 (자기자본)" : "실투자금 (매매 − 보증금)"}
          value={formatEok(hasLoan ? equity : investNoLoan)}
        />
        {hasLoan && simpleYield !== null && (
          <ResultRow label="단순 수익률 (무대출 기준)" value={pct(simpleYield)} />
        )}
      </ResultPanel>
    </div>
  );
}

/* ---------- 컨테이너 ---------- */

export function RealEstateTools() {
  const [tool, setTool] = useState<Tool>("전월세 전환");

  return (
    <div className="flex flex-col gap-4">
      <div className="rise-in flex gap-2">
        {TOOLS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTool(t)}
            className={`flex-1 rounded-full p-[9px] text-center text-[13px] ${
              tool === t
                ? "bg-ink font-bold text-white"
                : "border border-[#e2e7ee] bg-surface font-semibold text-text-2"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="rise-in-1">
        {tool === "전월세 전환" && <JeonseWolse />}
        {tool === "갭·전세가율" && <GapRatio />}
        {tool === "임대수익률" && <RentalYield />}
      </div>
    </div>
  );
}
