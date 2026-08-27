"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageShell } from "@/app/components/PageShell";
import { Icon } from "@/app/components/Icon";
import { EmptyState } from "@/app/components/ui/EmptyState";
import { RealEstateTools } from "./realestate-tools";
import { CalculatorNav } from "./CalculatorNav";

/* B10: 상단 섹션 탭 — 기존 대출·수익률 계산기 + 신규 부동산 계산기 */
const SECTIONS = [
  { key: "loan", label: "대출·수익률", icon: "calculator" },
  { key: "realestate", label: "부동산 계산기", icon: "repeat" },
] as const;
type Section = (typeof SECTIONS)[number]["key"];

/* 사실 우선: 예전 실거주/전세/월세 탭은 어떤 계산에도 연결돼 있지 않은 그림이었다.
   전세·월세 계산을 실제로 반영하기 전까지는 탭을 없애고 매매 전용임을 명시한다. */

/* G10 / 사실 우선: 예전 상수명은 FALLBACK_RATE("은행 평균 4.19%")였다. 어떤 은행의
   평균도 아닌 임의값을 "은행 평균"이라 부르면 사용자가 시장 금리로 읽는다.
   공시 실데이터가 없을 때는 "사용자가 조정하는 가정 금리"로만 쓰고 그렇게 표기한다. */
const ASSUMED_RATE_DEFAULT = 4.0; // 계산 시작값 (사용자가 슬라이더로 조정)

/* ── 보유주택 구분 · 대략 규칙표 ─────────────────────────────────────────
   ▸ 취득세 (주택 유상취득 · 지방세법 §11·§13의2, 2024 기준 요약 — 본세+지방교육세 근사,
     전용 85㎡ 초과 농어촌특별세 0.2%는 미반영):
     - 1주택 계열(생애최초·무주택·1주택 처분조건): 6억 이하 1.1% /
       6~9억 구간 (매매가(억)×2/3−3)%×1.1 (약 1.1→3.3% 선형) / 9억 초과 3.3%
     - 다주택: 조정대상지역 2주택 기준 8%+부가세 근사 8.4% (3주택 이상 12%는 미반영)
     - 생애최초: 12억 이하 취득 시 최대 200만원 감면 (지방세특례제한법 §36의3)
   ▸ LTV (2023.3 이후 규제 완화 기준 요약 · 금융위 발표):
     - 생애최초: 지역 무관 80%
     - 무주택·1주택 처분조건: 비규제지역 70% (규제지역 50%는 미반영)
     - 다주택: 비규제지역 60% (규제지역 30%는 미반영)
   어디까지나 대략적 구간이다 — 정확한 세율·한도는 지역(조정대상지역)·면적·개인
   상황에 따라 달라진다는 캡션을 화면에 함께 표기한다. */
const OWNERSHIPS = ["생애최초", "무주택", "1주택 처분조건", "다주택"] as const;
type Ownership = (typeof OWNERSHIPS)[number];

function ltvCapOf(o: Ownership): number {
  if (o === "생애최초") return 80;
  if (o === "다주택") return 60;
  return 70;
}

/** 취득세 추정 (만원). priceManwon: 매매가(만원). */
function acquisitionTaxOf(priceManwon: number, o: Ownership): number {
  let ratePct: number;
  if (o === "다주택") {
    ratePct = 8.4;
  } else if (priceManwon <= 60000) {
    ratePct = 1.1;
  } else if (priceManwon >= 90000) {
    ratePct = 3.3;
  } else {
    // 6~9억 구간: 본세 (매매가(억)×2/3−3)% × 1.1(지방교육세 근사)
    ratePct = ((priceManwon / 10000) * (2 / 3) - 3) * 1.1;
  }
  let tax = priceManwon * (ratePct / 100);
  if (o === "생애최초" && priceManwon <= 120000) {
    tax = Math.max(0, tax - 200); // 생애최초 감면 최대 200만원
  }
  return tax;
}

/** 표기용 취득세율 라벨 */
function acquisitionRateLabel(priceManwon: number, o: Ownership): string {
  if (o === "다주택") return "약 8.4%";
  if (priceManwon <= 60000) return "약 1.1%";
  if (priceManwon >= 90000) return "약 3.3%";
  return "약 1.1~3.3% 구간";
}

/* P2-4: 서버에서 주입되는 주담대 공시 금리 (lib/finance/mortgage-rates 결과와 동일 형태) */
export interface MortgageRateItem {
  bank: string;
  /** "3.62~5.13%" 형식 (없으면 "-") */
  variable: string;
  fixed: string;
  note: string;
}
export interface MortgageRatesProp {
  live: boolean;
  source: string;
  asOf: string | null;
  rates: MortgageRateItem[];
}

/* G10: 여기 있던 BANK_ROWS(K은행 4.31%→3.89%, S은행, H은행, 보금자리론 고정 4.10% 등)는
   전부 지어낸 금리·우대조건이었다. 대출 은행 선택에 직접 영향을 주는 수치라
   "예시" 배지로 감쌀 성질이 아니어서 삭제하고, 공시가 없으면 원출처로 안내한다. */

function formatEok(manwon: number): string {
  const eok = Math.floor(manwon / 10000);
  const rest = Math.round(manwon % 10000);
  if (eok === 0) return `${rest.toLocaleString()}만원`;
  if (rest === 0) return `${eok}억원`;
  return `${eok}억 ${rest.toLocaleString()}만원`;
}

/** "3.62~5.13%" → { min: 3.62, max: 5.13 } · 파싱 불가 시 null */
function parseRateRange(s: string): { min: number; max: number } | null {
  const nums = s.match(/\d+(?:\.\d+)?/g)?.map(Number).filter(Number.isFinite);
  if (!nums || nums.length === 0) return null;
  return { min: Math.min(...nums), max: Math.max(...nums) };
}

/** 공시 금리표에서 대표 금리(은행별 변동금리 중간값 평균, 없으면 고정) 도출 — 실패 시 null */
function deriveAverageRate(rates: MortgageRateItem[]): number | null {
  const mids: number[] = [];
  for (const r of rates) {
    const range = parseRateRange(r.variable) ?? parseRateRange(r.fixed);
    if (range) mids.push((range.min + range.max) / 2);
  }
  if (mids.length === 0) return null;
  const avg = mids.reduce((a, b) => a + b, 0) / mids.length;
  return Math.round(avg * 100) / 100;
}

/** 원리금균등 월 상환액 (만원) */
function monthlyPaymentOf(loanManwon: number, annualRatePct: number, years: number): number {
  if (loanManwon <= 0) return 0;
  const r = annualRatePct / 100 / 12;
  const n = years * 12;
  if (r === 0) return loanManwon / n;
  return (loanManwon * r) / (1 - Math.pow(1 + r, -n));
}

type LoanCalcResult = {
  monthlyPayment: number; // 만원
  totalInterest: number; // 만원
  totalRepayment: number; // 만원
};

/* 입력값 로컬 저장 — "기기에 저장"이 말뿐이던 것을 실제 동작으로. */
const STORAGE_KEY = "nuguzip:calculator:loan:v1";
type StoredInputs = {
  price: number;
  loanRatio: number;
  years: number;
  assumedRate: number;
  incomeManwon: number | null;
  cashManwon: number | null;
  existingDebtMonthly: number;
  ownership: Ownership;
};

function isOwnership(v: unknown): v is Ownership {
  return typeof v === "string" && (OWNERSHIPS as readonly string[]).includes(v);
}

/* [D69] 매매가 슬라이더의 경계 — 프리필도 같은 경계를 쓴다.
   따로 적으면 URL 로 20억을 넘겨받았을 때 화면 숫자(정상)와 슬라이더 손잡이
   (최대치에 붙어 있음)가 서로 다른 말을 한다. */
const PRICE_MIN_MANWON = 30_000;
const PRICE_MAX_MANWON = 200_000;

const numInputCls =
  "w-[110px] rounded-lg border border-line bg-bg px-3 py-[7px] text-right text-[13px] font-extrabold text-ink outline-none focus:border-primary";

export function CalculatorClient({ mortgage }: { mortgage: MortgageRatesProp }) {
  const [section, setSection] = useState<Section>("loan");
  const [price, setPrice] = useState(84000); // 만원
  /* [D69] 이 금액이 어디서 왔는지 — 실거래에서 넘겨받았을 때만 값이 있다.
     계산기의 기본값 84,000만원은 우리가 정한 예시 숫자다. 단지 화면에서
     "이 시세로 계산"을 눌러 온 사람에게는 그게 **자기 단지의 실거래가**여야
     하고, 그 사실을 화면이 말해야 숫자를 믿을 수 있다. */
  const [priceFrom, setPriceFrom] = useState<string | null>(null);
  const [priceClamped, setPriceClamped] = useState(false);
  const [loanRatio, setLoanRatio] = useState(40); // %
  const [years, setYears] = useState(30);
  const [serverCalc, setServerCalc] = useState<LoanCalcResult | null>(null);

  /* 내 정보 — 예전엔 소득 7,000만·현금 5.5억·기존대출 35만이 하드코딩된 그림이었다.
     실제 입력 필드로 바꾸고, 판정(적정/주의/위험)도 입력값으로만 계산한다. */
  const [incomeManwon, setIncomeManwon] = useState<number | null>(null); // 연 소득(만원)
  const [cashManwon, setCashManwon] = useState<number | null>(null); // 보유 현금(만원)
  const [existingDebtMonthly, setExistingDebtMonthly] = useState(0); // 기존 대출 월 상환(만원)
  const [ownership, setOwnership] = useState<Ownership>("무주택");

  // P2-4: 공시 실데이터가 있으면 은행별 변동금리 중간값 평균을 그대로 쓰고,
  // 없으면 사용자가 직접 정하는 가정 금리로만 계산한다(시장 금리라고 주장하지 않는다).
  const liveRate = mortgage.live ? deriveAverageRate(mortgage.rates) : null;
  const rateIsLive = liveRate !== null;
  const [assumedRate, setAssumedRate] = useState(ASSUMED_RATE_DEFAULT);
  const rate = liveRate ?? assumedRate;

  /* 저장된 입력 복원 (마운트 1회) — SSR 불일치를 피하려 effect에서 수행 */
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw) as Partial<StoredInputs>;
      if (typeof s.price === "number" && s.price >= 30000 && s.price <= 200000) setPrice(s.price);
      if (typeof s.loanRatio === "number" && s.loanRatio >= 0 && s.loanRatio <= 80)
        setLoanRatio(s.loanRatio);
      if (typeof s.years === "number" && [10, 20, 30, 40].includes(s.years)) setYears(s.years);
      if (typeof s.assumedRate === "number" && s.assumedRate >= 2 && s.assumedRate <= 9)
        setAssumedRate(s.assumedRate);
      if (typeof s.incomeManwon === "number" && s.incomeManwon > 0)
        setIncomeManwon(s.incomeManwon);
      if (typeof s.cashManwon === "number" && s.cashManwon > 0) setCashManwon(s.cashManwon);
      if (typeof s.existingDebtMonthly === "number" && s.existingDebtMonthly >= 0)
        setExistingDebtMonthly(s.existingDebtMonthly);
      if (isOwnership(s.ownership)) setOwnership(s.ownership);
    } catch {
      /* 프라이빗 모드 등 접근 불가 — 기본값으로 진행 */
    }
  }, []);

  /* [D69] URL 프리필 — 저장된 입력보다 **뒤에** 적용해서 URL 이 이긴다.
     단지 화면에서 실거래가를 들고 넘어왔는데 지난번에 만지던 숫자가 그대로
     떠 있으면, 링크를 누른 의미가 사라진다.

     ?price= 는 **만원** 단위다(화면 입력 단위와 같게 맞춘다 — 원 단위로 받으면
     0을 네 개 더 붙인 링크가 언젠가 생긴다). 범위 밖 값은 무시한다. */
  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      const p = Number(sp.get("price"));
      if (Number.isFinite(p) && p > 0) {
        /* 슬라이더 밖 금액은 **잘라서** 넣고, 잘랐다는 사실을 아래에 적는다.
           그냥 무시하면 "이 시세로 계산"을 눌렀는데 아무 일도 안 일어난다. */
        const clamped = Math.min(PRICE_MAX_MANWON, Math.max(PRICE_MIN_MANWON, Math.round(p)));
        setPrice(clamped);
        const from = (sp.get("from") ?? "").trim().slice(0, 40);
        setPriceFrom(from || null);
        setPriceClamped(clamped !== Math.round(p));
      }
      const sec = sp.get("section");
      if (sec === "realestate" || sec === "loan") setSection(sec);
    } catch {
      /* URL 이 깨졌으면 기본값으로 진행 */
    }
  }, []);

  /* 입력 변경 시 디바운스 저장 */
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        window.localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            price,
            loanRatio,
            years,
            assumedRate,
            incomeManwon,
            cashManwon,
            existingDebtMonthly,
            ownership,
          } satisfies StoredInputs),
        );
      } catch {
        /* no-op */
      }
    }, 500);
    return () => clearTimeout(t);
  }, [price, loanRatio, years, assumedRate, incomeManwon, cashManwon, existingDebtMonthly, ownership]);

  /* 보유주택 구분에 따른 LTV 상한 — 대출 비율은 상한 이내로만 */
  const ltvCap = ltvCapOf(ownership);
  const effectiveRatio = Math.min(loanRatio, ltvCap);

  const loan = price * (effectiveRatio / 100);
  const clientMonthly = monthlyPaymentOf(loan, rate, years); // 만원 (폴백)

  // 구 API /api/loan/calc 서버 계산 연결 — 실패 시 클라이언트 계산 폴백 유지
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/loan/calc", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            price, // 만원 단위 그대로 전달 (응답도 만원 단위)
            down: price - price * (effectiveRatio / 100),
            ltv: ltvCap,
            annualRate: rate,
            years,
            method: "annuity",
          }),
          signal: controller.signal,
        });
        if (!res.ok) throw new Error("loan calc failed");
        const data = (await res.json()) as Partial<LoanCalcResult>;
        if (typeof data.monthlyPayment === "number") {
          setServerCalc({
            monthlyPayment: data.monthlyPayment,
            totalInterest: data.totalInterest ?? 0,
            totalRepayment: data.totalRepayment ?? 0,
          });
        }
      } catch {
        if (!controller.signal.aborted) setServerCalc(null); // 폴백: 클라이언트 계산
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [price, effectiveRatio, ltvCap, years, rate]);

  const monthly = serverCalc ? serverCalc.monthlyPayment : clientMonthly;

  /* 취득세 — 3.3% 고정이 아니라 보유주택 구분·가격 구간의 대략 규칙표로 */
  const acqTax = acquisitionTaxOf(price, ownership);
  const acqRateLabel = acquisitionRateLabel(price, ownership);
  const cashNeeded = price - loan + acqTax;

  /* 판정 — 소득을 입력했을 때만 계산 (기존 대출 월 상환액 포함) */
  const monthlyTotal = monthly + Math.max(0, existingDebtMonthly);
  const burden =
    incomeManwon && incomeManwon > 0
      ? Math.round(((monthlyTotal * 12) / incomeManwon) * 100)
      : null;
  const burdenLabel =
    burden === null ? null : burden <= 30 ? "적정" : burden <= 40 ? "주의" : "위험";
  const cashGap = cashManwon && cashManwon > 0 ? cashManwon - cashNeeded : null;

  /* CTA 조건 전달 — 임장노트 메모 프리셋 · 시나리오 딥링크 파라미터 */
  const memoDraft = [
    "대출 계산 조건 (누구집 계산기)",
    `- 매매가 ${formatEok(price)} · 구분 ${ownership}`,
    `- 대출 ${effectiveRatio}% (${formatEok(Math.round(loan))}) · 금리 ${rate}%${rateIsLive ? "(공시 평균)" : "(가정)"} · ${years}년 원리금균등`,
    `- 월 원리금 약 ${Math.round(monthly)}만원 · 취득세(${acqRateLabel}) 포함 필요 현금 약 ${formatEok(Math.round(cashNeeded))}`,
  ].join("\n");
  const noteHref = `/notes/new?memo=${encodeURIComponent(memoDraft)}`;
  const scenarioHref = `/analysis/scenario?ltv=${effectiveRatio}&rate=${rate}${
    incomeManwon && incomeManwon > 0 ? `&income=${incomeManwon}` : ""
  }`;

  const parseManwon = (v: string): number | null => {
    const n = Number(v.replace(/[^0-9]/g, ""));
    return Number.isFinite(n) && n > 0 ? n : null;
  };

  return (
    <PageShell breadcrumb="투자 도구 › 대출·수익률 계산기" title="대출·수익률 계산기" wide>
      {/* [개선 #6] 계산기 랜딩 5장 상호 링크 — 중개보수·전월세 전환·갭·수익률이
          각자 검색 랜딩으로 분리됐다(방문 실측 상위 진입 경로의 SEO 확장). */}
      <CalculatorNav current="/calculator" />
      {/* 사실 우선: 예전 문구("기기에만 저장 · 외부 전송 없음")는 거짓이었다 — 계산은
          서버 API(/api/loan/calc)로 전송된다. 실제 동작 그대로 고지한다. */}
      <div className="rise-in -mt-2 mb-4 text-[11px] text-text-3">
        입력값은 계산에만 사용하고 서버에 저장하지 않아요 · 입력 내용은 이 브라우저에 저장돼
        다음 방문 때 복원돼요
      </div>

      <div className="rise-in mb-4 flex gap-2">
        {SECTIONS.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setSection(s.key)}
            className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] ${
              section === s.key
                ? "bg-ink font-bold text-surface"
                : "border border-line bg-surface font-semibold text-text-2"
            }`}
          >
            <Icon name={s.icon} size={15} />
            {s.label}
          </button>
        ))}
      </div>

      {section === "realestate" && <RealEstateTools />}

      {section === "loan" && (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[400px_minmax(0,1fr)]">
        {/* ---------- 입력 (9j 좌측 + 6h 슬라이더) ---------- */}
        <div className="flex flex-col gap-3">
          {/* 실거주/전세/월세 탭 제거 — 계산에 반영되지 않는 선택지를 두지 않는다 */}
          <div className="rise-in text-[11px] font-semibold text-text-3">
            매매(주택담보대출) 전용 계산기예요 — 전세·월세 비용 비교는 준비 중이에요.
          </div>

          <div className="rise-in-1 card flex flex-col gap-2.5 rounded-[18px] p-[18px]">
            <div className="text-sm font-extrabold text-ink">1. 내 정보</div>
            <div className="-mt-1 text-[11px] text-text-3">
              소득·현금은 이 기기에서만 쓰여요. 소득을 입력하면 부담률 판정이 계산돼요.
            </div>
            <label className="flex items-center justify-between text-[13px]">
              <span className="text-text-2">연 소득 (세전)</span>
              <span className="flex items-center gap-1">
                <input
                  inputMode="numeric"
                  value={incomeManwon != null ? incomeManwon.toLocaleString("ko-KR") : ""}
                  onChange={(e) => setIncomeManwon(parseManwon(e.target.value))}
                  placeholder="예: 7,000"
                  aria-label="연 소득 (만원)"
                  className={numInputCls}
                />
                <span className="text-xs font-bold text-text-2">만원</span>
              </span>
            </label>
            <label className="flex items-center justify-between text-[13px]">
              <span className="text-text-2">보유 현금 (예적금·주식)</span>
              <span className="flex items-center gap-1">
                <input
                  inputMode="numeric"
                  value={cashManwon != null ? cashManwon.toLocaleString("ko-KR") : ""}
                  onChange={(e) => setCashManwon(parseManwon(e.target.value))}
                  placeholder="예: 55,000"
                  aria-label="보유 현금 (만원)"
                  className={numInputCls}
                />
                <span className="text-xs font-bold text-text-2">만원</span>
              </span>
            </label>
            <label className="flex items-center justify-between text-[13px]">
              <span className="text-text-2">기존 대출 월 상환액</span>
              <span className="flex items-center gap-1">
                <input
                  inputMode="numeric"
                  value={existingDebtMonthly > 0 ? existingDebtMonthly.toLocaleString("ko-KR") : ""}
                  onChange={(e) => setExistingDebtMonthly(parseManwon(e.target.value) ?? 0)}
                  placeholder="없으면 비움"
                  aria-label="기존 대출 월 상환액 (만원)"
                  className={numInputCls}
                />
                <span className="text-xs font-bold text-text-2">만원</span>
              </span>
            </label>
            <div className="flex items-center gap-2 border-t border-divider pt-2">
              <span className="w-11 text-xs text-text-2">구분</span>
              <div className="flex flex-wrap gap-1.5">
                {OWNERSHIPS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setOwnership(c)}
                    aria-pressed={ownership === c}
                    className={`rounded-full px-3 py-1.5 text-xs ${
                      ownership === c
                        ? "border-[1.5px] border-primary bg-primary-soft font-bold text-primary"
                        : "border border-line bg-surface text-text-2"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
            <div className="text-[10px] leading-[1.6] text-text-3">
              구분에 따라 취득세·LTV 상한을 대략 구간으로 반영해요 (현재 {ownership}: LTV{" "}
              {ltvCap}% · 취득세 {acqRateLabel}). 정확한 세율·한도는 지역(조정대상지역)·
              면적·개인 상황에 따라 달라요.
            </div>
          </div>

          <div className="rise-in-2 card flex flex-col gap-3 rounded-[18px] p-[18px]">
            <div className="text-sm font-extrabold text-ink">2. 대상 매물 · 조건</div>
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-text-2">매매가</span>
              <span className="text-base font-extrabold text-ink">{formatEok(price)}</span>
            </div>
            {/* [D69] 이 숫자의 출처. 기본값(8.4억)은 우리가 정한 예시이고,
                단지 화면에서 넘어온 값은 그 단지의 실거래가다 — 둘은 믿을 근거가
                전혀 다르므로 화면이 구분해서 말해야 한다. */}
            {priceFrom && (
              <div className="-mt-1.5 rounded-[10px] bg-primary-soft px-2.5 py-1.5 text-[11px] text-text-1">
                <b className="text-primary">{priceFrom}</b> 실거래가를 넣었어요
                {priceClamped && " (계산기 범위에 맞춰 조정)"} · 아래에서 바꿔도 돼요
              </div>
            )}
            <input
              type="range"
              min={PRICE_MIN_MANWON}
              max={PRICE_MAX_MANWON}
              step={1000}
              value={price}
              onChange={(e) => setPrice(Number(e.target.value))}
              className="w-full accent-[#1d4fd8]"
              aria-label="매매가"
            />
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-text-2">
                대출 비율{" "}
                <span className="text-[11px] text-text-3">(상한 {ltvCap}%)</span>
              </span>
              <span className="text-base font-extrabold text-ink">{effectiveRatio}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={ltvCap}
              step={1}
              value={effectiveRatio}
              onChange={(e) => setLoanRatio(Number(e.target.value))}
              className="w-full accent-[#1d4fd8]"
              aria-label="대출 비율"
            />
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[13px] text-text-2">
                금리{" "}
                <span className="text-[11px] text-text-3">
                  {rateIsLive ? "(공시 평균)" : "(직접 입력한 가정치)"}
                </span>
              </span>
              <span className="text-base font-extrabold text-primary">{rate}%</span>
            </div>
            {/* 공시 실데이터가 없으면 금리를 사용자가 직접 정한다 — 임의값을 시장 금리처럼 굳혀두지 않는다. */}
            {!rateIsLive && (
              <input
                type="range"
                min={2}
                max={9}
                step={0.05}
                value={assumedRate}
                onChange={(e) => setAssumedRate(Number(e.target.value))}
                className="w-full accent-[#1d4fd8]"
                aria-label="가정 금리"
              />
            )}
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-text-2">상환 기간</span>
              <div className="flex gap-1">
                {[10, 20, 30, 40].map((y) => (
                  <button
                    key={y}
                    type="button"
                    onClick={() => setYears(y)}
                    className={`rounded-full px-2.5 py-1 text-xs ${
                      years === y
                        ? "bg-ink font-bold text-surface"
                        : "border border-line bg-surface text-text-2"
                    }`}
                  >
                    {y}년
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 계산 결과 (6h 다크 패널) */}
          <div className="rise-in-3 ai-panel flex flex-col gap-2.5 rounded-[20px] p-[18px] shadow-[0_14px_36px_rgba(16,28,54,.22)]">
            <div className="flex items-baseline justify-between">
              <span className="text-[13px] text-ai-muted">
                월 원리금{" "}
                <span className="text-[10px]">
                  {serverCalc ? "· 서버 계산" : "· 간이 계산"}
                </span>
              </span>
              <span className="text-2xl font-extrabold text-white">{Math.round(monthly)}만원</span>
            </div>
            {serverCalc && (
              <div className="flex justify-between text-xs text-ai-muted">
                <span>총 이자 ({years}년)</span>
                <span className="font-bold text-ai-text">{formatEok(serverCalc.totalInterest)}</span>
              </div>
            )}
            <div className="flex justify-between text-xs text-ai-muted">
              <span>필요 현금 (취득세 {acqRateLabel} 포함)</span>
              <span className="font-bold text-ai-text">{formatEok(Math.round(cashNeeded))}</span>
            </div>
            {cashGap !== null && (
              <div className="flex justify-between text-xs text-ai-muted">
                <span>보유 현금 대비</span>
                <span className={`font-bold ${cashGap >= 0 ? "text-ai-text" : "text-[#ff9d9d]"}`}>
                  {cashGap >= 0
                    ? `충족 (+${formatEok(Math.round(cashGap))})`
                    : `부족 (−${formatEok(Math.round(-cashGap))})`}
                </span>
              </div>
            )}
            {burden !== null && burdenLabel !== null ? (
              <div className="flex justify-between text-xs text-ai-muted">
                <span>
                  소득 대비 부담 (연 {incomeManwon?.toLocaleString("ko-KR")}만
                  {existingDebtMonthly > 0 ? " · 기존 대출 포함" : ""})
                </span>
                <span className="font-bold text-ai-accent">
                  {burden}% · {burdenLabel}
                </span>
              </div>
            ) : (
              <div className="text-[11px] text-ai-muted">
                연 소득을 입력하면 소득 대비 부담률과 적정/주의/위험 판정이 계산돼요.
              </div>
            )}
          </div>

          <Link
            href={noteHref}
            className="rise-in-4 flex items-center justify-between rounded-[14px] bg-primary-soft px-4 py-[13px]"
          >
            <span className="text-[13px] font-bold text-primary">
              이 조건으로 임장노트에 저장
            </span>
            <span className="text-sm font-extrabold text-primary">›</span>
          </Link>

          {/* 계산기→시나리오 연결 (15h) — 현재 조건(대출비율·금리·소득)을 딥링크로 전달 */}
          <Link
            href={scenarioHref}
            className="rise-in-5 block text-center text-[13px] font-bold text-primary"
          >
            이 조건으로 시장·대출 시나리오 보기 ›
          </Link>
        </div>

        {/* ---------- 결과 상세 (9j 우측) ---------- */}
        <div className="flex flex-col gap-3">
          {/* 사실 우선: 슬라이더 입력과 무관하게 고정돼 있던 결과를 실제 입력 기반 계산으로 교체 */}
          <div className="rise-in-1 grid gap-3 md:grid-cols-3">
            <div className="ai-panel rounded-2xl p-[18px]">
              <div className="text-[11px] text-ai-muted">최대 대출 (LTV {ltvCap}%)</div>
              <div className="mt-1 text-[23px] font-extrabold text-ai-accent">
                {formatEok(Math.round(price * (ltvCap / 100)))}
              </div>
              <div className="mt-[3px] text-[10px] text-ai-muted">
                {ownership} 기준 대략 상한 · 규제지역·DSR·소득요건은 은행 심사 별도
              </div>
            </div>
            <div className="card rounded-2xl p-[18px]">
              <div className="text-[11px] text-text-3">선택한 대출액</div>
              <div className="mt-1 text-[23px] font-extrabold text-ink">
                {formatEok(Math.round(loan))}
              </div>
              <div className="mt-[3px] text-[10px] text-text-3">대출 비율 {effectiveRatio}%</div>
            </div>
            <div className="card rounded-2xl p-[18px]">
              <div className="text-[11px] text-text-3">월 원리금 (선택 조건)</div>
              <div className="mt-1 text-[23px] font-extrabold text-primary">
                {Math.round(monthly)}만원
              </div>
              <div className="mt-[3px] text-[10px] text-primary">
                금리 {rate}% · {years}년 원리금균등
              </div>
            </div>
          </div>

          {/* P2-4: 은행별 금리 — 공시 실데이터(변동/고정 min~max) 또는 예시 표 */}
          <div className="rise-in-2 card flex flex-col gap-1 overflow-x-auto rounded-[18px] px-5 py-[18px]">
            <div className="mb-1.5 flex items-baseline justify-between">
              <span className="flex items-center gap-1.5 text-sm font-extrabold text-ink">
                3. 은행별 금리 비교{" "}
                <span className="text-[11px] font-medium text-text-3">
                  {mortgage.live
                    ? `주담대 공시 금리${mortgage.asOf ? ` · ${mortgage.asOf} 기준` : ""}`
                    : "공시 미연동"}
                </span>
              </span>
            </div>
            {mortgage.live ? (
              <div className="min-w-[540px]">
                <div className="grid grid-cols-[1.2fr_1fr_1fr_1fr] gap-2 border-b border-divider py-2 text-[11px] text-text-3">
                  <span>은행</span>
                  <span className="text-center">변동금리</span>
                  <span className="text-center">고정금리</span>
                  <span className="text-center">월 원리금 (최저 변동)</span>
                </div>
                {mortgage.rates.map((row, i) => {
                  const minVar =
                    parseRateRange(row.variable)?.min ?? parseRateRange(row.fixed)?.min ?? null;
                  const best = i === 0;
                  return (
                    <div
                      key={row.bank}
                      className={`grid grid-cols-[1.2fr_1fr_1fr_1fr] items-center gap-2 border-b border-divider py-2.5 text-xs last:border-b-0 ${
                        best ? "rounded-lg bg-[rgba(29,79,216,.04)]" : ""
                      }`}
                    >
                      <span className={`pl-1.5 font-bold ${best ? "text-primary" : "text-text-1"}`}>
                        {row.bank}
                        {best ? " · 최저" : ""}
                      </span>
                      <span
                        className={`text-center font-extrabold ${best ? "text-primary" : "text-text-1"}`}
                      >
                        {row.variable}
                      </span>
                      <span className="text-center font-bold text-text-1">{row.fixed}</span>
                      <span className="text-center font-extrabold text-ink">
                        {minVar !== null && loan > 0
                          ? `${Math.round(monthlyPaymentOf(loan, minVar, years))}만`
                          : "—"}
                      </span>
                    </div>
                  );
                })}
                <div className="mt-2 text-[11px] text-text-3">
                  금리 출처: {mortgage.source}
                  {mortgage.asOf ? ` · 공시 기준월 ${mortgage.asOf}` : ""} · 월 원리금은 현재 입력한
                  대출액({formatEok(Math.round(loan))})·{years}년 원리금균등 기준 참고 계산이며 실제
                  조건은 은행 심사에 따라 달라집니다
                </div>
              </div>
            ) : (
              <EmptyState
                icon="bar"
                title="은행별 공시 금리를 아직 불러올 수 없어요"
                desc="금융감독원 공시 연동 전이라 은행별 금리를 표시하지 않습니다. 지어낸 금리를 보여주는 대신, 원출처에서 직접 확인해 주세요. 위 계산은 직접 정한 가정 금리를 쓴 참고 계산입니다."
                action={{
                  label: "금융상품 한눈에에서 비교하기",
                  href: "https://finlife.fss.or.kr",
                }}
              />
            )}
          </div>

          {/* 사실 우선: 임의 가정(+8% 상승·손익분기·연 수익률 등) 기반 수익률 시뮬레이션과
              특정 수치를 단정하던 AI 판단 보조를 제거. 시세 상승 전망은 사실이 아니므로 표시하지 않음. */}
          <div className="rise-in-3 card flex flex-col gap-1.5 rounded-[18px] px-5 py-[18px]">
            <div className="text-sm font-extrabold text-ink">참고 안내</div>
            <p className="text-[12px] leading-relaxed text-text-2">
              위 금액은 입력한 매매가·대출 비율·금리·기간에 따른 원리금균등 계산 결과예요.
              취득세·LTV는 보유주택 구분에 따른 대략적 구간(취득세 1.1~3.3% / 다주택 8.4%,
              LTV 60~80%)으로만 반영했고, 정확한 세율·한도는 지역(조정대상지역)·전용면적·개인
              상황에 따라 달라요. 실제 대출 한도와 금리는 소득·DSR·주택 수 등 은행 심사에 따라
              달라지고, 정책대출(보금자리론·디딤돌) 자격이 우선 검토됩니다. 향후 시세
              상승·수익률은 확정된 사실이 아니므로 표시하지 않아요.
            </p>
          </div>
        </div>
      </div>
      )}
    </PageShell>
  );
}
