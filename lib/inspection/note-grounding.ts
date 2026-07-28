/**
 * 임장노트 심화 분석의 **근거 수집기** (서버 전용).
 *
 * 사용자가 쓴 노트만으로는 "문제점·투자·실거래·금융"까지 떠먹여 줄 수 없다.
 * 그렇다고 없는 숫자를 지어내면 그 순간 이 서비스는 못 쓰는 물건이 된다.
 * 그래서 심화 분석은 **여기서 모은 실제 데이터**만 재료로 쓴다.
 *
 * 이 파일의 유일한 규칙: **못 읽은 것을 없는 것으로 바꾸지 않는다.**
 * 그래서 모든 소스를 `Grounded<T>` 로 감싸고 네 가지 상태를 구분한다.
 *   ok      값이 있다
 *   none    조회에 성공했고, 값이 없다 (= "없다"고 말해도 되는 유일한 상태)
 *   unknown 값이 비었는데 못 읽은 건지 없는 건지 구분할 수 없다
 *   failed  조회가 실패했다 (이유를 함께 남긴다)
 *
 * `unknown` 이 필요한 이유: lib/market/supply.ts · lib/finance/mortgage-rates.ts
 * 같은 일부 로더는 내부에서 오류를 잡아 빈 배열로 되돌려준다. 그 층에서는
 * 이미 실패와 빈 값이 합쳐져 버렸으므로, 여기서 "없음"이라고 단정하면
 * 내가 모르는 것을 아는 척하는 것이 된다.
 */
import type { AreaBandRow, ComplexRow, RegionRelative } from "@/lib/complex/complex-store";
import type { ComplexTransactionRow } from "@/lib/complex/complex-store";
import {
  encodeComplexId,
  getAreaBands,
  getRegionRelative,
  getTransactionHistory,
  searchComplexes,
} from "@/lib/complex/complex-store";
import type { AnalysisRegionSnapshot } from "@/lib/ai/market-insight";
import { resolveRegionSnapshotByName } from "@/lib/ai/market-insight";
import type { MarketTemp, TrendResult } from "@/lib/market/temperature";
import { computeRegionTemperature, findTemperatureRegion } from "@/lib/market/temperature";
import type { SupplyItem } from "@/lib/market/supply";
import { getSupplyForArea } from "@/lib/market/supply";
import type { BaseRate } from "@/lib/market/base-rate";
import { getBaseRate } from "@/lib/market/base-rate";
import type { MortgageRatesResult } from "@/lib/finance/mortgage-rates";
import { getMortgageRates } from "@/lib/finance/mortgage-rates";
import type { PriceAnalysisResult } from "@/lib/inspection/price-analysis";
import { analyzePrice } from "@/lib/inspection/price-analysis";
import type {
  InspectionIntent,
  InspectionPublicContext,
} from "@/lib/inspection/public-data-context-shared";
import { parseDistrict } from "@/lib/inspection/public-data-context-shared";
import { getInspectionPublicContext } from "@/lib/inspection/public-data-context";

export type GroundingStatus = "ok" | "none" | "unknown" | "failed";

export type Grounded<T> = {
  status: GroundingStatus;
  value: T | null;
  /** 사람이 읽는 사유. status 가 failed·unknown 일 때만 채운다. */
  reason: string | null;
};

const OK = <T>(value: T): Grounded<T> => ({ status: "ok", value, reason: null });
const NONE = <T>(): Grounded<T> => ({ status: "none", value: null, reason: null });
const UNKNOWN = <T>(reason: string): Grounded<T> => ({ status: "unknown", value: null, reason });
const FAILED = <T>(reason: string): Grounded<T> => ({ status: "failed", value: null, reason });

function errText(err: unknown): string {
  if (err instanceof Error) return err.message;
  return typeof err === "string" ? err : "원인 불명";
}

/**
 * 던지는 로더용. 예외는 failed, 빈 값은 none 으로 정확히 갈린다.
 * `isEmpty` 를 준 경우에만 none 판정을 한다.
 */
async function strict<T>(
  label: string,
  run: () => Promise<T | null | undefined>,
  isEmpty?: (v: T) => boolean,
): Promise<Grounded<T>> {
  try {
    const v = await run();
    if (v === null || v === undefined) return NONE<T>();
    if (isEmpty?.(v)) return NONE<T>();
    return OK(v);
  } catch (err) {
    return FAILED<T>(`${label} 조회 실패: ${errText(err)}`);
  }
}

/**
 * 실패를 빈 값으로 삼켜서 돌려주는 로더용. 빈 값이 나오면 none 이라고
 * 단정하지 않고 unknown 으로 남긴다 — 그 층에서 이미 구분이 사라졌다.
 */
async function lenient<T>(
  label: string,
  run: () => Promise<T | null | undefined>,
  isEmpty: (v: T) => boolean,
): Promise<Grounded<T>> {
  try {
    const v = await run();
    if (v === null || v === undefined || isEmpty(v)) {
      return UNKNOWN<T>(`${label}: 값이 비어 있습니다 (미보유인지 조회 실패인지 구분 불가)`);
    }
    return OK(v);
  } catch (err) {
    return FAILED<T>(`${label} 조회 실패: ${errText(err)}`);
  }
}

export type TemperatureGrounding = {
  regionLabel: string;
  temp: MarketTemp;
  trend: TrendResult | null;
};

export type NoteGrounding = {
  /** 노트 지역 문자열에서 뽑아낸 시·군·구 */
  district: string;
  aptName: string | null;
  intent: InspectionIntent;
  collectedAt: string;
  /** 단지 식별에 성공했을 때의 합성 id (실거래 기반) */
  complexId: string | null;

  regionSnapshot: Grounded<AnalysisRegionSnapshot>;
  complex: Grounded<ComplexRow>;
  regionRelative: Grounded<RegionRelative>;
  areaBands: Grounded<AreaBandRow[]>;
  txHistory: Grounded<ComplexTransactionRow[]>;
  priceView: Grounded<PriceAnalysisResult>;
  temperature: Grounded<TemperatureGrounding>;
  supply: Grounded<SupplyItem[]>;
  publicContext: Grounded<InspectionPublicContext>;
  baseRate: Grounded<BaseRate>;
  mortgage: Grounded<MortgageRatesResult>;
};

export type CollectGroundingInput = {
  region: string;
  aptName?: string | null;
  intent?: InspectionIntent;
};

/**
 * 단지명으로 실거래 기반 단지를 찾는다. 이름이 정확히 같은 행을 먼저 고르고,
 * 없으면 서로 포함 관계인 행을 고른다. 그래도 없으면 **고르지 않는다** —
 * 엉뚱한 단지의 실거래를 이 노트의 근거로 붙이는 쪽이 훨씬 나쁘다.
 */
function pickComplex(rows: ComplexRow[], aptName: string): ComplexRow | null {
  const q = aptName.trim();
  if (!q) return null;
  const exact = rows.find((r) => r.name.trim() === q);
  if (exact) return exact;
  const loose = rows.find((r) => r.name.includes(q) || q.includes(r.name));
  return loose ?? null;
}

/**
 * 노트 한 건에 붙일 수 있는 실제 데이터를 한 번에 모은다.
 * 소스 하나가 죽어도 나머지는 그대로 온다 — 전부 개별로 감싼다.
 */
export async function collectNoteGrounding(input: CollectGroundingInput): Promise<NoteGrounding> {
  const district = parseDistrict(input.region ?? "");
  const aptName = (input.aptName ?? "").trim() || null;
  const intent: InspectionIntent = input.intent ?? "실거주";
  const collectedAt = new Date().toISOString();

  /* 1단계: 뒤따르는 조회의 입력이 되는 것부터. 지역 스냅샷은 regionId 를,
     단지 검색은 complexId 를 만들어 준다. */
  const [regionSnapshot, complexHit] = await Promise.all([
    strict("지역 시세 스냅샷", () => resolveRegionSnapshotByName(input.region ?? "")),
    aptName
      ? strict<ComplexRow>("단지 검색", async () => {
          const rows = await searchComplexes(aptName, district || undefined, 8);
          return pickComplex(rows, aptName);
        })
      : Promise.resolve(NONE<ComplexRow>()),
  ]);

  const complexId = complexHit.value
    ? encodeComplexId(complexHit.value.district || district, complexHit.value.name)
    : aptName && district
      ? encodeComplexId(district, aptName)
      : null;

  const tempRegion = regionSnapshot.value
    ? findTemperatureRegion(regionSnapshot.value.regionId)
    : null;

  /* 2단계: 나머지는 전부 병렬. 하나가 느려도 다른 축은 살아 있어야 한다. */
  const [
    regionRelative,
    areaBands,
    txHistory,
    priceView,
    temperature,
    supply,
    publicContext,
    baseRate,
    mortgage,
  ] = await Promise.all([
    complexId
      ? strict("단지-지역 상대가", () => getRegionRelative(complexId))
      : Promise.resolve(NONE<RegionRelative>()),
    complexId
      ? strict("면적대별 시세", () => getAreaBands(complexId), (v) => v.length === 0)
      : Promise.resolve(NONE<AreaBandRow[]>()),
    complexId
      ? strict("실거래 이력", () => getTransactionHistory(complexId, 24), (v) => v.length === 0)
      : Promise.resolve(NONE<ComplexTransactionRow[]>()),
    strict("가격대 판정", () =>
      analyzePrice({
        district: district || undefined,
        aptName: aptName ?? undefined,
        complexId: complexId ?? undefined,
      }),
    ),
    tempRegion
      ? strict<TemperatureGrounding>("시장 온도", async () => {
          const r = await computeRegionTemperature(tempRegion);
          if (!r.temp) return null;
          return { regionLabel: tempRegion.label, temp: r.temp, trend: r.trend };
        })
      : Promise.resolve(NONE<TemperatureGrounding>()),
    district
      ? lenient("입주예정물량", () => getSupplyForArea(district, 12), (v) => v.length === 0)
      : Promise.resolve(NONE<SupplyItem[]>()),
    district
      ? strict("공공데이터 컨텍스트", () =>
          getInspectionPublicContext({
            district,
            region: input.region,
            aptName: aptName ?? undefined,
            intent,
          }),
        )
      : Promise.resolve(NONE<InspectionPublicContext>()),
    lenient("한국은행 기준금리", () => getBaseRate(), () => false),
    lenient("주택담보대출 공시", () => getMortgageRates(), (v) => v.rates.length === 0),
  ]);

  return {
    district,
    aptName,
    intent,
    collectedAt,
    complexId,
    regionSnapshot,
    complex: complexHit,
    regionRelative,
    areaBands,
    txHistory,
    priceView,
    temperature,
    supply,
    publicContext,
    baseRate,
    mortgage,
  };
}

/** 심화 분석에 실제로 쓸 재료가 하나라도 있는지. */
export function hasAnyGrounding(g: NoteGrounding): boolean {
  return [
    g.regionSnapshot,
    g.complex,
    g.regionRelative,
    g.areaBands,
    g.txHistory,
    g.priceView,
    g.temperature,
    g.supply,
    g.publicContext,
    g.baseRate,
    g.mortgage,
  ].some((s) => s.status === "ok");
}

/** 못 읽은 소스의 사유 목록 — 화면에 "왜 비었는지"를 적기 위한 것. */
export function groundingFailures(g: NoteGrounding): string[] {
  const entries: [string, Grounded<unknown>][] = [
    ["지역 시세", g.regionSnapshot],
    ["단지", g.complex],
    ["단지-지역 상대가", g.regionRelative],
    ["면적대별 시세", g.areaBands],
    ["실거래 이력", g.txHistory],
    ["가격대 판정", g.priceView],
    ["시장 온도", g.temperature],
    ["입주예정물량", g.supply],
    ["공공데이터", g.publicContext],
    ["기준금리", g.baseRate],
    ["주담대 공시", g.mortgage],
  ];
  const out: string[] = [];
  for (const [label, slot] of entries) {
    if (slot.status === "failed" || slot.status === "unknown") {
      out.push(slot.reason ?? `${label}: 확인하지 못했습니다`);
    }
  }
  return out;
}
