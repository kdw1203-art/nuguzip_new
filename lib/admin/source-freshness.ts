import "server-only";

import { getServiceSupabase } from "@/lib/supabase/service";

/* [개선 #24·#44, 2026-08-22] 데이터 소스 신선도 — 단일 판정 출처.
 *
 * (주의: lib/admin/data-freshness.ts 는 기존의 "인제스트 실행 결과 요약" 모듈로
 *  별개다 — 이 파일은 소스 테이블의 **마지막 적재 시각**만 잰다.)
 *
 * 실측 배경: 입주물량(apartment_supply)이 7/20 이후 한 달째 정지해 있었는데
 * 아무도 몰랐다 — 소스별 마지막 적재 시각을 한눈에 보는 곳이 없어서다.
 * 이 모듈이 각 소스의 최신 행 시각과 허용 임계(시간)를 함께 돌려주고,
 * /admin/freshness 화면과 /api/cron/freshness-watch 감시가 같은 판정을 쓴다.
 *
 * 임계는 각 소스의 **실제 갱신 설계 주기 × 여유 2배** 언저리 — 빠듯하면
 * 정상 지연이 경보가 되어 경보가 소음이 된다.
 */

export type SourceFreshnessRow = {
  key: string;
  label: string;
  /** 갱신 경로 설명 — 어디를 고쳐야 하는지 바로 알 수 있게 */
  pipeline: string;
  lastAt: string | null;
  thresholdHours: number;
  /** null = 시각 조회 실패(테이블 없음 등) — stale 과 구분 */
  ageHours: number | null;
  stale: boolean;
};

type SourceDef = {
  key: string;
  label: string;
  pipeline: string;
  table: string;
  column: string;
  thresholdHours: number;
};

const SOURCES: SourceDef[] = [
  {
    key: "news",
    label: "뉴스 자동수집",
    pipeline: "매일 08:00 KST 수집 세션 → ingest_daily_news",
    table: "news_articles",
    column: "created_at",
    thresholdHours: 36,
  },
  {
    key: "onbid",
    label: "온비드 공매",
    pipeline: "GitHub Actions etl.yml → /api/cron/onbid-sync (매일)",
    table: "onbid_auctions",
    column: "updated_at",
    thresholdHours: 48,
  },
  {
    key: "supply",
    label: "입주 예정 물량",
    pipeline: "etl.yml → /api/cron/supply-ingest (매일, 청약홈 분양공고)",
    table: "apartment_supply",
    column: "created_at",
    thresholdHours: 24 * 14, // 신규 분양공고는 주 단위로 나온다 — 2주 무소식이면 이상
  },
  {
    key: "redevelopment",
    label: "정비사업",
    pipeline: "etl.yml → /api/cron/redevelopment-ingest (SEOUL_OPENAPI_KEY 필요)",
    table: "redevelopment_projects",
    column: "updated_at",
    thresholdHours: 24 * 45,
  },
  {
    key: "market_index",
    label: "시세 지수 (REB/KB)",
    pipeline: "etl.yml → reb-ingest·kb-ingest (매일)",
    table: "market_price_indices",
    column: "created_at",
    thresholdHours: 24 * 10, // 주간 지수 — 열흘 넘게 새 행이 없으면 이상
  },
  {
    key: "molit_tx",
    label: "실거래 (국토부)",
    pipeline: "etl.yml → molit-transactions-ingest (매일)",
    table: "market_transactions",
    column: "created_at",
    thresholdHours: 72,
  },
  {
    key: "temperature",
    label: "시장 온도 주간 스냅샷",
    pipeline: "etl.yml → market-temperature-snapshot (주간)",
    table: "market_temperature_snapshot",
    column: "created_at",
    thresholdHours: 24 * 10,
  },
];

export async function loadSourceFreshness(): Promise<SourceFreshnessRow[]> {
  const sb = getServiceSupabase();
  const now = Date.now();
  return Promise.all(
    SOURCES.map(async (s) => {
      let lastAt: string | null = null;
      if (sb) {
        try {
          const { data } = await sb
            .from(s.table)
            .select(s.column)
            .order(s.column, { ascending: false })
            .limit(1)
            .maybeSingle();
          const raw = (data as Record<string, unknown> | null)?.[s.column];
          lastAt = typeof raw === "string" ? raw : null;
        } catch {
          lastAt = null;
        }
      }
      const ageHours = lastAt ? (now - Date.parse(lastAt)) / 3_600_000 : null;
      return {
        key: s.key,
        label: s.label,
        pipeline: s.pipeline,
        lastAt,
        thresholdHours: s.thresholdHours,
        ageHours: ageHours !== null && Number.isFinite(ageHours) ? ageHours : null,
        /* 시각을 못 읽은 것도 stale 로 본다 — "모름"을 초록불로 칠하면
           이번 입주물량 사각지대가 그대로 반복된다. */
        stale: ageHours === null || !Number.isFinite(ageHours) || ageHours > s.thresholdHours,
      };
    }),
  );
}
