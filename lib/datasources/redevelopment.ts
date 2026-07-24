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

/* 사실 우선: 여기 있던 mockRedevelopment() 를 삭제했다.
   실제 구 이름에 "강남구 한빛 재개발 1구역" 같은 존재하지 않는 구역명을 붙이고,
   추진 단계(조합설립·사업시행·관리처분·착공)를 단정하고, 시공사 자리에 실존
   건설사(삼성물산·현대건설·GS건설·대우건설·DL이앤씨·포스코이앤씨)를 배정하고,
   예상 세대수와 착수연도까지 지어냈다. 그러고는 attribution 에
   "서울시 정비사업몽땅 (cleanup.seoul.go.kr)" 을 달아 시청 공개자료처럼 보이게 했다.
   정비사업 단계는 매수 판단을 직접 좌우하고, 실존 건설사 이름을 가짜 사업장에
   붙이는 것은 그 회사에 대한 허위 사실이기도 하다.
   실제 사업장은 redevelopment_projects 테이블(공개 자료 적재분)과 서울
   upisRebuild API 로만 제공한다 — 없으면 빈 목록이다. */
function unavailableRedevelopment(location: LocationRef): RedevelopmentSummary {
  return { location, projects: [], totalActive: 0 };
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

  // 실집계를 못 받아온 상태 — 서울시 출처 표기를 달지 않는다(그 데이터가 아니므로).
  return {
    source: "redevelopment-mongddang",
    sourceLabel: "정비사업 (미연동)",
    unit: "COUNT",
    viz: "list",
    updatedAt: new Date().toISOString().slice(0, 10),
    mode: "mock",
    attribution: "API 키 미설정 — 정비사업 데이터를 불러오지 못했습니다",
    isLocationBased: true,
    data: unavailableRedevelopment(location),
  };
}
