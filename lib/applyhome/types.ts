export type ApplyhomeCompetitionEndpoint =
  | "getAPTLttotPblancCmpet"
  | "getUrbtyOfctlLttotPblancCmpet"
  | "getPblPvtRentLttotPblancCmpet"
  | "getCancResplLttotPblancCmpet"
  | "getRemndrLttotPblancCmpet"
  | "getAptLttotPblancScore"
  | "getOPTLttotPblancCmpet";

export type ApplyhomeSpecialEndpoint = "getAPTSpsplyReqstStus";

export type ApplyhomeEndpoint = ApplyhomeCompetitionEndpoint | ApplyhomeSpecialEndpoint;

export type ApplyhomeDetailEndpoint = "getAPTLttotPblancDetail";

export type ApplyhomeSearchTab = "competition" | "special";

export type OdcloudListResponse<T> = {
  page: number;
  perPage: number;
  totalCount: number;
  currentCount: number;
  matchCount: number;
  data: T[];
};

export type AptDetailRow = {
  HOUSE_MANAGE_NO: string;
  PBLANC_NO: string;
  HOUSE_NM: string;
  HOUSE_SECD_NM?: string;
  HOUSE_DTL_SECD_NM?: string;
  SUBSCRPT_AREA_CODE_NM?: string;
  HSSPLY_ADRES?: string;
  TOT_SUPLY_HSHLDCO?: number;
  RCEPT_BGNDE?: string;
  RCEPT_ENDDE?: string;
  RCRIT_PBLANC_DE?: string;
  PBLANC_URL?: string;
  BSNS_MBY_NM?: string;
};

export type AptCompetitionRow = {
  HOUSE_MANAGE_NO: string;
  PBLANC_NO: string;
  MODEL_NO?: string;
  HOUSE_TY: string;
  SUPLY_HSHLDCO?: number;
  SUBSCRPT_RANK_CODE?: number;
  RESIDE_SECD?: string;
  RESIDE_SENM?: string;
  REQ_CNT?: string;
  CMPET_RATE?: string;
};

export type AptSpecialSupplyRow = {
  HOUSE_MANAGE_NO: string;
  PBLANC_NO: string;
  HOUSE_TY: string;
  SPSPLY_HSHLDCO?: number;
  MNYCH_HSHLDCO?: number;
  NWWDS_NMTW_HSHLDCO?: number;
  LFE_FRST_HSHLDCO?: number;
  YGMN_HSHLDCO?: number;
  OLD_PARNTS_SUPORT_HSHLDCO?: number;
  NWBB_NWBBSHR_HSHLDCO?: number;
  INSTT_RECOMEND_HSHLDCO?: number;
  TRANSR_INSTT_ENFSN_HSHLDCO?: number;
  CRSPAREA_MNYCH_CNT?: number;
  CTPRVN_MNYCH_CNT?: number;
  ETC_AREA_MNYCH_CNT?: number;
  CRSPAREA_NWWDS_NMTW_CNT?: number;
  CTPRVN_NWWDS_NMTW_CNT?: number;
  ETC_AREA_NWWDS_NMTW_CNT?: number;
  CRSPAREA_LFE_FRST_CNT?: number;
  CTPRVN_LFE_FRST_CNT?: number;
  ETC_AREA_LFE_FRST_CNT?: number;
  CRSPAREA_YGMN_CNT?: number;
  CTPRVN_YGMN_CNT?: number;
  ETC_AREA_YGMN_CNT?: number;
  CRSPAREA_OPS_CNT?: number;
  CTPRVN_OPS_CNT?: number;
  ETC_AREA_OPS_CNT?: number;
  CRSPAREA_NWBB_NWBBSHR_CNT?: number;
  CTPRVN_NWBB_NWBBSHR_CNT?: number;
  ETC_AREA_NWBB_NWBBSHR_CNT?: number;
  INSTT_RECOMEND_DCSN_CNT?: number;
  INSTT_RECOMEND_PREPAR_CNT?: number;
  TRANSR_INSTT_ENFSN_CNT?: number;
  SUBSCRPT_RESULT_NM?: string;
};

export type SpecialSupplyMetric = {
  id: string;
  label: string;
  supply: number;
  requests: number;
};

export type ApplyhomeListingItem = {
  id: string;
  houseManageNo: string;
  pblancNo: string;
  houseName: string;
  region: string;
  address?: string;
  houseType: string;
  houseKind?: string;
  supplyCount: number;
  competitionRate?: string;
  requestCount?: string;
  resideLabel?: string;
  rankCode?: number;
  subscriptionPeriod?: string;
  announceDate?: string;
  builder?: string;
  portalUrl?: string;
  specialSupplyTotal?: number;
  specialMetrics?: SpecialSupplyMetric[];
  resultLabel?: string;
};

export type ApplyhomeSearchPayload = {
  mode: "live" | "mock";
  tab: ApplyhomeSearchTab;
  detailAvailable: boolean;
  detailNotice?: string;
  filters: {
    region: string;
    q: string;
    pblancNo?: string;
  };
  totalCount: number;
  items: ApplyhomeListingItem[];
  portalUrl: string;
  fetchedAt: string;
};

/** @deprecated use ApplyhomeSearchPayload */
export type ApplyhomeCompetitionPayload = {
  mode: "live" | "mock";
  endpoint: ApplyhomeEndpoint;
  totalCount: number;
  items: Array<{
    houseManageNo: string;
    pblancNo: string;
    houseType: string;
    supplyCount: number;
    regionLabel: string;
    competitionRate: string;
    requestCount: string;
    rankCode?: number;
  }>;
  portalUrl: string;
  swaggerUrl: string;
  fetchedAt: string;
};

export const APPLYHOME_PORTAL_URL =
  "https://www.data.go.kr/data/15125682/openapi.do";
export const APPLYHOME_DETAIL_PORTAL_URL =
  "https://www.data.go.kr/data/15098547/openapi.do";
export const APPLYHOME_DETAIL_SWAGGER_URL =
  "https://infuser.odcloud.kr/api/stages/37000/api-docs";
export const APPLYHOME_SWAGGER_URL =
  "https://infuser.odcloud.kr/api/stages/36148/api-docs";
