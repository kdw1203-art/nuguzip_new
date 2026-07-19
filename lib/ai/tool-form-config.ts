import type { AiAnalysisToolId } from "@/lib/ai/ai-tools";
import { CORE_AI_TOOL_IDS } from "@/lib/ai/ai-tools";

export type CoreFourToolId = (typeof CORE_AI_TOOL_IDS)[number];

export type WizardStepMeta = {
  id: string;
  title: string;
  /** 필수 입력이 많은 단계 */
  emphasis?: "required" | "optional";
};

export const CORE_TOOL_WIZARD_STEPS: Record<CoreFourToolId, WizardStepMeta[]> = {
  "ai-diagnosis": [
    { id: "core_input", title: "핵심 입력", emphasis: "required" },
    { id: "refine_input", title: "보정 입력", emphasis: "optional" },
    { id: "confirm", title: "실행 전 요약", emphasis: "optional" },
  ],
  "ai-prediction": [
    { id: "core_input", title: "핵심 입력", emphasis: "required" },
    { id: "refine_input", title: "보정 입력", emphasis: "optional" },
    { id: "confirm", title: "실행 전 요약", emphasis: "optional" },
  ],
  "ai-inspection": [
    { id: "core_input", title: "핵심 입력", emphasis: "required" },
    { id: "refine_input", title: "보정 입력", emphasis: "optional" },
    { id: "confirm", title: "실행 전 요약", emphasis: "optional" },
  ],
  "ai-timing": [
    { id: "core_input", title: "핵심 입력", emphasis: "required" },
    { id: "refine_input", title: "보정 입력", emphasis: "optional" },
    { id: "confirm", title: "실행 전 요약", emphasis: "optional" },
  ],
};

/** 필드별 짧은 가이드 (툴팁/보조문구) */
export const FIELD_HINTS: Partial<
  Record<
    AiAnalysisToolId,
    Record<string, { hint: string; sample?: string }>
  >
> = {
  "ai-diagnosis": {
    regionDistrictId: {
      hint: "구를 고르면 스냅샷 단지 후보와 맞춥니다. 모르면 동만 적어도 됩니다.",
    },
    regionFreeText: {
      hint: "대치동·공덕동처럼 동 또는 상권 이름을 적으면 AI가 맥락을 잡습니다.",
      sample: "대치동",
    },
    currentPriceMan: {
      hint: "실거래·호가 중 믿을 만한 금액(만원). 빈칸이면 실행 전에 막힙니다.",
      sample: "125000",
    },
  },
  "ai-prediction": {
    predictionHorizonYears: {
      hint: "기간이 길수록 불확실성이 커집니다. 응답에 구간을 요청합니다.",
    },
    priceScenario: {
      hint: "낙관/기본/비관은 같은 입력이라도 상승·하락 폭 서술 톤을 나눕니다.",
    },
  },
  "ai-inspection": {
    mustHaves: {
      hint: "학군·역세권 등 꼭 보고 싶은 키워드를 쉼표로 나열하면 추천 서술에 반영됩니다.",
      sample: "초품아, 역 10분",
    },
  },
  "ai-timing": {
    districtQuery: {
      hint: "구 이름 일부만 적어도 표가 걸러집니다. 칩으로 여러 구를 고를 수도 있어요.",
    },
    watchList: {
      hint: "관심 단지·동을 줄바꿈으로 적으면 시그널 해석에 참고됩니다.",
    },
  },
};

export function isCoreFourTool(tool: AiAnalysisToolId): tool is CoreFourToolId {
  return (CORE_AI_TOOL_IDS as readonly string[]).includes(tool);
}

/** 0~100 대략적 완성도 (핵심 필드 위주) */
export function coreToolCompleteness(
  tool: CoreFourToolId,
  o: Record<string, unknown>,
): number {
  let num = 0;
  let den = 4;
  const has = (k: string) =>
    o[k] != null && String(o[k]).trim() !== "" && o[k] !== "선택 안 함";

  switch (tool) {
    case "ai-diagnosis":
    case "ai-prediction": {
      den = 5;
      if (has("regionDistrictId") || has("regionFreeText")) num++;
      if (has("complexId") || has("complexNameFree")) num++;
      if (has("currentPriceMan")) num++;
      if (has("areaSqm") || has("areaPyeong")) num++;
      if (tool === "ai-prediction") {
        if (typeof o.predictionHorizonYears === "number" && o.predictionHorizonYears > 0) num++;
      } else if (has("tradeVolume1y") || has("tradeVolume3y") || has("tradeVolume5y")) {
        num++;
      }
      break;
    }
    case "ai-inspection": {
      if (has("goal")) num++;
      if (has("interestNotes") || has("mustHaves")) num += 2;
      if (has("maxTravelMinutes") || has("preferredInspectionDays")) num++;
      den = 4;
      break;
    }
    case "ai-timing": {
      den = 3;
      if (
        has("districtQuery") ||
        (Array.isArray(o.timingDistrictIds) && (o.timingDistrictIds as string[]).length > 0)
      )
        num++;
      if (typeof o.horizonMonths === "number" && o.horizonMonths > 0) num++;
      if (has("watchList")) num++;
      break;
    }
    default:
      return 0;
  }
  return Math.min(100, Math.round((num / den) * 100));
}
