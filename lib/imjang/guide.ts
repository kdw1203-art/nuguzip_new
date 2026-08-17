import "server-only";

import { getReadOnlySupabase } from "@/lib/newui/supabase-read";
import {
  findTxRegionBySlug,
  listTxRegions,
  type TxRegionSummary,
} from "@/lib/market/tx-bands";
import { aggregateComplexRows, type ComplexBandRow, type ImjangComplex } from "./aggregate";

/* 지역 임장 가이드 데이터 조립 (전략 정본 §4-2).
 *
 * 지역·밀도 기준은 /tx 실거래 랜딩과 같은 원천(listTxRegions, minTx=10)을
 * 그대로 쓴다 — 얇은 페이지를 새로 정의하지 않기 위해서다. 여기서 더하는 것은
 * "단지 단위 합산"(구간 행 → 임장 후보 순위) 하나뿐이다.
 *
 * 실패 규율: null 은 "그런 지역이 없다"(→ 404)일 때만. 조회 실패는 던진다 —
 * 장애를 404 로 바꾸면 크롤러에게 "이 URL 은 없어졌다"고 신고하는 꼴이다
 * (app/tx/[region]/page.tsx 의 같은 규칙). */

export interface ImjangGuide {
  region: TxRegionSummary;
  /** 면적대 구간에 정리된 매매 기준, 거래 많은 순 상위 단지 */
  topComplexes: ImjangComplex[];
}

/** 가이드 인덱스용 지역 목록 — 거래 많은 순. */
export async function listImjangRegions(limit = 60): Promise<TxRegionSummary[]> {
  const regions = await listTxRegions();
  return regions
    .slice()
    .sort((a, b) => b.txCount - a.txCount || a.name.localeCompare(b.name, "ko"))
    .slice(0, Math.max(1, limit));
}

export async function getImjangGuide(slug: string): Promise<ImjangGuide | null> {
  const region = await findTxRegionBySlug(slug);
  if (!region) return null;

  const sb = getReadOnlySupabase();
  if (!sb) {
    throw new Error("tx_band_complex_source 를 읽을 수단이 없습니다 — Supabase 접속 정보 미설정.");
  }
  const { data, error } = await sb
    .from("tx_band_complex_source")
    .select("complex_name, tx_count, avg_krw, max_krw, min_krw, latest_ym")
    .eq("region_name", region.name)
    .eq("band_kind", "area")
    .order("tx_count", { ascending: false })
    .limit(400);
  if (error) {
    throw new Error(`임장 후보 단지 조회 실패 (${region.name}) — ${error.message}`);
  }

  const num = (v: number | string | null | undefined): number => {
    const n = typeof v === "string" ? Number(v) : (v ?? 0);
    return Number.isFinite(n) ? Number(n) : 0;
  };
  const rows: ComplexBandRow[] = ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    name: String(r.complex_name ?? ""),
    txCount: num(r.tx_count as number | string | null),
    avgKrw: num(r.avg_krw as number | string | null),
    minKrw: num(r.min_krw as number | string | null),
    maxKrw: num(r.max_krw as number | string | null),
    latestYm: r.latest_ym ? String(r.latest_ym) : null,
  }));

  return { region, topComplexes: aggregateComplexRows(rows, 10) };
}
