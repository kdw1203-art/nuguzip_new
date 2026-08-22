import "server-only";

import { fetchAptDetailPage } from "@/lib/applyhome/adapters/apt-detail";
import { isApplyhomeConfigured } from "@/lib/applyhome/odcloud-client";
import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/log";

/**
 * [개선 #21, 2026-08-22] 입주 예정 물량 자동 인제스트.
 *
 * 배경: apartment_supply 는 2026-02 수동 업로드(upload_20260227, 675행) 이후
 * 갱신 경로가 없어 7/20 부터 한 달째 정지 — freshness-watch(#44)가 이 사각을
 * 잡아낸 첫 사례였다. 청약홈 분양정보 상세(getAPTLttotPblancDetail)에
 * 입주예정월(MVN_PREARNGE_YM)이 실려 오므로(스웨거 실측), 이미 연동된 어댑터로
 * 매일 신규 공고를 끌어와 자동 갱신 경로를 만든다.
 *
 * 설계 결정:
 * - 상세 API 는 최신 공고가 page 1 에 온다(캘린더 #17 실측). 매일 앞쪽
 *   RECENT_PAGES 페이지로 신규 공고를 놓치지 않고, 그 뒤 구간은 날짜 기반
 *   로테이션으로 DEEP_PAGES 페이지씩 순회해 무상태(stateless)로 과거분을
 *   메꾼다 — 업서트가 멱등이라 겹쳐도 무해하다.
 * - 유일키: (source, source_id=HOUSE_MANAGE_NO). 수동 업로드 행은 source_id 가
 *   NULL 이라 충돌하지 않는다.
 * - 수동 업로드와의 이중 계상 방지: (공백 제거 단지명 + 입주월)이 일치하는
 *   수동 행은 새로 넣지 않고 그 행을 applyhome 소유로 이관(update)한다.
 *   명칭 표기가 다른 잔여 중복은 있을 수 있다 — 완전 매칭을 가장하지 않는다.
 * - 입주월 필터: MOVE_IN_FLOOR(기존 업로드 하한 202601) 이전 행은 버린다.
 *   과거 입주분을 쌓으면 /supply 전량 로더(SUPPLY_FETCH_CAP)만 무겁게 한다.
 */

const RECENT_PAGES = 15; // 매일 최신 1,500건 — 신규 공고 주간 수십 건 대비 충분한 여유
const DEEP_PAGES = 10; // 로테이션 백필 폭
const DEEP_MAX_PAGE = 60; // 약 6,000건(최근 1.5~2년 공고)까지만 — 그 이전 공고의 입주월은 대부분 과거
const PER_PAGE = 100;
const MOVE_IN_FLOOR = "202601"; // 기존 수동 데이터와 같은 하한

export type SupplyIngestResult = {
  configured: boolean;
  reason?: string;
  fetched: number;
  upserted: number;
  /** 수동 업로드 행을 applyhome 소유로 이관한 수 */
  migrated: number;
  skippedNoMoveIn: number;
  pagesFetched: number;
  totalCount: number;
};

function normName(name: string): string {
  return name.toLowerCase().replace(/[\s()·]/g, "");
}

function normMoveInYm(raw?: string): string | null {
  if (!raw) return null;
  const d = raw.replace(/[^0-9]/g, "").slice(0, 6);
  if (!/^20\d{4}$/.test(d)) return null;
  const month = Number(d.slice(4, 6));
  if (month < 1 || month > 12) return null;
  return d;
}

type SupplyUpsertRow = {
  source: string;
  source_id: string;
  move_in_ym: string;
  region: string;
  biz_type: string;
  address: string | null;
  apt_name: string;
  households: number | null;
};

export async function ingestApplyhomeSupply(): Promise<SupplyIngestResult> {
  const empty: Omit<SupplyIngestResult, "configured" | "reason"> = {
    fetched: 0,
    upserted: 0,
    migrated: 0,
    skippedNoMoveIn: 0,
    pagesFetched: 0,
    totalCount: 0,
  };
  if (!isApplyhomeConfigured()) {
    return { configured: false, reason: "no-key", ...empty };
  }
  const sb = getServiceSupabase();
  if (!sb) {
    return { configured: false, reason: "no-service-client", ...empty };
  }

  /* ── 1. 페이지 목록: 최신 구간 + 날짜 로테이션 심층 구간 ── */
  const pages: number[] = [];
  for (let p = 1; p <= RECENT_PAGES; p += 1) pages.push(p);
  const deepSlots = Math.max(1, Math.ceil((DEEP_MAX_PAGE - RECENT_PAGES) / DEEP_PAGES));
  const slot = Math.floor(Date.now() / 86_400_000) % deepSlots;
  const deepStart = RECENT_PAGES + 1 + slot * DEEP_PAGES;
  for (let p = deepStart; p < deepStart + DEEP_PAGES && p <= DEEP_MAX_PAGE; p += 1) pages.push(p);

  /* ── 2. 수집 (순차 — odcloud 를 향한 예의; 페이지당 ~0.5초) ── */
  let fetched = 0;
  let skippedNoMoveIn = 0;
  let pagesFetched = 0;
  let totalCount = 0;
  const bySourceId = new Map<string, SupplyUpsertRow>();

  for (const page of pages) {
    let rows;
    try {
      const res = await fetchAptDetailPage({ page, perPage: PER_PAGE });
      rows = res.rows;
      totalCount = res.totalCount || totalCount;
    } catch (e) {
      // 한 페이지 실패로 전체를 버리지 않는다 — 나머지 페이지 결과는 유효하다.
      logger.error(`[supply-ingest] page ${page} 실패`, e);
      continue;
    }
    pagesFetched += 1;
    fetched += rows.length;
    for (const r of rows) {
      const ym = normMoveInYm(r.MVN_PREARNGE_YM);
      if (!ym || ym < MOVE_IN_FLOOR) {
        skippedNoMoveIn += 1;
        continue;
      }
      const name = r.HOUSE_NM?.trim();
      const sourceId = r.HOUSE_MANAGE_NO?.trim();
      if (!name || !sourceId) continue;
      bySourceId.set(sourceId, {
        source: "applyhome",
        source_id: sourceId,
        move_in_ym: ym,
        region: r.SUBSCRPT_AREA_CODE_NM?.trim() || "기타",
        biz_type: "분양",
        address: r.HSSPLY_ADRES?.trim() || null,
        apt_name: name,
        households:
          typeof r.TOT_SUPLY_HSHLDCO === "number" && r.TOT_SUPLY_HSHLDCO > 0
            ? r.TOT_SUPLY_HSHLDCO
            : null,
      });
    }
    if (rows.length < PER_PAGE) break; // 마지막 페이지
  }

  /* ── 3. 수동 업로드 행 이관 — 이중 계상 방지 ── */
  let migrated = 0;
  const incoming = [...bySourceId.values()];
  if (incoming.length > 0) {
    const { data: manualRows, error: manualErr } = await sb
      .from("apartment_supply")
      .select("id, apt_name, move_in_ym")
      .is("source_id", null)
      .limit(3000);
    if (manualErr) {
      logger.error("[supply-ingest] 수동 행 조회 실패 — 이관 없이 진행", manualErr);
    }
    const manualByKey = new Map<string, number>();
    for (const m of manualRows ?? []) {
      const key = `${normName(String(m.apt_name ?? ""))}|${m.move_in_ym}`;
      if (!manualByKey.has(key)) manualByKey.set(key, Number(m.id));
    }
    for (const row of incoming) {
      const key = `${normName(row.apt_name)}|${row.move_in_ym}`;
      const manualId = manualByKey.get(key);
      if (manualId === undefined) continue;
      const { error } = await sb
        .from("apartment_supply")
        .update({
          source: row.source,
          source_id: row.source_id,
          region: row.region,
          address: row.address ?? undefined,
          households: row.households ?? undefined,
        })
        .eq("id", manualId);
      if (!error) {
        migrated += 1;
        manualByKey.delete(key);
        bySourceId.delete(row.source_id);
      }
    }
  }

  /* ── 4. 업서트 (500행 배치) ── */
  let upserted = 0;
  const rest = [...bySourceId.values()];
  for (let i = 0; i < rest.length; i += 500) {
    const batch = rest.slice(i, i + 500);
    const { error } = await sb
      .from("apartment_supply")
      .upsert(batch, { onConflict: "source,source_id" });
    if (error) {
      logger.error("[supply-ingest] upsert 실패", error);
      throw new Error(`apartment_supply upsert 실패: ${error.message}`);
    }
    upserted += batch.length;
  }

  return {
    configured: true,
    fetched,
    upserted,
    migrated,
    skippedNoMoveIn,
    pagesFetched,
    totalCount,
  };
}
