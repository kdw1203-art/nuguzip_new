import { fetchAllSeoulRows, matchesDistrict } from "../openapi-client";

export type UpisRebuildProject = {
  id: string;
  zoneName: string;
  category: string;
  midCategory: string;
  subCategory: string;
  position: string;
  areaSqm: number;
  reportType: string;
  city: string;
};

export type UpisRebuildPayload = {
  district: string;
  city: string;
  projects: UpisRebuildProject[];
  activeProjects: number;
  plannedProjects: number;
  estimatedUnits: number;
  nearestCompletionYear: number;
  mode: "live" | "mock";
};

function mapRow(row: Record<string, unknown>): UpisRebuildProject {
  const area = Number(row.AREA_EXS ?? row.AREA_CHG_AFTR ?? 0);
  return {
    id: String(row.RPT_MNG_CD ?? row.PRJC_CD ?? ""),
    zoneName: String(row.RGN_NM ?? row.PSTN_NM ?? "미상 구역"),
    category: String(row.LCLSF ?? ""),
    midCategory: String(row.MCLSF ?? ""),
    subCategory: String(row.SCLSF ?? ""),
    position: String(row.PSTN_NM ?? ""),
    areaSqm: Number.isFinite(area) ? area : 0,
    reportType: String(row.RPT_TYPE ?? ""),
    city: String(row.LOGVM ?? "서울특별시"),
  };
}

function isActiveProject(p: UpisRebuildProject): boolean {
  const text = `${p.subCategory}${p.midCategory}${p.category}`;
  return /재개발|재건축|정비|조합|시행|착공/.test(text);
}

export async function fetchUpisRebuild(
  params: { city?: string; district?: string },
  maxPages = 3,
): Promise<UpisRebuildPayload> {
  const district = params.district ?? "";
  const batch = await fetchAllSeoulRows("upisRebuild", { maxPages, pageSize: 1000 });
  const projects = batch.rows
    .map(mapRow)
    .filter((p) => {
      if (!district) return true;
      return (
        matchesDistrict(district, p.zoneName) ||
        matchesDistrict(district, p.position) ||
        p.zoneName.includes(district.replace("구", ""))
      );
    });

  const active = projects.filter(isActiveProject);
  const planned = projects.filter((p) => !isActiveProject(p));
  const totalArea = projects.reduce((sum, p) => sum + p.areaSqm, 0);

  return {
    district: district || "전체",
    city: params.city ?? "서울",
    projects: projects.slice(0, 200),
    activeProjects: active.length,
    plannedProjects: planned.length,
    estimatedUnits: Math.round(totalArea / 85),
    nearestCompletionYear: new Date().getFullYear() + 3,
    mode: "live",
  };
}
