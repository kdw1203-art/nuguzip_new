import { getBackendMode, type DataEnvelope, type LocationRef } from "./types";
import { isSeoulApiConfigured } from "@/lib/seoul/openapi-client";
import { fetchUpisRebuild } from "@/lib/seoul/adapters";

/**
 * 정비사업 — 서울 upisRebuild Open API.
 */

export type RedevelopmentStage =
  | "기본계획"
  | "정비구역"
  | "조합설립"
  | "사업시행"
  | "관리처분"
  | "착공"
  | "준공";

export type RedevelopmentProject = {
  zoneName: string;
  stage: RedevelopmentStage;
  developer: string;
  hasUnion: boolean;
  expectedUnits: number;
  startedYear: number | null;
};

export type RedevelopmentSummary = {
  location: LocationRef;
  projects: RedevelopmentProject[];
  totalActive: number;
};

const STAGE_KEYWORDS: Array<{ re: RegExp; stage: RedevelopmentStage }> = [
  { re: /준공|완료/, stage: "준공" },
  { re: /착공|공사/, stage: "착공" },
  { re: /관리처분|처분/, stage: "관리처분" },
  { re: /시행|추진/, stage: "사업시행" },
  { re: /조합/, stage: "조합설립" },
  { re: /구역|지정/, stage: "정비구역" },
];

function inferStage(text: string): RedevelopmentStage {
  for (const { re, stage } of STAGE_KEYWORDS) {
    if (re.test(text)) return stage;
  }
  return "정비구역";
}

function mockRedevelopment(location: LocationRef): RedevelopmentSummary {
  const seed = `${location.city}${location.district ?? ""}`.length;
  const stages: RedevelopmentStage[] = [
    "정비구역",
    "조합설립",
    "사업시행",
    "관리처분",
    "착공",
  ];
  const devs = ["삼성물산", "현대건설", "GS건설", "대우건설", "DL이앤씨", "포스코이앤씨"];
  const names = ["한빛", "장미", "신도", "우성", "무궁", "화양"];
  const projects: RedevelopmentProject[] = Array.from({ length: 4 }, (_, i) => ({
    zoneName: `${location.district ?? ""} ${names[(seed + i) % names.length]} 재개발 ${i + 1}구역`,
    stage: stages[(seed + i) % stages.length],
    developer: devs[(seed + i) % devs.length],
    hasUnion: (seed + i) % 3 !== 0,
    expectedUnits: 480 + ((seed + i) % 14) * 120,
    startedYear: 2018 + ((seed + i) % 6),
  }));
  return {
    location,
    projects,
    totalActive: projects.filter((p) => p.stage !== "정비구역").length,
  };
}

export async function getRedevelopmentSummary(
  location: LocationRef,
): Promise<DataEnvelope<RedevelopmentSummary>> {
  const envKey = "SEOUL_DATA_API_KEY";
  const mode = getBackendMode(envKey);

  if (mode === "live" && isSeoulApiConfigured()) {
    try {
      const live = await fetchUpisRebuild({
        city: location.city,
        district: location.district,
      });
      const projects: RedevelopmentProject[] = live.projects.slice(0, 20).map((p) => {
        const stageText = `${p.subCategory}${p.midCategory}${p.category}`;
        const stage = inferStage(stageText);
        return {
          zoneName: p.zoneName,
          stage,
          developer: p.midCategory || "—",
          hasUnion: /조합|재건축/.test(stageText),
          expectedUnits: Math.max(100, Math.round(p.areaSqm / 85)),
          startedYear: null,
        };
      });
      return {
        source: "redevelopment-mongddang",
        sourceLabel: "정비사업(upisRebuild)",
        unit: "COUNT",
        viz: "list",
        updatedAt: new Date().toISOString().slice(0, 10),
        mode: "live",
        attribution: "서울 열린데이터광장 upisRebuild",
        isLocationBased: true,
        data: {
          location,
          projects,
          totalActive: live.activeProjects,
        },
      };
    } catch {
      // fall through
    }
  }

  return {
    source: "redevelopment-mongddang",
    sourceLabel: "정비사업몽땅",
    unit: "COUNT",
    viz: "list",
    updatedAt: new Date().toISOString().slice(0, 10),
    mode: "mock",
    attribution: "서울시 정비사업몽땅 (cleanup.seoul.go.kr)",
    isLocationBased: true,
    data: mockRedevelopment(location),
  };
}
