import "server-only";
import { getServiceSupabase } from "@/lib/supabase/service";
import { callCodef, codefData, isCodefConfigured } from "@/lib/codef/client";
import { getCodefProduct } from "@/lib/codef/endpoints";
import { logger } from "@/lib/log";

/**
 * CODEF 응답 → public_property_records 정규화·업서트.
 *
 * 현재는 대량 시장 데이터로 즉시 유용한 "KB 시세정보(price_quote)"를 구현.
 * 나머지 상품(공시가격·실거래 등)은 endpoints.ts 에 정의돼 있으며 같은 패턴으로 확장 가능.
 * CODEF 자격 증명이 없으면 { skipped:true } 로 즉시 반환(정상 폴백).
 */

const MANWON = 10_000;
function wonFromManwon(v: unknown): number | null {
  const n = Number(String(v ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n * MANWON) : null;
}
function num(v: unknown): number | null {
  const n = Number(String(v ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

export type SyncResult = {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  dataset?: string;
  inserted?: number;
};

type PprRow = {
  dataset: string;
  complex_name: string | null;
  region_name: string | null;
  address: string | null;
  record_date: string | null;
  period: string | null;
  area_m2: number | null;
  price_low_krw: number | null;
  price_high_krw: number | null;
  deposit_krw: number | null;
  monthly_rent_krw: number | null;
  floor: string | null;
  metadata: Record<string, unknown>;
  source_file: string;
};

/** YYYYMMDD → YYYY-MM-DD (date 컬럼용). 형식이 다르면 null */
function toDate(v: unknown): string | null {
  const s = String(v ?? "").replace(/[^0-9]/g, "");
  if (s.length !== 8) return null;
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

/**
 * KB 시세정보 동기화 — 단지 식별 파라미터(query)로 CODEF 호출 후
 * 면적별 시세(resAreaPriceList)를 레코드로 적재.
 */
export async function syncKbPriceQuote(
  input: {
    complexName: string;
    regionName?: string;
    /** CODEF 시세정보 입력부(searchGbn/단지 식별 등) — 실제 파라미터는 콘솔 명세에 따름 */
    query: Record<string, unknown>;
  },
): Promise<SyncResult> {
  const product = getCodefProduct("price_quote");
  if (!product) return { ok: false, reason: "unknown product" };
  if (!isCodefConfigured()) {
    return { ok: false, skipped: true, reason: "CODEF 자격 증명 미설정" };
  }
  const sb = getServiceSupabase();
  if (!sb) return { ok: false, skipped: true, reason: "Supabase 미설정" };

  const resp = await callCodef(product.path, {
    organization: product.organization,
    ...input.query,
  });
  const data = codefData(resp);
  if (!data) {
    return { ok: false, skipped: true, reason: "응답 없음 또는 추가인증 필요" };
  }

  const fixedDate = toDate(data.resFixedDate);
  const period = String(data.resFixedDate ?? "").slice(0, 6) || null;
  const address =
    (data.commAddrRoadName as string) ??
    (data.commAddrLotNumber as string) ??
    null;
  const complexName =
    (data.resComplexName as string) ?? input.complexName ?? null;

  const areaList = Array.isArray(data.resAreaPriceList)
    ? (data.resAreaPriceList as Record<string, unknown>[])
    : [];

  const rows: PprRow[] = areaList.map((a) => ({
    dataset: product.dataset,
    complex_name: complexName,
    region_name: input.regionName ?? null,
    address,
    record_date: fixedDate,
    period,
    area_m2: num(a.resArea),
    // 매매 상·하한 평균가
    price_low_krw: wonFromManwon(a.resLowerAveragePrice),
    price_high_krw: wonFromManwon(a.resTopAveragePrice),
    // 전세 하한/월세 보증금·월세는 metadata 로도 보존
    deposit_krw: wonFromManwon(a.resSuretyAmt),
    monthly_rent_krw: wonFromManwon(a.resMonthlyRent),
    floor: a.resFloor ? String(a.resFloor) : null,
    metadata: {
      jeonseLow: wonFromManwon(a.resLowerAveragePrice1),
      jeonseHigh: wonFromManwon(a.resTopAveragePrice1),
      compositionCnt: a.resCompositionCnt ?? null,
      approvalDate: data.resApprovalDate ?? null,
      heating: data.resHeatingSystem ?? null,
      realty: data.resRealty ?? null,
    },
    source_file: product.sourceFile,
  }));

  if (rows.length === 0) {
    return { ok: true, dataset: product.dataset, inserted: 0 };
  }

  // 재적재 안전: 같은 단지·기준월의 기존 시세 레코드를 지우고 다시 넣는다(중복 방지)
  if (complexName && period) {
    await sb
      .from("public_property_records")
      .delete()
      .eq("dataset", product.dataset)
      .eq("complex_name", complexName)
      .eq("period", period);
  }
  const { error } = await sb.from("public_property_records").insert(rows);
  if (error) {
    logger.error("[codef sync] insert failed", error);
    return { ok: false, reason: error.message };
  }
  return { ok: true, dataset: product.dataset, inserted: rows.length };
}
