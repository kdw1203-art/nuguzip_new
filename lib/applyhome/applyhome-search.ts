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

/**
 * 상세(분양정보) API 미승인 상태에서 단지명·지역을 확보하지 못한 행의 정직한 라벨.
 * 예전에는 `APT ${HOUSE_TY}` 처럼 타입코드(예: "APT 084.9700")를 단지명 자리에
 * 노출했는데, 이는 존재하지 않는 단지명을 지어내는 표기라 제거했다.
 */
const UNNAMED_HOUSE_LABEL = "단지명 미제공(청약홈 상세 승인 대기)";
const UNNAMED_REGION_LABEL = "지역 미제공";

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
    region: detail.SUBSCRPT_AREA_CODE_NM ?? UNNAMED_REGION_LABEL,
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
    houseName: detail?.HOUSE_NM ?? UNNAMED_HOUSE_LABEL,
    region: detail?.SUBSCRPT_AREA_CODE_NM ?? row.RESIDE_SENM ?? UNNAMED_REGION_LABEL,
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
    houseName: detail?.HOUSE_NM ?? UNNAMED_HOUSE_LABEL,
    region: detail?.SUBSCRPT_AREA_CODE_NM ?? UNNAMED_REGION_LABEL,
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
  /* 서버측 필터가 이미 걸린다: 지역은 EQ, 검색어는 단지명 LIKE
     (adapters/apt-detail.ts). detailTotal 은 그 조건의 **전체 건수**다. */
  const { rows: details, totalCount: detailTotal } = await fetchAptDetailPage({
    page,
    perPage,
    region: region !== "전체" ? region : undefined,
    q: q || undefined,
  });

  /* [수리 2026-08-22] 예전 코드는 삼항이 뒤집혀 있었다:
       q 있음 → 로컬 필터 생략 / q 없음 → matchesQuery(d,"")(전부 true)
     즉 주소·공고번호 매칭(matchesQuery)이 어느 경로에서도 돌지 않았고,
     검색 시 totalCount 를 "받은 한 페이지 길이"로 보고해 더보기가 죽고
     "총 공고" 타일이 15건으로 찍혔다. 정리:
       - 단지명 LIKE 는 서버가 이미 했으므로 로컬 재필터는 불필요.
       - 단지명으로 0건이면 **주소·공고번호일 수 있다** — 같은 페이지를
         조건 없이 다시 받아 로컬 matchesQuery 로 거른다(1페이지 한정 폴백).
       - totalCount 는 서버 건수(detailTotal)를 그대로 쓴다. 폴백 경로만
         로컬 매칭 건수를 쓴다(그때는 그것이 아는 전부라서). */
  let filteredDetails = details;
  let localFallback = false;
  if (q.trim() && details.length === 0) {
    const { rows: unfiltered } = await fetchAptDetailPage({
      page,
      perPage: 50,
      region: region !== "전체" ? region : undefined,
    });
    filteredDetails = unfiltered.filter((d) => matchesQuery(d, q)).slice(0, perPage);
    localFallback = true;
  }
  if (filteredDetails.length === 0) {
    return { items: [], totalCount: localFallback ? 0 : detailTotal };
  }

  /* [최적화 2026-08-22] 상세 1행당 업스트림 1회를 **순차로** 돌던 N+1 —
     검색이 이 페이지의 가장 느린 경로였다(최대 15회 왕복 합산). 병렬로 바꾼다.
     실패한 행은 건너뛴다(전체 실패로 번지지 않게 allSettled). */
  const perDetail = await Promise.allSettled(
    filteredDetails.map(async (detail) => {
      if (tab === "competition") {
        const json = await fetchOdcloudApplyhome<AptCompetitionRow>("getAPTLttotPblancCmpet", {
          page: 1,
          perPage: 20,
          "cond[HOUSE_MANAGE_NO::EQ]": detail.HOUSE_MANAGE_NO,
          "cond[PBLANC_NO::EQ]": detail.PBLANC_NO,
        });
        return (json.data ?? []).map((row) => competitionToItem(row, detail));
      }
      const { rows } = await fetchAptSpecialSupply({
        houseManageNo: detail.HOUSE_MANAGE_NO,
        pblancNo: detail.PBLANC_NO,
        perPage: 20,
      });
      return rows.map((row) => specialToItem(row, detail));
    }),
  );
  const items: ApplyhomeListingItem[] = [];
  for (const r of perDetail) {
    if (r.status === "fulfilled") items.push(...r.value);
  }

  /* 자르지 않는다: 페이지 단위는 "공고(detail) perPage개"이고, 한 공고가 타입·순위별로
     여러 행을 만든다. 예전처럼 행 수 기준으로 자르면 이번 페이지 공고의 뒷행들이
     영영 보이지 않게 된다(다음 페이지는 다음 공고들을 받으므로). */
  return {
    items,
    totalCount: localFallback ? filteredDetails.length : detailTotal,
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
