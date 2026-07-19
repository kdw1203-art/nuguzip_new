import { workbenchDistrictIdFromLabel } from "@/lib/ai/region-map";

export type PropertyActionInput = {
  /** 행정구역 라벨 (예: 강남구) */
  districtLabel: string;
  aptName?: string;
  lat?: number;
  lng?: number;
  complexId?: string;
  /** 임장 의도 (실거주·투자 등) */
  intent?: string;
};

export type PropertyActions = {
  districtId: string | null;
  districtLabel: string;
  exploreHref: string;
  listingsHref: string;
  inspectionCreateHref: string;
  inspectionExploreHref: string;
  aiDiagnosisHref: string;
  aiCompareHref: string;
  aiInspectionHref: string;
  complexHref?: string;
};

/** 지도·매물·임장노트·AI 간 딥링크 URL을 한곳에서 생성한다. */
export function buildPropertyActions(input: PropertyActionInput): PropertyActions {
  const districtLabel = input.districtLabel.trim();
  const districtId = workbenchDistrictIdFromLabel(districtLabel);

  const insp = new URLSearchParams();
  if (districtLabel) insp.set("region", districtLabel);
  if (input.aptName) insp.set("aptName", input.aptName);
  if (input.lat != null && Number.isFinite(input.lat)) insp.set("lat", String(input.lat));
  if (input.lng != null && Number.isFinite(input.lng)) insp.set("lng", String(input.lng));
  if (input.intent) insp.set("intent", input.intent);

  const listings = new URLSearchParams();
  if (districtLabel) listings.set("gu", districtLabel);
  if (input.complexId) listings.set("complexId", input.complexId);
  if (input.lat != null && Number.isFinite(input.lat)) listings.set("lat", String(input.lat));
  if (input.lng != null && Number.isFinite(input.lng)) listings.set("lng", String(input.lng));
  if (input.lat != null && input.lng != null) listings.set("lv", "5");

  const aiBase = districtId
    ? `district=${encodeURIComponent(districtId)}`
    : districtLabel
      ? `district=${encodeURIComponent(districtLabel)}`
      : "";

  return {
    districtId,
    districtLabel,
    exploreHref: districtLabel
      ? `/explore?district=${encodeURIComponent(districtLabel)}`
      : "/explore",
    listingsHref: `/map/listings${listings.toString() ? `?${listings.toString()}` : ""}`,
    inspectionCreateHref: `/inspection/create${insp.toString() ? `?${insp.toString()}` : ""}`,
    inspectionExploreHref: districtLabel
      ? `/inspection/explore?q=${encodeURIComponent(districtLabel)}`
      : "/inspection/explore",
    aiDiagnosisHref: aiBase ? `/ai-analysis/ai-diagnosis?${aiBase}` : "/ai-analysis/ai-diagnosis",
    aiCompareHref: aiBase ? `/ai-analysis/ai-compare?${aiBase}` : "/ai-analysis/ai-compare",
    aiInspectionHref: "/ai-analysis/ai-inspection",
    complexHref: input.complexId ? `/complex/${input.complexId}` : undefined,
  };
}
