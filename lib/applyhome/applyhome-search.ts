import { detailKey, fetchAptDetailMap, fetchAptDetailPage } from "@/lib/applyhome/adapters/apt-detail";
import { fetchAptSpecialSupply, extractSpecialMetrics } from "@/lib/applyhome/adapters/apt-special-supply";
import { fetchOdcloudApplyhome, isApplyhomeConfigured, probeApplyhomeDetailAccess } from "@/lib/applyhome/odcloud-client";
import { normalizeApplyhomeRegion } from "@/lib/applyhome/regions";
import type {
  ApplyhomeListingItem,
  ApplyhomeSearchPayload,
  ApplyhomeSearchTab,
  AptCompetitionRow,
  AptDetailRow,
  AptSpecialSupplyRow,
} from "@/lib/applyhome/types";
import {
  APPLYHOME_DETAIL_PORTAL_URL,
  APPLYHOME_PORTAL_URL,
} from "@/lib/applyhome/types";

let detailAccessCache: boolean | null = null;
let detailAccessCheckedAt = 0;
const DETAIL_CACHE_MS = 10 * 60 * 1000;

async function isDetailAvailable(): Promise<boolean> {
  if (!isApplyhomeConfigured()) return false;
  const now = Date.now();
  if (detailAccessCache !== null && now - detailAccessCheckedAt < DETAIL_CACHE_MS) {
    return detailAccessCache;
  }
  detailAccessCache = await probeApplyhomeDetailAccess();
  detailAccessCheckedAt = now;
  return detailAccessCache;
}

function formatPeriod(start?: string, end?: string): string | undefined {
  if (!start && !end) return undefined;
  if (start && end) return `${start} ~ ${end}`;
  return start ?? end;
}

function matchesQuery(detail: AptDetailRow | undefined, q: string): boolean {
  if (!q.trim()) return true;
  const needle = q.trim().toLowerCase();
  const hay = [
    detail?.HOUSE_NM,
    detail?.HSSPLY_ADRES,
    detail?.PBLANC_NO,
    detail?.HOUSE_MANAGE_NO,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return hay.includes(needle);
}

function detailToBaseItem(detail: AptDetailRow): Partial<ApplyhomeListingItem> {
  return {
    houseManageNo: detail.HOUSE_MANAGE_NO,
    pblancNo: detail.PBLANC_NO,
    houseName: detail.HOUSE_NM,
    region: detail.SUBSCRPT_AREA_CODE_NM ?? "—",
    address: detail.HSSPLY_ADRES,
    houseKind: detail.HOUSE_SECD_NM,
    subscriptionPeriod: formatPeriod(detail.RCEPT_BGNDE, detail.RCEPT_ENDDE),
    announceDate: detail.RCRIT_PBLANC_DE,
    builder: detail.BSNS_MBY_NM,
    portalUrl: detail.PBLANC_URL,
  };
}

function competitionToItem(
  row: AptCompetitionRow,
  detail?: AptDetailRow,
): ApplyhomeListingItem {
  const base = detail ? detailToBaseItem(detail) : {};
  return {
    id: `${row.HOUSE_MANAGE_NO}:${row.PBLANC_NO}:${row.HOUSE_TY}:${row.SUBSCRPT_RANK_CODE ?? 0}`,
    houseManageNo: row.HOUSE_MANAGE_NO,
    pblancNo: row.PBLANC_NO,
    houseName: detail?.HOUSE_NM ?? `APT ${row.HOUSE_TY}`,
    region: detail?.SUBSCRPT_AREA_CODE_NM ?? row.RESIDE_SENM ?? "—",
    address: detail?.HSSPLY_ADRES,
    houseType: row.HOUSE_TY,
    houseKind: detail?.HOUSE_SECD_NM,
    supplyCount: row.SUPLY_HSHLDCO ?? 0,
    competitionRate: row.CMPET_RATE ?? "—",
    requestCount: row.REQ_CNT ?? "0",
    resideLabel: row.RESIDE_SENM,
    rankCode: row.SUBSCRPT_RANK_CODE,
    subscriptionPeriod: formatPeriod(detail?.RCEPT_BGNDE, detail?.RCEPT_ENDDE),
    announceDate: detail?.RCRIT_PBLANC_DE,
    builder: detail?.BSNS_MBY_NM,
    portalUrl: detail?.PBLANC_URL,
    ...base,
  };
}

function specialToItem(row: AptSpecialSupplyRow, detail?: AptDetailRow): ApplyhomeListingItem {
  const metrics = extractSpecialMetrics(row);
  const base = detail ? detailToBaseItem(detail) : {};
  return {
    id: `${row.HOUSE_MANAGE_NO}:${row.PBLANC_NO}:${row.HOUSE_TY}`,
    houseManageNo: row.HOUSE_MANAGE_NO,
    pblancNo: row.PBLANC_NO,
    houseName: detail?.HOUSE_NM ?? `APT ${row.HOUSE_TY}`,
    region: detail?.SUBSCRPT_AREA_CODE_NM ?? "—",
    address: detail?.HSSPLY_ADRES,
    houseType: row.HOUSE_TY,
    houseKind: detail?.HOUSE_SECD_NM,
    supplyCount: row.SPSPLY_HSHLDCO ?? metrics.reduce((s, m) => s + m.supply, 0),
    specialSupplyTotal: row.SPSPLY_HSHLDCO,
    specialMetrics: metrics,
    resultLabel: row.SUBSCRPT_RESULT_NM,
    subscriptionPeriod: formatPeriod(detail?.RCEPT_BGNDE, detail?.RCEPT_ENDDE),
    announceDate: detail?.RCRIT_PBLANC_DE,
    builder: detail?.BSNS_MBY_NM,
    portalUrl: detail?.PBLANC_URL,
    ...base,
  };
}

async function searchFromDetailFirst(options: {
  tab: ApplyhomeSearchTab;
  region: string;
  q: string;
  page: number;
  perPage: number;
}): Promise<{ items: ApplyhomeListingItem[]; totalCount: number }> {
  const { tab, region, q, page, perPage } = options;
  const { rows: details, totalCount: detailTotal } = await fetchAptDetailPage({
    page,
    perPage,
    region: region !== "전체" ? region : undefined,
    q: q || undefined,
  });

  const filteredDetails = q.trim() ? details : details.filter((d) => matchesQuery(d, q));
  if (filteredDetails.length === 0) {
    return { items: [], totalCount: q.trim() ? 0 : detailTotal };
  }

  const items: ApplyhomeListingItem[] = [];

  if (tab === "competition") {
    for (const detail of filteredDetails) {
      const json = await fetchOdcloudApplyhome<AptCompetitionRow>("getAPTLttotPblancCmpet", {
        page: 1,
        perPage: 20,
        "cond[HOUSE_MANAGE_NO::EQ]": detail.HOUSE_MANAGE_NO,
        "cond[PBLANC_NO::EQ]": detail.PBLANC_NO,
      });
      for (const row of json.data ?? []) {
        items.push(competitionToItem(row, detail));
      }
      if (items.length >= perPage) break;
    }
  } else {
    for (const detail of filteredDetails) {
      const { rows } = await fetchAptSpecialSupply({
        houseManageNo: detail.HOUSE_MANAGE_NO,
        pblancNo: detail.PBLANC_NO,
        perPage: 20,
      });
      for (const row of rows) {
        items.push(specialToItem(row, detail));
      }
      if (items.length >= perPage) break;
    }
  }

  return {
    items: items.slice(0, perPage),
    totalCount: q.trim() ? filteredDetails.length : detailTotal,
  };
}

async function searchFromPrimaryApi(options: {
  tab: ApplyhomeSearchTab;
  page: number;
  perPage: number;
  detailAvailable: boolean;
}): Promise<{ items: ApplyhomeListingItem[]; totalCount: number }> {
  const { tab, page, perPage, detailAvailable } = options;

  if (tab === "competition") {
    const json = await fetchOdcloudApplyhome<AptCompetitionRow>("getAPTLttotPblancCmpet", {
      page,
      perPage,
    });
    const rows = json.data ?? [];
    const detailMap = detailAvailable
      ? await fetchAptDetailMap(
          rows.map((r) => ({ houseManageNo: r.HOUSE_MANAGE_NO, pblancNo: r.PBLANC_NO })),
        )
      : new Map<string, AptDetailRow>();

    return {
      totalCount: json.totalCount ?? 0,
      items: rows.map((row) =>
        competitionToItem(row, detailMap.get(detailKey(row.HOUSE_MANAGE_NO, row.PBLANC_NO))),
      ),
    };
  }

  const { rows, totalCount } = await fetchAptSpecialSupply({ page, perPage });
  const detailMap = detailAvailable
    ? await fetchAptDetailMap(
        rows.map((r) => ({ houseManageNo: r.HOUSE_MANAGE_NO, pblancNo: r.PBLANC_NO })),
      )
    : new Map<string, AptDetailRow>();

  return {
    totalCount,
    items: rows.map((row) =>
      specialToItem(row, detailMap.get(detailKey(row.HOUSE_MANAGE_NO, row.PBLANC_NO))),
    ),
  };
}

export async function searchApplyhome(options?: {
  tab?: ApplyhomeSearchTab;
  region?: string;
  q?: string;
  page?: number;
  perPage?: number;
}): Promise<ApplyhomeSearchPayload> {
  const tab = options?.tab ?? "competition";
  const region = normalizeApplyhomeRegion(options?.region);
  const q = options?.q?.trim() ?? "";
  const page = Math.max(1, options?.page ?? 1);
  const perPage = Math.min(Math.max(1, options?.perPage ?? 15), 30);

  if (!isApplyhomeConfigured()) {
    return {
      mode: "mock",
      tab,
      detailAvailable: false,
      detailNotice:
        "DATA_GO_KR_SERVICE_KEY를 설정하면 청약홈 실데이터가 표시됩니다. 단지명·지역 필터는 분양정보 조회 API 활용 시 정확해집니다.",
      filters: { region, q },
      totalCount: 0,
      items: [],
      portalUrl: APPLYHOME_PORTAL_URL,
      fetchedAt: new Date().toISOString(),
    };
  }

  const detailAvailable = await isDetailAvailable();
  const hasFilters = region !== "전체" || q.length > 0;

  let items: ApplyhomeListingItem[] = [];
  let totalCount = 0;

  if (hasFilters && !detailAvailable) {
    return {
      mode: "live",
      tab,
      detailAvailable: false,
      detailNotice: `단지명·지역 필터는 공공데이터포털 「청약홈 분양정보 조회」 API 활용신청이 필요합니다. (${APPLYHOME_DETAIL_PORTAL_URL})`,
      filters: { region, q },
      totalCount: 0,
      items: [],
      portalUrl: APPLYHOME_PORTAL_URL,
      fetchedAt: new Date().toISOString(),
    };
  }

  if (hasFilters && detailAvailable) {
    ({ items, totalCount } = await searchFromDetailFirst({ tab, region, q, page, perPage }));
  } else {
    ({ items, totalCount } = await searchFromPrimaryApi({
      tab,
      page,
      perPage,
      detailAvailable,
    }));
  }

  return {
    mode: "live",
    tab,
    detailAvailable,
    detailNotice: detailAvailable
      ? undefined
      : `단지명 표시·지역/단지명 필터는 「청약홈 분양정보 조회」 API 신청 후 이용할 수 있습니다.`,
    filters: { region, q },
    totalCount,
    items,
    portalUrl: APPLYHOME_PORTAL_URL,
    fetchedAt: new Date().toISOString(),
  };
}
