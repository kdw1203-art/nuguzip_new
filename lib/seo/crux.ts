import "server-only";

/**
 * N5 — Chrome UX Report(CrUX) 실사용자 성능 조회.
 *
 * ── 왜 필요한가 ──────────────────────────────────────────────────────────
 * 지금 릴리스 게이트에 있는 `check:perf-budget` 은 **번들 크기**를 본다. 그건
 * 실험실 지표다. 구글이 순위 신호로 쓰는 것은 실제 사용자의 기기·회선에서 측정된
 * 필드 데이터(Core Web Vitals)이고, 그 값은 우리가 로컬에서 아무리 재도 알 수 없다.
 * CrUX API 는 그 필드 데이터를 그대로 준다 — 우리 사이트를 방문한 크롬 사용자들의
 * 최근 28일 분포다.
 *
 * ── 표본이 모자라면 404 가 온다 ──────────────────────────────────────────
 * CrUX 는 익명성 보장을 위해 일정 트래픽 이상인 대상만 데이터를 준다. 그 전에는
 * HTTP 404 `CHROME_UX_REPORT_NOT_FOUND` 다. 이건 **장애가 아니라 "아직 없음"** 이다.
 * 이 구분을 잃으면 대시보드가 "LCP 0ms" 라는 세상에서 가장 빠른 사이트를 그리게
 * 된다. 그래서 반환 타입이 세 갈래다: ok · insufficient_data · error.
 *
 * ── 키 ────────────────────────────────────────────────────────────────
 * `CRUX_API_KEY` — Google Cloud 콘솔에서 "Chrome UX Report API" 를 켜고 만드는
 * 단순 API 키다. OAuth 도 서비스 계정도 필요 없고 무료다(할당량 150 QPM).
 * 키가 없으면 이 모듈은 아무것도 하지 않고 `configured: false` 만 알린다 —
 * 없는 키로 호출해 놓고 "성능 데이터 없음" 이라고 적으면 그것도 거짓말이다.
 */

const ENDPOINT = "https://chromeuxreport.googleapis.com/v1/records:queryRecord";

/** CrUX 가 다루는 기기 구분. ALL 은 formFactor 를 지정하지 않은 전체 집계다. */
export type CruxFormFactor = "PHONE" | "DESKTOP" | "ALL";

export type CruxOutcome =
  | { status: "ok"; metrics: CruxMetrics; period: { first: string; last: string } }
  /** CrUX 표본 미달 — 데이터가 "아직" 없는 것이지 나쁜 것이 아니다. */
  | { status: "insufficient_data" }
  | { status: "error"; detail: string };

export interface CruxMetrics {
  lcpP75Ms: number | null;
  inpP75Ms: number | null;
  fcpP75Ms: number | null;
  ttfbP75Ms: number | null;
  clsP75: number | null;
  /** 각 지표의 "good" 구간 비율(0~100). 분포를 남겨야 "간신히 통과"를 구분할 수 있다. */
  lcpGoodPct: number | null;
  inpGoodPct: number | null;
  clsGoodPct: number | null;
}

export function isCruxConfigured(): boolean {
  return Boolean(process.env.CRUX_API_KEY?.trim());
}

/* ── 응답 파싱 ─────────────────────────────────────────────────────────── */

interface RawHistogramBin {
  start?: number | string;
  end?: number | string;
  density?: number;
}
interface RawMetric {
  histogram?: RawHistogramBin[];
  percentiles?: { p75?: number | string };
}
interface RawRecord {
  record?: {
    metrics?: Record<string, RawMetric>;
    collectionPeriod?: {
      firstDate?: { year: number; month: number; day: number };
      lastDate?: { year: number; month: number; day: number };
    };
  };
}

function num(value: number | string | undefined): number | null {
  if (value === undefined) return null;
  const n = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

function p75(metric: RawMetric | undefined): number | null {
  return num(metric?.percentiles?.p75);
}

/** 히스토그램 첫 구간(= "good")의 비율. CrUX 는 항상 good/needs-improvement/poor 3구간이다. */
function goodPct(metric: RawMetric | undefined): number | null {
  const density = metric?.histogram?.[0]?.density;
  if (typeof density !== "number" || !Number.isFinite(density)) return null;
  return Math.round(density * 1000) / 10;
}

function ymd(d: { year: number; month: number; day: number } | undefined): string | null {
  if (!d) return null;
  return `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;
}

/**
 * 대상 하나의 CrUX 레코드를 가져온다.
 *
 * @param target `{ origin }` 이면 사이트 전체, `{ url }` 이면 그 URL 하나.
 *               URL 단위는 표본이 훨씬 커야 잡히므로 대개 origin 만 값이 온다.
 */
export async function fetchCruxRecord(
  target: { origin: string } | { url: string },
  formFactor: CruxFormFactor,
  signal?: AbortSignal,
): Promise<CruxOutcome> {
  const key = process.env.CRUX_API_KEY?.trim();
  if (!key) return { status: "error", detail: "CRUX_API_KEY 미설정" };

  /* formFactor 를 아예 빼면 전체 기기 집계가 온다 — 'ALL' 의 의미다. */
  const body: Record<string, unknown> = { ...target };
  if (formFactor !== "ALL") body.formFactor = formFactor;

  let res: Response;
  try {
    res = await fetch(`${ENDPOINT}?key=${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal,
    });
  } catch (e) {
    return { status: "error", detail: e instanceof Error ? e.message : String(e) };
  }

  /* 404 는 "표본 미달"이다. 다른 4xx/5xx 와 한 칸에 담으면 안 된다 —
     앞은 우리가 기다리면 해결되고, 뒤는 우리가 고쳐야 한다. */
  if (res.status === 404) return { status: "insufficient_data" };
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { status: "error", detail: `HTTP ${res.status} ${text.slice(0, 200)}` };
  }

  let json: RawRecord;
  try {
    json = (await res.json()) as RawRecord;
  } catch (e) {
    return { status: "error", detail: `응답 파싱 실패: ${e instanceof Error ? e.message : String(e)}` };
  }

  const m = json.record?.metrics ?? {};
  const lcp = m.largest_contentful_paint;
  const inp = m.interaction_to_next_paint;
  const cls = m.cumulative_layout_shift;

  const first = ymd(json.record?.collectionPeriod?.firstDate);
  const last = ymd(json.record?.collectionPeriod?.lastDate);

  return {
    status: "ok",
    metrics: {
      lcpP75Ms: p75(lcp),
      inpP75Ms: p75(inp),
      fcpP75Ms: p75(m.first_contentful_paint),
      ttfbP75Ms: p75(m.experimental_time_to_first_byte),
      clsP75: p75(cls),
      lcpGoodPct: goodPct(lcp),
      inpGoodPct: goodPct(inp),
      clsGoodPct: goodPct(cls),
    },
    /* 수집 기간을 모르면 "이번 주 수치"라고 적어 둔 값이 실제로 어느 28일을 본
       것인지 말할 수 없다. 그래서 빈 문자열이 아니라 null 로 두고 화면에서 뺀다. */
    period: { first: first ?? "", last: last ?? "" },
  };
}

/* ── Core Web Vitals 합격선 (web.dev 공식 기준) ───────────────────────── */
export const CWV_THRESHOLD = {
  lcpMs: { good: 2500, poor: 4000 },
  inpMs: { good: 200, poor: 500 },
  cls: { good: 0.1, poor: 0.25 },
} as const;

export type CwvVerdict = "good" | "needs-improvement" | "poor" | "unknown";

export function cwvVerdict(
  metric: "lcpMs" | "inpMs" | "cls",
  value: number | null,
): CwvVerdict {
  if (value === null) return "unknown";
  const t = CWV_THRESHOLD[metric];
  if (value <= t.good) return "good";
  if (value <= t.poor) return "needs-improvement";
  return "poor";
}
