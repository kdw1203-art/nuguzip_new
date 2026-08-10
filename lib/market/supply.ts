import "server-only";
import { getReadOnlySupabase } from "@/lib/newui/supabase-read";
import { logger } from "@/lib/log";

/**
 * 입주예정물량(apartment_supply) 읽기 전용 로더.
 * 출처: 공개 입주예정물량 자료(2026-02 기준, 2026-01~2027-12).
 * 데이터 없거나 실패 시 빈 결과 → 화면은 정직한 빈 상태.
 */

export type SupplyItem = {
  moveInYm: string;
  region: string;
  bizType: string | null;
  address: string | null;
  aptName: string | null;
  households: number | null;
};

export type SupplyMonthBucket = {
  ym: string;
  count: number;
  households: number;
};

/**
 * 데이터 적재 기준 시점 — apartment_supply 최신 created_at.
 * 이 테이블은 자동 갱신 경로가 없는 수동 적재 데이터라, 화면의 "기준" 표기는
 * 하드코딩("2026.02 기준")이 아니라 실제 DB 적재 시점에서 읽는다. 없으면 null.
 */
export async function getSupplyDataAsOf(): Promise<string | null> {
  const sb = getReadOnlySupabase();
  if (!sb) return null;
  try {
    const { data, error } = await sb
      .from("apartment_supply")
      .select("created_at")
      .order("created_at", { ascending: false })
      .limit(1);
    if (error || !Array.isArray(data) || data.length === 0) return null;
    const raw = (data[0] as Record<string, unknown>).created_at;
    return raw ? String(raw) : null;
  } catch (e) {
    logger.error("[getSupplyDataAsOf]", e);
    return null;
  }
}

/** 시도 목록(물량 순) */
export async function getSupplyRegions(): Promise<
  { region: string; count: number; households: number }[]
> {
  const sb = getReadOnlySupabase();
  if (!sb) return [];
  try {
    const { data, error } = await sb
      .from("apartment_supply")
      .select("region, households")
      .limit(5000);
    if (error || !Array.isArray(data)) return [];
    const map = new Map<string, { count: number; households: number }>();
    for (const row of data as Record<string, unknown>[]) {
      const region = String(row.region ?? "기타");
      const e = map.get(region) ?? { count: 0, households: 0 };
      e.count += 1;
      e.households += Number(row.households ?? 0) || 0;
      map.set(region, e);
    }
    return [...map.entries()]
      .map(([region, v]) => ({ region, ...v }))
      .sort((a, b) => b.households - a.households);
  } catch (e) {
    logger.error("[getSupplyRegions]", e);
    return [];
  }
}

/** 월별 입주물량 집계 (전체 또는 특정 시도) */
export async function getSupplyMonthly(
  region?: string,
): Promise<SupplyMonthBucket[]> {
  const sb = getReadOnlySupabase();
  if (!sb) return [];
  try {
    let q = sb
      .from("apartment_supply")
      .select("move_in_ym, households")
      .limit(5000);
    if (region) q = q.eq("region", region);
    const { data, error } = await q;
    if (error || !Array.isArray(data)) return [];
    const map = new Map<string, { count: number; households: number }>();
    for (const row of data as Record<string, unknown>[]) {
      const ym = String(row.move_in_ym ?? "");
      if (!/^\d{6}$/.test(ym)) continue;
      const e = map.get(ym) ?? { count: 0, households: 0 };
      e.count += 1;
      e.households += Number(row.households ?? 0) || 0;
      map.set(ym, e);
    }
    return [...map.entries()]
      .map(([ym, v]) => ({ ym, ...v }))
      .sort((a, b) => a.ym.localeCompare(b.ym));
  } catch (e) {
    logger.error("[getSupplyMonthly]", e);
    return [];
  }
}

/** 단지 목록 (특정 시도, 입주월 순) */
export async function getSupplyList(
  region?: string,
  limit = 300,
): Promise<SupplyItem[]> {
  const sb = getReadOnlySupabase();
  if (!sb) return [];
  try {
    let q = sb
      .from("apartment_supply")
      .select("move_in_ym, region, biz_type, address, apt_name, households")
      .order("move_in_ym", { ascending: true })
      .limit(limit);
    if (region) q = q.eq("region", region);
    const { data, error } = await q;
    if (error || !Array.isArray(data)) return [];
    return (data as Record<string, unknown>[]).map((r) => ({
      moveInYm: String(r.move_in_ym ?? ""),
      region: String(r.region ?? ""),
      bizType: r.biz_type ? String(r.biz_type) : null,
      address: r.address ? String(r.address) : null,
      aptName: r.apt_name ? String(r.apt_name) : null,
      households: r.households != null ? Number(r.households) : null,
    }));
  } catch (e) {
    logger.error("[getSupplyList]", e);
    return [];
  }
}

/** getSupplyAll 페치 상한 — 전량이 이 안에 들어와야 클라이언트 필터가 서버 필터와 동치다.
 *  실측(2026-08-10): apartment_supply 전량 675행(17개 시도, 최다 지역 209행) — 약 3배 여유.
 *  이 값에 도달하면 잘렸을 수 있다는 뜻이므로 truncated 로 알린다. */
export const SUPPLY_FETCH_CAP = 2000;

export type SupplyAllResult = {
  /** false = 조회 실패 (빈 결과와 구별 — "0건"이 아니라 "조회 실패"로 그려야 한다) */
  ok: boolean;
  items: SupplyItem[];
  /** 페치 상한 도달 — 전량 보장이 깨졌을 수 있음 (화면에 가리지 않고 알린다) */
  truncated: boolean;
};

/**
 * 전량 로더 (ISR /supply 용) — 한 쿼리로 전체를 가져와 지역·월별 집계와 목록을
 * 클라이언트에서 파생시킨다. 기존 getSupplyRegions + getSupplyMonthly + getSupplyList
 * 3쿼리를 1쿼리로 줄이고, 기존 로더들과 달리 실패([] 반환으로 삼키기)와 빈 결과를
 * 구별한다 — ISR 이 실패 화면을 "데이터 없음"으로 캐시하지 않게 하기 위해서다.
 * 정렬은 getSupplyList 와 동일(move_in_ym 오름차순).
 */
export async function getSupplyAll(): Promise<SupplyAllResult> {
  const sb = getReadOnlySupabase();
  if (!sb) return { ok: false, items: [], truncated: false };
  try {
    const { data, error } = await sb
      .from("apartment_supply")
      .select("move_in_ym, region, biz_type, address, apt_name, households")
      .order("move_in_ym", { ascending: true })
      .limit(SUPPLY_FETCH_CAP);
    if (error || !Array.isArray(data)) {
      logger.error("[getSupplyAll]", error ?? "invalid data");
      return { ok: false, items: [], truncated: false };
    }
    const items = (data as Record<string, unknown>[]).map((r) => ({
      moveInYm: String(r.move_in_ym ?? ""),
      region: String(r.region ?? ""),
      bizType: r.biz_type ? String(r.biz_type) : null,
      address: r.address ? String(r.address) : null,
      aptName: r.apt_name ? String(r.apt_name) : null,
      households: r.households != null ? Number(r.households) : null,
    }));
    return { ok: true, items, truncated: items.length >= SUPPLY_FETCH_CAP };
  } catch (e) {
    logger.error("[getSupplyAll]", e);
    return { ok: false, items: [], truncated: false };
  }
}

/**
 * 특정 시/군/구(자치구) 관련 입주물량 — 주소 부분 매칭.
 * 지역 허브(/region/[id])에서 해당 구 이름으로 조회.
 */
export async function getSupplyForArea(
  areaName: string,
  limit = 12,
  /** 곁다리 예산 신호 (항목 25) — 예산이 접히면 PostgREST 요청도 끊는다. */
  signal?: AbortSignal,
): Promise<SupplyItem[]> {
  const name = areaName.trim();
  if (!name) return [];
  const sb = getReadOnlySupabase();
  if (!sb) return [];
  try {
    let q = sb
      .from("apartment_supply")
      .select("move_in_ym, region, biz_type, address, apt_name, households")
      .ilike("address", `%${name}%`)
      .order("move_in_ym", { ascending: true })
      .limit(limit);
    if (signal) q = q.abortSignal(signal);
    const { data, error } = await q;
    if (error || !Array.isArray(data)) return [];
    return (data as Record<string, unknown>[]).map((r) => ({
      moveInYm: String(r.move_in_ym ?? ""),
      region: String(r.region ?? ""),
      bizType: r.biz_type ? String(r.biz_type) : null,
      address: r.address ? String(r.address) : null,
      aptName: r.apt_name ? String(r.apt_name) : null,
      households: r.households != null ? Number(r.households) : null,
    }));
  } catch (e) {
    logger.error("[getSupplyForArea]", e);
    return [];
  }
}
