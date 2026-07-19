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

async function countPartnerListings(district: string): Promise<number> {
  const sb = getServiceSupabase();
  if (!sb) return 0;
  const { count } = await sb
    .from("partner_listings")
    .select("id", { count: "exact", head: true })
    .eq("status", "active");
  if (count != null) return count;
  return 0;
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
      value: `위험 ${doc.safety.crimeRiskIndex} · CCTV ${doc.safety.cctvCount}`,
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
    const { data: districtRow } = await sb
      .from("districts")
      .select("id")
      .eq("sido", city)
      .eq("sigungu", district)
      .maybeSingle();

    if (districtRow?.id) {
      const { data: snaps } = await sb
        .from("district_snapshots")
        .select("metric_group, payload, source_authority")
        .eq("district_id", districtRow.id)
        .eq("snapshot_ym", yyyymm)
        .limit(8);

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
      href: `/experts/${e.id}`,
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
            live: Boolean(process.env.KAKAO_REST_API_KEY?.trim()),
          })),
      };
    } else {
      axes.conversion = {
        title: meta.label,
        description: meta.description,
        listingCount,
        consultHref: `/experts?region=${encodeURIComponent(district)}`,
        metrics: [
          {
            id: "listings",
            label: "파트너 매물",
            value: listingCount > 0 ? `${listingCount}건` : "준비 중",
            sourceId: "partner-listings",
            live: listingCount > 0,
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
