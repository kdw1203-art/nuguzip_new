import {
  fetchOdcloudApplyhomeDetail,
  isApplyhomeConfigured,
} from "@/lib/applyhome/odcloud-client";
import type { AptDetailRow } from "@/lib/applyhome/types";

export function detailKey(houseManageNo: string, pblancNo: string): string {
  return `${houseManageNo}:${pblancNo}`;
}

export async function fetchAptDetailPage(options?: {
  page?: number;
  perPage?: number;
  region?: string;
  houseManageNo?: string;
  pblancNo?: string;
  /** 주택명 부분 검색 (cond[HOUSE_NM::LIKE]) */
  q?: string;
}): Promise<{ rows: AptDetailRow[]; totalCount: number }> {
  if (!isApplyhomeConfigured()) {
    return { rows: [], totalCount: 0 };
  }

  const params: Record<string, string | number | undefined> = {
    page: options?.page ?? 1,
    perPage: Math.min(options?.perPage ?? 50, 100),
  };
  if (options?.houseManageNo) params["cond[HOUSE_MANAGE_NO::EQ]"] = options.houseManageNo;
  if (options?.pblancNo) params["cond[PBLANC_NO::EQ]"] = options.pblancNo;
  if (options?.region && options.region !== "전체") {
    params["cond[SUBSCRPT_AREA_CODE_NM::EQ]"] = options.region;
  }
  const q = options?.q?.trim();
  if (q) params["cond[HOUSE_NM::LIKE]"] = q;

  const json = await fetchOdcloudApplyhomeDetail<AptDetailRow>("getAPTLttotPblancDetail", params);
  return {
    rows: json.data ?? [],
    totalCount: json.totalCount ?? 0,
  };
}

export async function fetchAptDetailMap(
  keys: Array<{ houseManageNo: string; pblancNo: string }>,
): Promise<Map<string, AptDetailRow>> {
  const map = new Map<string, AptDetailRow>();
  if (!isApplyhomeConfigured() || keys.length === 0) return map;

  const unique = Array.from(
    new Map(keys.map((k) => [detailKey(k.houseManageNo, k.pblancNo), k])).values(),
  ).slice(0, 12);

  const results = await Promise.allSettled(
    unique.map((k) =>
      fetchAptDetailPage({
        houseManageNo: k.houseManageNo,
        pblancNo: k.pblancNo,
        perPage: 1,
      }),
    ),
  );

  for (const result of results) {
    if (result.status !== "fulfilled") continue;
    for (const row of result.value.rows) {
      map.set(detailKey(row.HOUSE_MANAGE_NO, row.PBLANC_NO), row);
    }
  }

  return map;
}
