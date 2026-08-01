import { fetchPublicData, isPublicDataLive } from "@/lib/public-data";
import { getServiceSupabase } from "@/lib/supabase/service";
import { listExperts } from "@/lib/experts/store-db";
import {
  DATA_SOURCE_REGISTRY,
  WORKSPACE_AXES,
  sourcesForAxis,
  type WorkspaceAxisId,
} from "@/lib/map/data-workspace-catalog";
import {
  buildDistrictKey,
  type DistrictSnapshotDocument,
} from "@/lib/map/district-snapshot-document";
import { getDistrictSnapshotDocument } from "@/lib/map/district-snapshot-store";
import { logger } from "@/lib/log";

export type WorkspaceMetricChip = {
  id: string;
  label: string;
  value: string;
  sourceId: string;
  live: boolean;
};

export type WorkspaceExpertChip = {
  id: string;
  name: string;
  category: string;
  verified: boolean;
  href: string;
};

export type DistrictWorkspaceResponse = {
  districtLabel: string;
  city: string;
  district: string;
  districtKey: string;
  snapshot?: DistrictSnapshotDocument | null;
  snapshotSource?: "db" | "sample" | "none";
  axes: Record<
    WorkspaceAxisId,
    {
      title: string;
      description: string;
      metrics?: WorkspaceMetricChip[];
      experts?: WorkspaceExpertChip[];
      listingCount?: number;
      consultHref?: string;
    }
  >;
  sources: typeof DATA_SOURCE_REGISTRY;
};

function currentYyyymm(): string {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/* 못 센 것을 0 으로 돌려주면 화면에 "준비 중"이 찍힌다 — 제휴 매물이 아직 없다는
   단정이다. 못 셌으면 null 로 답하고, 화면은 "지금은 알 수 없음"이라고 말한다. */
async function countPartnerListings(district: string): Promise<number | null> {
  const sb = getServiceSupabase();
  if (!sb) return null;
  const { count, error } = await sb
    .from("partner_listings")
    .select("id", { count: "exact", head: true })
    .eq("status", "active")
    .eq("district", district);
  if (error) {
    logger.warn("[district-workspace] partner_listings 집계 실패", error.message);
    return null;
  }
  return count ?? null;
}

function snapshotMetricsFromDocument(
  doc: DistrictSnapshotDocument,
): WorkspaceMetricChip[] {
  const chips: WorkspaceMetricChip[] = [];
  if (doc.population) {
    chips.push({
      id: "population",
      label: "인구",
      value: `${doc.population.total.toLocaleString()}명`,
      sourceId: doc.population.source.toLowerCase(),
      live: true,
    });
  }
  if (doc.safety) {
    chips.push({
      id: "safety",
      label: "치안·교통",
      value: `치안지수 ${doc.safety.crimeRiskIndex}(행정구역 집계) · CCTV ${doc.safety.cctvCount}`,
      sourceId: "safety",
      live: true,
    });
  }
  if (doc.education) {
    chips.push({
      id: "education",
      label: "학군",
      value: doc.education.highSchoolZone ?? `학교 ${doc.education.schoolCount}곳`,
      sourceId: "school",
      live: true,
    });
  }
  if (doc.redevelopment) {
    chips.push({
      id: "redevelopment",
      label: "재개발",
      value: `${doc.redevelopment.count}건 · ${doc.redevelopment.topProjects.slice(0, 2).join(", ")}`,
      sourceId: "redevelopment",
      live: true,
    });
  }
  if (doc.transport?.subwayCrowding?.length) {
    const peak = doc.transport.subwayCrowding[0];
    chips.push({
      id: "transport",
      label: "지하철 혼잡",
      value: `${peak.station} ${peak.peak}%`,
      sourceId: "traffic",
      live: true,
    });
  }
  return chips;
}

async function loadDistrictSnapshots(
  city: string,
  district: string,
): Promise<WorkspaceMetricChip[]> {
  const sb = getServiceSupabase();
  const chips: WorkspaceMetricChip[] = [];
  const yyyymm = currentYyyymm();

  if (sb) {
    /* maybeSingle() 은 행이 2개 이상이어도 error 를 낸다 — districts 에는
       법정동코드 재편으로 남은 중복 시군구가 실제로 있다. lawd_cd 오름차순 첫
       행으로 고르면(district-snapshot-store 의 resolveDistrictId 와 같은 규칙)
       읽기·쓰기가 같은 행을 가리킨다. error 는 삼키지 않고 던진다 —
       못 읽은 것을 "스냅샷 없음"으로 바꿔 아래 공개데이터 폴백으로 흘려보내면,
       장애가 "아직 집계 전"처럼 보인다. */
    const { data: districtRows, error: districtError } = await sb
      .from("districts")
      .select("id")
      .eq("sido", city)
      .eq("sigungu", district)
      .order("lawd_cd", { ascending: true })
      .limit(1);
    if (districtError) {
      throw new Error(
        `districts 조회 실패 (${city} ${district}): ${districtError.message ?? "알 수 없는 오류"}`,
      );
    }

    const districtRow = districtRows?.[0];
    if (districtRow?.id) {
      const { data: snaps, error: snapsError } = await sb
        .from("district_snapshots")
        .select("metric_group, payload, source_authority")
        .eq("district_id", districtRow.id)
        .eq("snapshot_ym", yyyymm)
        .limit(8);
      if (snapsError) {
        throw new Error(
          `district_snapshots 조회 실패 (${city} ${district}): ` +
            `${snapsError.message ?? "알 수 없는 오류"}`,
        );
      }

      for (const s of snaps ?? []) {
        const reg = DATA_SOURCE_REGISTRY.find((r) =>
          String(s.metric_group).includes(r.category.replace("_", "")),
        );
        chips.push({
          id: String(s.metric_group),
          label: reg?.label ?? String(s.metric_group),
          value:
            typeof s.payload === "object" && s.payload && "summary" in s.payload
              ? String((s.payload as { summary: string }).summary)
              : "집계됨",
          sourceId: reg?.id ?? "district_snapshot",
          live: true,
        });
      }
    }
  }

  if (chips.length > 0) return chips;

  const publicSources = sourcesForAxis("public_metrics").slice(0, 6);
  for (const src of publicSources) {
    let value = "—";
    let live = src.envKey ? isPublicDataLive(mapSourceToFetchId(src.id)) : false;

    if (src.id === "molit-apt-sale" || src.id === "molit-apt-rent") {
      try {
        const env = await fetchPublicData("mot-transactions", {
          city,
          district,
          yyyymm,
        });
        live = isPublicDataLive("mot-transactions");
        const rows = env.data as { count?: number } | unknown[];
        value = Array.isArray(rows)
          ? `${rows.length}건`
          : typeof rows === "object" && rows && "count" in rows
            ? `${(rows as { count: number }).count}건`
            : "조회됨";
      } catch {
        value = "mock";
        live = false;
      }
    } else if (src.id === "seoul-redevelopment") {
      try {
        await fetchPublicData("redevelopment", { city, district });
        live = isPublicDataLive("redevelopment");
        value = "레이어";
      } catch {
        value = "—";
      }
    } else if (src.id === "mot-traffic") {
      try {
        await fetchPublicData("ex-congestion", { city, district });
        live = isPublicDataLive("ex-congestion");
        value = "혼잡도";
      } catch {
        value = "—";
      }
    }

    chips.push({
      id: src.id,
      label: src.label,
      value,
      sourceId: src.id,
      live,
    });
  }

  return chips;
}

function mapSourceToFetchId(
  registryId: string,
): "mot-transactions" | "redevelopment" | "ex-congestion" | "facilities" {
  if (registryId.includes("redevelopment")) return "redevelopment";
  if (registryId.includes("traffic")) return "ex-congestion";
  return "mot-transactions";
}

async function loadVerifiedExperts(district: string): Promise<WorkspaceExpertChip[]> {
  const experts = await listExperts();
  return experts
    .filter(
      (e) =>
        e.regions.some((r) => r.includes(district)) ||
        e.category.includes("중개") ||
        e.category.includes("법"),
    )
    .slice(0, 6)
    .map((e) => ({
      id: e.id,
      name: e.name,
      category: e.category,
      verified: e.isVerified,
      /* `/experts/{id}` 라우트 없음 — 목록으로. (전문가 상세가 생기면 되돌린다) */
      href: "/town/experts",
    }));
}

export async function buildDistrictWorkspace(input: {
  city?: string;
  district: string;
  eupmyeondong?: string;
  lat?: number;
  lng?: number;
}): Promise<DistrictWorkspaceResponse> {
  const city = input.city ?? "서울특별시";
  const district = input.district;
  const districtLabel = `${city.replace("특별시", "").replace("광역시", "")} ${district}`.trim();
  const districtKey = buildDistrictKey({
    sido: city,
    sigungu: district,
    eupmyeondong: input.eupmyeondong,
  });

  const { document: snapshot, source: snapshotSource } = await getDistrictSnapshotDocument({
    districtKey,
  });

  const [publicMetrics, experts, listingCount] = await Promise.all([
    snapshot
      ? Promise.resolve(snapshotMetricsFromDocument(snapshot))
      : loadDistrictSnapshots(city, district),
    loadVerifiedExperts(district),
    countPartnerListings(district),
  ]);

  const axes = {} as DistrictWorkspaceResponse["axes"];

  for (const [axisId, meta] of Object.entries(WORKSPACE_AXES) as [
    WorkspaceAxisId,
    (typeof WORKSPACE_AXES)[WorkspaceAxisId],
  ][]) {
    if (axisId === "public_metrics") {
      axes.public_metrics = {
        title: meta.label,
        description: meta.description,
        metrics: publicMetrics,
      };
    } else if (axisId === "nearby_behavior") {
      axes.nearby_behavior = {
        title: meta.label,
        description: meta.description,
        experts,
        metrics: sourcesForAxis("nearby_behavior")
          .filter((s) => s.category === "poi")
          .map((s) => ({
            id: s.id,
            label: s.label,
            value: input.lat != null ? "주변 검색" : "좌표 필요",
            sourceId: s.id,
            /* 제품 지도/검색은 Naver — 키만 있다고 Kakao POI 를 live 로 치면 공급 거짓말 */
            live: false,
          })),
      };
    } else {
      axes.conversion = {
        title: meta.label,
        description: meta.description,
        ...(listingCount != null ? { listingCount } : {}),
        consultHref: `/experts?region=${encodeURIComponent(district)}`,
        metrics: [
          {
            id: "listings",
            label: "파트너 매물",
            /* 0건과 "못 셌음"은 다른 말이다. 못 셌으면 그렇게 적는다. */
            value:
              listingCount == null
                ? "지금은 알 수 없어요"
                : listingCount > 0
                  ? `${listingCount}건`
                  : "0건",
            sourceId: "partner-listings",
            live: listingCount != null,
          },
        ],
      };
    }
  }

  return {
    districtLabel,
    city,
    district,
    districtKey,
    snapshot,
    snapshotSource,
    axes,
    sources: DATA_SOURCE_REGISTRY,
  };
}
