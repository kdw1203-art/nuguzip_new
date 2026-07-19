import { fetchOdcloudApplyhome, isApplyhomeConfigured } from "@/lib/applyhome/odcloud-client";
import type { AptSpecialSupplyRow, SpecialSupplyMetric } from "@/lib/applyhome/types";

function sum3(a?: number, b?: number, c?: number): number {
  return (a ?? 0) + (b ?? 0) + (c ?? 0);
}

export function extractSpecialMetrics(row: AptSpecialSupplyRow): SpecialSupplyMetric[] {
  const metrics: SpecialSupplyMetric[] = [
    {
      id: "mnych",
      label: "다자녀",
      supply: row.MNYCH_HSHLDCO ?? 0,
      requests: sum3(row.CRSPAREA_MNYCH_CNT, row.CTPRVN_MNYCH_CNT, row.ETC_AREA_MNYCH_CNT),
    },
    {
      id: "nwwds",
      label: "신혼·신생아",
      supply: row.NWWDS_NMTW_HSHLDCO ?? 0,
      requests: sum3(
        row.CRSPAREA_NWWDS_NMTW_CNT,
        row.CTPRVN_NWWDS_NMTW_CNT,
        row.ETC_AREA_NWWDS_NMTW_CNT,
      ),
    },
    {
      id: "lfe_frst",
      label: "생애최초",
      supply: row.LFE_FRST_HSHLDCO ?? 0,
      requests: sum3(
        row.CRSPAREA_LFE_FRST_CNT,
        row.CTPRVN_LFE_FRST_CNT,
        row.ETC_AREA_LFE_FRST_CNT,
      ),
    },
    {
      id: "ygmn",
      label: "청년",
      supply: row.YGMN_HSHLDCO ?? 0,
      requests: sum3(row.CRSPAREA_YGMN_CNT, row.CTPRVN_YGMN_CNT, row.ETC_AREA_YGMN_CNT),
    },
    {
      id: "ops",
      label: "노부모",
      supply: row.OLD_PARNTS_SUPORT_HSHLDCO ?? 0,
      requests: sum3(row.CRSPAREA_OPS_CNT, row.CTPRVN_OPS_CNT, row.ETC_AREA_OPS_CNT),
    },
    {
      id: "nwbb",
      label: "신생아(가점)",
      supply: row.NWBB_NWBBSHR_HSHLDCO ?? 0,
      requests: sum3(
        row.CRSPAREA_NWBB_NWBBSHR_CNT,
        row.CTPRVN_NWBB_NWBBSHR_CNT,
        row.ETC_AREA_NWBB_NWBBSHR_CNT,
      ),
    },
    {
      id: "instt",
      label: "기관추천",
      supply: row.INSTT_RECOMEND_HSHLDCO ?? 0,
      requests: (row.INSTT_RECOMEND_DCSN_CNT ?? 0) + (row.INSTT_RECOMEND_PREPAR_CNT ?? 0),
    },
    {
      id: "transr",
      label: "이전기관",
      supply: row.TRANSR_INSTT_ENFSN_HSHLDCO ?? 0,
      requests: row.TRANSR_INSTT_ENFSN_CNT ?? 0,
    },
  ];

  return metrics.filter((m) => m.supply > 0 || m.requests > 0);
}

export async function fetchAptSpecialSupply(options?: {
  page?: number;
  perPage?: number;
  houseManageNo?: string;
  pblancNo?: string;
}): Promise<{ rows: AptSpecialSupplyRow[]; totalCount: number }> {
  if (!isApplyhomeConfigured()) {
    return { rows: [], totalCount: 0 };
  }

  const params: Record<string, string | number | undefined> = {
    page: options?.page ?? 1,
    perPage: Math.min(options?.perPage ?? 20, 50),
  };
  if (options?.houseManageNo) params["cond[HOUSE_MANAGE_NO::EQ]"] = options.houseManageNo;
  if (options?.pblancNo) params["cond[PBLANC_NO::EQ]"] = options.pblancNo;

  const json = await fetchOdcloudApplyhome<AptSpecialSupplyRow>("getAPTSpsplyReqstStus", params);
  return {
    rows: json.data ?? [],
    totalCount: json.totalCount ?? 0,
  };
}
