/**
 * POST /api/analysis/complex-compare — 비교 트레이 단지들의 실거래 요약.
 *
 * `/analysis/compare` 화면이 "단지별 항목 비교표는 준비 중"이라는 카드로
 * 남아 있던 자리를 채우는 실데이터 집계다. 단지 id(base64url of region+name)를
 * 디코드해 market_transactions(해제분 제외)에서 단지별로:
 *   - 최근 6개월 평균 매매가 · 평당가 · 거래 건수
 *   - 최근 12개월 거래 건수
 *   - 가장 최근 거래(월·금액·면적·층)
 * 를 계산한다. 실거래가 없는 단지는 지어내지 않고 hasData=false 로 내려보낸다.
 */
import { NextRequest, NextResponse } from "next/server";
import { decodeComplexId } from "@/lib/complex/complex-store";
import { getServiceSupabase } from "@/lib/supabase/service";
import { applyRateLimit, READ_RATE_LIMIT } from "@/lib/rate-limit";

export const runtime = "nodejs";

const M2_PER_PYEONG = 3.305785;
const MAX_IDS = 5;

type TxRow = {
  area_m2: number | null;
  deal_amount_krw: number;
  contract_ym: string;
  floor: number | null;
};

export type ComplexCompareItem = {
  id: string;
  name: string;
  region: string;
  hasData: boolean;
  /** 최근 6개월 */
  avg6mKrw: number | null;
  avgPyeong6mKrw: number | null;
  count6m: number;
  /** 최근 12개월 거래 건수 */
  count12m: number;
  latest: {
    ym: string;
    amountKrw: number;
    areaM2: number | null;
    floor: number | null;
  } | null;
};

function ymMonthsAgo(months: number): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - months);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export async function POST(req: NextRequest) {
  const limited = await applyRateLimit(req, READ_RATE_LIMIT);
  if (limited) return limited;

  const body = (await req.json().catch(() => ({}))) as { ids?: unknown };
  const ids = Array.isArray(body.ids)
    ? [...new Set(body.ids.map(String))].slice(0, MAX_IDS)
    : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: "ids 배열이 필요합니다." }, { status: 400 });
  }

  const sb = getServiceSupabase();
  if (!sb) {
    return NextResponse.json({ error: "데이터 소스 미설정" }, { status: 503 });
  }

  const from12m = ymMonthsAgo(12);
  const from6m = ymMonthsAgo(6);

  const items: ComplexCompareItem[] = await Promise.all(
    ids.map(async (id): Promise<ComplexCompareItem> => {
      const dec = decodeComplexId(id);
      const empty: ComplexCompareItem = {
        id,
        name: dec?.name ?? "알 수 없는 단지",
        region: dec?.region ?? "",
        hasData: false,
        avg6mKrw: null,
        avgPyeong6mKrw: null,
        count6m: 0,
        count12m: 0,
        latest: null,
      };
      if (!dec) return empty;

      const { data, error } = await sb
        .from("market_transactions")
        .select("area_m2, deal_amount_krw, contract_ym, floor")
        .eq("complex_name", dec.name)
        .eq("region_name", dec.region)
        .eq("transaction_type", "trade")
        .eq("is_cancelled", false)
        .gt("deal_amount_krw", 0)
        .gte("contract_ym", from12m)
        .order("contract_ym", { ascending: false })
        .order("contract_day", { ascending: false, nullsFirst: false })
        .limit(300);
      const rows = (data as TxRow[] | null) ?? [];
      if (error || rows.length === 0) return empty;

      const recent6 = rows.filter((r) => r.contract_ym >= from6m);
      const avg = (xs: number[]) =>
        xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
      const avg6mKrw = avg(recent6.map((r) => Number(r.deal_amount_krw)));
      const perPyeong = recent6
        .filter((r) => r.area_m2 && Number(r.area_m2) > 0)
        .map((r) => Number(r.deal_amount_krw) / (Number(r.area_m2) / M2_PER_PYEONG));
      const latest = rows[0];

      return {
        id,
        name: dec.name,
        region: dec.region,
        hasData: true,
        avg6mKrw: avg6mKrw === null ? null : Math.round(avg6mKrw),
        avgPyeong6mKrw: perPyeong.length ? Math.round(avg(perPyeong) ?? 0) : null,
        count6m: recent6.length,
        count12m: rows.length,
        latest: {
          ym: String(latest.contract_ym),
          amountKrw: Number(latest.deal_amount_krw),
          areaM2: latest.area_m2 === null ? null : Number(latest.area_m2),
          floor: latest.floor === null ? null : Number(latest.floor),
        },
      };
    }),
  );

  return NextResponse.json({
    items,
    window: { from6m, from12m },
    disclaimer:
      "국토교통부 실거래 기준(해제 신고분 제외) · 면적·타입 구분 없는 단순 평균이므로 참고용입니다",
  });
}
