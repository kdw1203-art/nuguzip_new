import {
  fetchVworldGetFeature,
  isVworldConfigured,
  probeVworldDataset,
  VworldApiError,
} from "@/lib/vworld/client";
import { matchesDistrict } from "@/lib/seoul/openapi-client";

export type RebBrokerRow = {
  name: string;
  district: string;
  address: string;
  tel: string;
};

export type RebBrokerPayload = {
  district: string;
  rows: RebBrokerRow[];
  mode: "live" | "mock" | "unavailable";
  source: "vworld-reb-broker";
};

/** 국토교통부 부동산중개업정보 — VWorld 2D 데이터 레이어 (키 활성화 후 포털 데이터목록에서 확인) */
export const VWORLD_REB_BROKER_LAYER =
  process.env.VWORLD_REB_BROKER_LAYER?.trim() || "LT_C_REBOPNBRKRUPINFO";

function pickString(props: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = props[k];
    if (v != null && String(v).trim()) return String(v).trim();
  }
  return "";
}

function mapBrokerRow(props: Record<string, unknown>): RebBrokerRow {
  const address =
    pickString(props, [
      "rdnmadr",
      "rdnm_adr",
      "road_nm",
      "rn_addr",
      "addr",
      "hssply_adres",
      "locplc_addr",
    ]) || pickString(props, ["lotno_addr", "lnm_addr"]);

  const district =
    pickString(props, ["ld_cgg_nm", "cgg_nm", "sgg_nm", "sig_kor_nm"]) ||
    (address.match(/([가-힣]+(?:시|군|구))/)?.[1] ?? "");

  return {
    name: pickString(props, [
      "bsnm_cmpnm",
      "cmp_nm",
      "ofc_nm",
      "brk_nm",
      "brkr_nm",
      "jurirno",
    ]),
    district,
    address,
    tel: pickString(props, ["telno", "tel", "mdhs_telno", "phone"]),
  };
}

export async function isVworldRebBrokerAvailable(): Promise<boolean> {
  return probeVworldDataset(VWORLD_REB_BROKER_LAYER);
}

export async function fetchVworldRebBrokers(params: {
  district?: string;
  q?: string;
  page?: number;
  perPage?: number;
}): Promise<RebBrokerPayload> {
  const district = params.district ?? "";

  if (!isVworldConfigured()) {
    return { district: district || "전체", rows: [], mode: "mock", source: "vworld-reb-broker" };
  }

  const attrParts: string[] = [];
  if (district.trim()) {
    attrParts.push(`ld_cgg_nm:like:${district.replace(/구$/, "")}`);
  }
  if (params.q?.trim()) {
    attrParts.push(`bsnm_cmpnm:like:${params.q.trim()}`);
  }

  try {
    const { featureCollection } = await fetchVworldGetFeature({
      data: VWORLD_REB_BROKER_LAYER,
      page: params.page ?? 1,
      size: Math.min(params.perPage ?? 100, 1000),
      geometry: false,
      attrFilter: attrParts.length ? attrParts.join("|") : undefined,
    });

    const rows = (featureCollection.features ?? [])
      .map((f) => mapBrokerRow(f.properties ?? {}))
      .filter((r) => r.name || r.address)
      .filter((r) => matchesDistrict(district, r.district || r.address));

    return {
      district: district || "전체",
      rows: rows.slice(0, 100),
      mode: "live",
      source: "vworld-reb-broker",
    };
  } catch (err) {
    if (err instanceof VworldApiError && err.code === "INVALID_RANGE") {
      return {
        district: district || "전체",
        rows: [],
        mode: "unavailable",
        source: "vworld-reb-broker",
      };
    }
    throw err;
  }
}
