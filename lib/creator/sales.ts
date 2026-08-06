import "server-only";
import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/log";
import { normEmailOrNull } from "@/lib/privacy/mask-email";

/** 리포트 구매 집계 조회 상한(#32) */
const REPORT_PURCHASES_LIMIT = 20_000;

/**
 * 크리에이터 유료 리포트 판매 실적 · 정산 집계.
 *
 * - 리포트 소유 판정: reports.author_id = 크리에이터 이메일 (기존 컬럼 재사용, 스키마 변경 없음).
 * - 판매 집계: report_purchases.amount(포인트) 합산 · 건수 집계.
 * - 정산: 포인트 판매액 → 현금 전환은 관리자 승인 필요. 현금 정산 인프라는 준비 중이라
 *   `payoutReady=false`로 두고 화면에서 정직하게 "현금 정산 준비 중"으로 안내한다.
 */

/** 정산 정책 상수 — 1P ≈ 1원(포인트 카탈로그 공유 가정) */
export const SETTLEMENT = {
  /** 1포인트당 원화 환산 (체감 가치) */
  pointToKrw: 1,
  /** 플랫폼 수수료 (전문가 리포트 요율 7%) */
  platformFeeRate: 0.07,
  /** 최소 정산 신청액 (원) */
  minPayoutKrw: 30_000,
  /** 현금 전환(출금) 인프라 준비 여부 — 아직 미구현 */
  payoutReady: false as boolean,
} as const;

export type CreatorReportSale = {
  id: string;
  title: string;
  /** 판매 가격 (포인트) */
  price: number;
  isPremium: boolean;
  publishedAt: string;
  /** 판매 건수 */
  salesCount: number;
  /** 이 리포트 누적 판매 포인트 */
  grossPoints: number;
};

export type CreatorSalesSummary = {
  reports: CreatorReportSale[];
  /** 등록 리포트 수 */
  totalReports: number;
  /** 총 판매 건수 */
  totalSales: number;
  /** 누적 판매 포인트 (= 원, 수수료 차감 전) */
  grossPoints: number;
  /** 플랫폼 수수료 (포인트) */
  feePoints: number;
  /** 정산 예정 포인트 (수수료 차감 후) */
  netPoints: number;
  /** 정산 예정 금액 (원) */
  netKrw: number;
  /** 집계 가능 여부 (false면 화면에서 "—") */
  available: boolean;
};

const EMPTY: CreatorSalesSummary = {
  reports: [],
  totalReports: 0,
  totalSales: 0,
  grossPoints: 0,
  feePoints: 0,
  netPoints: 0,
  netKrw: 0,
  available: false,
};

/** 크리에이터(author_id=email)의 리포트별 판매 실적 + 정산 예정액 집계 */
export async function getCreatorSales(email: string | null | undefined): Promise<CreatorSalesSummary> {
  /* 저장은 소문자로 하므로(lib/reports/store-db.ts) 조회도 소문자로 맞춘다.
     예전엔 세션 이메일을 그대로 넣어 대소문자가 다르면 0건이 나왔다. */
  const e = normEmailOrNull(email);
  const sb = getServiceSupabase();
  if (!sb || !e) return EMPTY;
  try {
    const { data: reps, error } = await sb
      .from("reports")
      .select("id, title, price, is_premium, published_at")
      .eq("author_id", e)
      .order("published_at", { ascending: false })
      .limit(200);
    /* EMPTY 는 available:false 라 화면이 "—" 로 정직하게 나온다. 문제는 **왜**
       못 읽었는지가 어디에도 안 남았다는 것이다. author_id 가 uuid 이던 시절
       이 조회는 매번 22P02 로 죽었는데, 대시보드는 그저 조용히 "—" 였고 로그에도
       한 줄이 없어 몇 달을 못 알아챘다. 삼키더라도 남긴다. */
    if (error) {
      logger.error("[creator/sales] reports 조회 실패 — 대시보드가 '—' 로 표시됩니다.", {
        code: error.code,
        message: error.message,
      });
      return EMPTY;
    }
    const reports = reps ?? [];
    const ids = reports.map((r) => String(r.id));

    // report_purchases 집계 (report_id → {건수, 포인트합})
    const agg = new Map<string, { n: number; pts: number }>();
    if (ids.length > 0) {
      const { data: purs, error: purErr } = await sb
        .from("report_purchases")
        .select("report_id, amount")
        .in("report_id", ids.slice(0, 200))
        /* #32 — 상한 명시. 닿으면 판매 건수·포인트가 과소 집계되므로 경고를 남긴다. */
        .limit(REPORT_PURCHASES_LIMIT);
      /* 이 오류를 안 보고 넘어가면 agg 가 비어 **판매 0건 · 0P** 로 렌더링된다.
         리포트 목록은 읽혔으니 available:true 라 "—" 도 아니다 — 못 읽은 걸
         "안 팔렸다"로 바꿔 말하는 셈이라, 여기서는 EMPTY 로 접는다. */
      if (purErr) {
        logger.error("[creator/sales] report_purchases 조회 실패 — 판매 집계를 낼 수 없습니다.", {
          code: purErr.code,
          message: purErr.message,
        });
        return EMPTY;
      }
      if ((purs?.length ?? 0) >= REPORT_PURCHASES_LIMIT) {
        console.warn(
          `[creator/sales] report_purchases 조회가 상한(${REPORT_PURCHASES_LIMIT}행)에 도달 — 판매 집계가 과소입니다.`,
        );
      }
      for (const p of purs ?? []) {
        const rid = String(p.report_id);
        const cur = agg.get(rid) ?? { n: 0, pts: 0 };
        cur.n += 1;
        cur.pts += Number(p.amount) || 0;
        agg.set(rid, cur);
      }
    }

    const rows: CreatorReportSale[] = reports.map((r) => {
      const a = agg.get(String(r.id)) ?? { n: 0, pts: 0 };
      return {
        id: String(r.id),
        title: String(r.title ?? "제목 없음"),
        price: Number(r.price ?? 0),
        isPremium: Boolean(r.is_premium),
        publishedAt: String(r.published_at ?? ""),
        salesCount: a.n,
        grossPoints: a.pts,
      };
    });

    const grossPoints = rows.reduce((s, r) => s + r.grossPoints, 0);
    const totalSales = rows.reduce((s, r) => s + r.salesCount, 0);
    const feePoints = Math.round(grossPoints * SETTLEMENT.platformFeeRate);
    const netPoints = grossPoints - feePoints;
    return {
      reports: rows,
      totalReports: rows.length,
      totalSales,
      grossPoints,
      feePoints,
      netPoints,
      netKrw: Math.round(netPoints * SETTLEMENT.pointToKrw),
      available: true,
    };
  } catch (e) {
    logger.error("[creator/sales] 집계 중 예외 — 대시보드가 '—' 로 표시됩니다.", e);
    return EMPTY;
  }
}
