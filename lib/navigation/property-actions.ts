/**
 * 매물·단지 화면에서 쓸 링크 묶음.
 *
 * ⚠️ 2026-07-26 확인: 이 모듈을 import 하는 곳이 저장소에 하나도 없다. 즉 지금은
 * 화면에 나오지 않는다. 그래도 경로를 고쳐 둔다 — 여기 적혀 있던 `/inspection/*`
 * `/ai-analysis/*` 는 이 앱에 없는 경로라서, 누가 나중에 이 모듈을 연결하는
 * 순간 링크가 전부 404 가 되기 때문이다.
 */
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
    /* `/explore` 는 리다이렉트로만 살아 있는 옛 경로(→ /map)라 직접 /map 을 가리킨다.
       `/map/listings` 는 페이지가 아니라 API 라우트다 — 매물 목록은 /listings. */
    exploreHref: districtLabel
      ? `/map?district=${encodeURIComponent(districtLabel)}`
      : "/map",
    listingsHref: `/listings${listings.toString() ? `?${listings.toString()}` : ""}`,
    /* 임장노트 작성 = /notes/new, 목록 = /notes.
       AI 는 툴별 페이지가 없다 — 실존하는 건 허브 /analysis 와 그 하위
       비교/타이밍 등이다. 없는 툴 경로를 지어내지 않고 허브로 보낸다. */
    inspectionCreateHref: `/notes/new${insp.toString() ? `?${insp.toString()}` : ""}`,
    inspectionExploreHref: districtLabel
      ? `/notes?q=${encodeURIComponent(districtLabel)}`
      : "/notes",
    aiDiagnosisHref: aiBase ? `/analysis?${aiBase}` : "/analysis",
    aiCompareHref: aiBase ? `/analysis/compare?${aiBase}` : "/analysis/compare",
    aiInspectionHref: "/analysis",
    complexHref: input.complexId ? `/complex/${input.complexId}` : undefined,
  };
}
