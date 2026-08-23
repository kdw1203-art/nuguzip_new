import type { LiveToolContext } from "@/lib/ai/live-context";

/* [AI-03·04·08·19·21·26] 인사이트 블록 — 라이브 컨텍스트 → 구조화 판정.
 *
 * 전부 순수 함수다: 입력이 같으면 출력이 같고, DB·시계를 직접 만지지 않는다.
 * 골든셋 회귀 테스트(AI-07, tests/ai-insight.test.ts)가 이 파일을 잠근다 —
 * 판정 규칙을 바꾸면 테스트 스냅샷 diff 로 "무엇이 달라졌는지"가 드러난다.
 * 임계값은 상수로 노출해 화면 캡션과 테스트가 같은 숫자를 쓴다.
 */

/* ── [AI-03] 불확실성 표기 표준 ──────────────────────────────────────── */

export const UNCERTAINTY = {
  /** 이 표본 미만이면 단정 대신 "판단 불가(표본 부족)" */
  minSample: 5,
  /** 이 표본 미만이면 값에 "표본 적음" 주의를 붙인다 */
  thinSample: 30,
  /** 데이터가 이 일수보다 오래되면 "오래된 데이터" 주의 */
  staleDays: 120,
} as const;

export type Confidence = "ok" | "thin" | "insufficient" | "stale";

export function judgeConfidence(
  sample: number | null | undefined,
  ageDays: number | null | undefined,
): Confidence {
  if (sample != null && sample < UNCERTAINTY.minSample) return "insufficient";
  if (ageDays != null && ageDays > UNCERTAINTY.staleDays) return "stale";
  if (sample != null && sample < UNCERTAINTY.thinSample) return "thin";
  return "ok";
}

export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  ok: "",
  thin: "표본 적음 — 참고용",
  insufficient: "판단 불가(표본 부족)",
  stale: "오래된 데이터 — 해석 주의",
};

/* ── [AI-19] 투자 진단 레이더 5축 (0~100) ────────────────────────────── */

export interface RadarAxis {
  key: "momentum" | "liquidity" | "supply" | "field" | "macro";
  label: string;
  /** 0~100 · null = 데이터 없음(축을 그리지 않고 "데이터 없음"으로 말한다) */
  score: number | null;
  basis: string;
}

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(n)));

export function diagnosisRadar(ctx: LiveToolContext): RadarAxis[] {
  const snap = ctx.region?.snapshot ?? null;

  /* 모멘텀: 월간 변동률 -3%~+3% → 0~100 (0% = 50) */
  const momentum =
    snap?.saleChangeMonthly != null
      ? clamp(50 + (snap.saleChangeMonthly / 3) * 50)
      : null;

  /* 유동성: 월 거래량 0~300건 → 0~100 (지역 규모 보정 전 단순 척도 — 근거 표기) */
  const liquidity =
    snap?.tradeCount != null ? clamp((snap.tradeCount / 300) * 100) : null;

  /* 공급 부담(역방향): 입주 예정 세대 0→100점, 3,000세대+→0점 */
  const supply =
    ctx.supply != null
      ? clamp(100 - (ctx.supply.upcomingHouseholds / 3000) * 100)
      : null;

  /* 현장 정성: 이웃 노트 평균 0~10 → 0~100 */
  const field = ctx.notes?.avgScore != null ? clamp(ctx.notes.avgScore * 10) : null;

  /* 거시(역방향 혼합): 기준금리 1%→90 · 5%→10, 미분양 있으면 -10 보정 */
  let macro: number | null = null;
  if (ctx.macro?.baseRatePct != null) {
    macro = clamp(100 - ((ctx.macro.baseRatePct - 1) / 4) * 80 - 10 * 0);
    const unsold = ctx.region?.demographics?.unsoldUnits;
    if (unsold != null && unsold > 500) macro = clamp(macro - 10);
  }

  return [
    { key: "momentum", label: "가격 모멘텀", score: momentum, basis: snap ? `월간 변동 ${snap.saleChangeMonthly ?? "?"}%` : "지역 시세 스냅샷 없음" },
    { key: "liquidity", label: "거래 유동성", score: liquidity, basis: snap?.tradeCount != null ? `월 거래 ${snap.tradeCount}건` : "거래량 데이터 없음" },
    { key: "supply", label: "공급 여유", score: supply, basis: ctx.supply ? `입주 예정 ${ctx.supply.upcomingHouseholds.toLocaleString("ko-KR")}세대` : "입주 예정 데이터 없음" },
    { key: "field", label: "현장 정성", score: field, basis: ctx.notes?.avgScore != null ? `이웃 노트 ${ctx.notes.sample}건 평균 ${ctx.notes.avgScore}점` : "공개 노트 없음" },
    { key: "macro", label: "거시 환경", score: macro, basis: ctx.macro?.baseRatePct != null ? `기준금리 ${ctx.macro.baseRatePct}%` : "금리 데이터 없음" },
  ];
}

/* ── [AI-21] 리스크 플래그 ───────────────────────────────────────────── */

export const RISK_THRESHOLDS = {
  tradeDrop: 10, // 월 거래 10건 미만 = 유동성 경고
  wolseShareHigh: 55, // 월세 비중 55%+ = 전세 수요 약화 신호
  supplyHeavy: 1500, // 입주 예정 1,500세대+ = 공급 부담
  unsoldHigh: 500, // 미분양 500호+ = 소화 부진
  jeonseRatioHigh: 80, // 전세가율 80%+ = 갭 리스크(역전 주의)
} as const;

export interface RiskFlag {
  key: string;
  level: "warn" | "info";
  title: string;
  detail: string;
}

export function riskFlags(ctx: LiveToolContext): RiskFlag[] {
  const flags: RiskFlag[] = [];
  const snap = ctx.region?.snapshot;

  if (snap?.tradeCount != null && snap.tradeCount < RISK_THRESHOLDS.tradeDrop) {
    flags.push({
      key: "liquidity",
      level: "warn",
      title: "거래 유동성 낮음",
      detail: `최근 월 거래 ${snap.tradeCount}건 — 팔고 싶을 때 못 파는 위험이 커집니다.`,
    });
  }
  if (
    ctx.rent?.wolseSharePct != null &&
    ctx.rent.wolseSharePct >= RISK_THRESHOLDS.wolseShareHigh
  ) {
    flags.push({
      key: "wolse",
      level: "info",
      title: "월세 전환 비중 높음",
      detail: `신고 기준 월세 비중 ${ctx.rent.wolseSharePct}% — 전세 레버리지 전략의 전제가 약해집니다.`,
    });
  }
  if (ctx.supply && ctx.supply.upcomingHouseholds >= RISK_THRESHOLDS.supplyHeavy) {
    flags.push({
      key: "supply",
      level: "warn",
      title: "입주 물량 부담",
      detail: `예정 입주 ${ctx.supply.upcomingHouseholds.toLocaleString("ko-KR")}세대 — 입주장 전후 전세가 출렁임에 대비해야 합니다.`,
    });
  }
  const unsold = ctx.region?.demographics?.unsoldUnits;
  if (unsold != null && unsold >= RISK_THRESHOLDS.unsoldHigh) {
    flags.push({
      key: "unsold",
      level: "warn",
      title: "미분양 누적",
      detail: `미분양 ${unsold.toLocaleString("ko-KR")}호 — 신축 소화가 더딘 지역입니다.`,
    });
  }
  if (
    snap?.jeonseRatio != null &&
    snap.jeonseRatio >= RISK_THRESHOLDS.jeonseRatioHigh
  ) {
    flags.push({
      key: "gapRisk",
      level: "warn",
      title: "전세가율 과열",
      detail: `전세가율 ${snap.jeonseRatio}% — 역전세·보증금 미반환 리스크 구간입니다.`,
    });
  }
  return flags;
}

/* ── [AI-26] 매수 타이밍 신호등 ─────────────────────────────────────── */

export interface TimingSignal {
  key: "price" | "volume" | "supply";
  label: string;
  state: "green" | "yellow" | "red" | "na";
  basis: string;
}

export function timingSignals(ctx: LiveToolContext): TimingSignal[] {
  const snap = ctx.region?.snapshot;

  const priceState: TimingSignal["state"] =
    snap?.saleChangeMonthly == null
      ? "na"
      : snap.saleChangeMonthly <= -0.5
        ? "green"
        : snap.saleChangeMonthly < 0.8
          ? "yellow"
          : "red";

  const volState: TimingSignal["state"] =
    snap?.tradeCount == null
      ? "na"
      : snap.tradeCount >= 100
        ? "red"
        : snap.tradeCount >= 30
          ? "yellow"
          : "green";

  const supState: TimingSignal["state"] = !ctx.supply
    ? "na"
    : ctx.supply.upcomingHouseholds >= RISK_THRESHOLDS.supplyHeavy
      ? "green"
      : ctx.supply.upcomingHouseholds > 0
        ? "yellow"
        : "red";

  return [
    {
      key: "price",
      label: "가격 흐름",
      state: priceState,
      basis:
        snap?.saleChangeMonthly != null
          ? `월간 ${snap.saleChangeMonthly}% — ${priceState === "green" ? "조정 구간(협상 여지)" : priceState === "red" ? "상승 가속(추격 매수 주의)" : "보합"}`
          : "데이터 없음",
    },
    {
      key: "volume",
      label: "거래 열기",
      state: volState,
      basis:
        snap?.tradeCount != null
          ? `월 ${snap.tradeCount}건 — ${volState === "green" ? "한산(급매 협상 유리)" : volState === "red" ? "과열(호가 강세)" : "보통"}`
          : "데이터 없음",
    },
    {
      key: "supply",
      label: "입주 대기",
      state: supState,
      basis: ctx.supply
        ? `${ctx.supply.upcomingHouseholds.toLocaleString("ko-KR")}세대 예정 — ${supState === "green" ? "입주장 매물 증가 기대" : "물량 제한적"}`
        : "데이터 없음",
    },
  ];
}

/* ── [AI-04] 반대 시나리오 — 결론이 틀리는 조건 ─────────────────────── */

export function counterScenarios(ctx: LiveToolContext): string[] {
  const out: string[] = [];
  if (ctx.supply && ctx.supply.upcomingHouseholds > 0) {
    out.push(
      `예정 입주 ${ctx.supply.upcomingHouseholds.toLocaleString("ko-KR")}세대가 일정대로 들어오면 전세가·매매가가 일시적으로 눌릴 수 있습니다.`,
    );
  }
  if (ctx.macro?.baseRatePct != null) {
    out.push(
      `기준금리가 현재 ${ctx.macro.baseRatePct}%에서 0.5%p 이상 오르면 이자 부담 가정이 깨져 수익률 계산을 다시 해야 합니다.`,
    );
  }
  const snap = ctx.region?.snapshot;
  if (snap?.saleChangeMonthly != null && snap.saleChangeMonthly > 0) {
    out.push(
      "최근 상승이 소수 신고가 거래에 의한 것이라면(표본 확인), 추세가 아니라 착시일 수 있습니다.",
    );
  }
  if (out.length === 0) {
    out.push("입주 물량·금리·거래량 중 어느 축이든 데이터가 없는 상태의 판단은 그 축의 변화에 취약합니다.");
  }
  return out.slice(0, 3);
}

/* ── [AI-08] 수치 환각 가드 — LLM 서술 속 미승인 숫자 검출 ──────────── */

const NUM_RE = /\d[\d,]*(?:\.\d+)?/g;

/** 컨텍스트·입력에서 "언급 허용" 숫자 집합을 만든다 (콤마 제거·소수 2자리 반올림 키) */
export function buildNumberWhitelist(values: unknown[]): Set<string> {
  const set = new Set<string>();
  const addNum = (n: number) => {
    if (!Number.isFinite(n)) return;
    set.add(String(Math.round(n * 100) / 100));
    set.add(String(Math.round(n)));
    /* 억/만 환산 표기도 허용 (1230000000 → 12.3 / 123000) */
    if (Math.abs(n) >= 1e8) addOnce(n / 1e8);
    if (Math.abs(n) >= 1e4) addOnce(n / 1e4);
  };
  const addOnce = (n: number) => {
    set.add(String(Math.round(n * 100) / 100));
    set.add(String(Math.round(n * 10) / 10));
    set.add(String(Math.round(n)));
  };
  const walk = (v: unknown) => {
    if (typeof v === "number") addNum(v);
    else if (typeof v === "string") {
      for (const m of v.matchAll(NUM_RE)) addNum(Number(m[0].replace(/,/g, "")));
    } else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  values.forEach(walk);
  /* 흔한 무해 숫자(연도·소형 서수·백분율 스케일)는 항상 허용 */
  for (let y = 2000; y <= 2035; y++) set.add(String(y));
  for (let i = 0; i <= 12; i++) set.add(String(i));
  ["50", "100", "1000"].forEach((s) => set.add(s));
  return set;
}

export interface NumberGuardResult {
  ok: boolean;
  /** 화이트리스트에 없던 숫자들 (최대 8개) */
  violations: string[];
}

export function guardLlmNumbers(
  markdown: string,
  whitelist: Set<string>,
): NumberGuardResult {
  const found = new Set<string>();
  for (const m of markdown.matchAll(NUM_RE)) {
    const raw = m[0].replace(/,/g, "");
    const n = Number(raw);
    if (!Number.isFinite(n)) continue;
    const keys = [String(Math.round(n * 100) / 100), String(Math.round(n * 10) / 10), String(Math.round(n))];
    if (!keys.some((k) => whitelist.has(k))) found.add(m[0]);
    if (found.size >= 8) break;
  }
  return { ok: found.size === 0, violations: [...found] };
}
