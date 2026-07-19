import type { InspectionNote, InspectionScores, InspectionSections } from "@/lib/inspection/store-db";

export type InspectionAiIntent = "실거주" | "투자" | "전월세";

export type InspectionAiReport = {
  headline: string;
  summary: string;
  strengths: string[];
  risks: string[];
  followUps: string[];
  keywords: string[];
  verdict: string;
  recommendedAction: string;
  mapFocusRegion: string;
  mapFocusReason: string;
  scores: {
    residence: number;
    investment: number;
    infra: number;
  };
  source: "fallback" | "openai" | "anthropic" | "live";
  generatedAt: string;
};

type ReportOptions = {
  intent?: InspectionAiIntent;
  source?: InspectionAiReport["source"];
};

type PromptInput = {
  intent: InspectionAiIntent;
  region: string;
  aptName: string;
  title: string;
  summary: string;
  visitDate: string;
  weather: string;
  transportation: string;
  completedChecks: string[];
  allChecks: string[];
  sections: InspectionSections;
  photosCount: number;
  scores: InspectionScores;
};

function toText(value: unknown, maxLength = 240): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function normalizeTextList(value: unknown, maxItems = 5, maxLength = 96): string[] {
  if (Array.isArray(value)) {
    return [...new Set(value.map((item) => toText(item, maxLength)).filter(Boolean))].slice(0, maxItems);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      return normalizeTextList(JSON.parse(trimmed), maxItems, maxLength);
    } catch {
      return [...new Set(trimmed.split(",").map((item) => toText(item, maxLength)).filter(Boolean))].slice(
        0,
        maxItems,
      );
    }
  }

  return [];
}

function clampScore(value: unknown, fallback = 50): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(100, Math.max(0, Math.round(parsed)));
}

function scoreTo100(score: unknown): number {
  return clampScore(Number(score ?? 0) * 20, 0);
}

function includesAnyText(source: string, needles: string[]): boolean {
  return needles.some((needle) => source.includes(needle));
}

function average(values: number[], fallback = 50): number {
  const clean = values.filter((value) => Number.isFinite(value));
  if (!clean.length) return fallback;
  return clampScore(clean.reduce((sum, value) => sum + value, 0) / clean.length, fallback);
}

function noteIntent(note: InspectionNote, fallback?: InspectionAiIntent): InspectionAiIntent {
  const raw = note.metadata?.intent ?? fallback;
  if (raw === "투자" || raw === "전월세" || raw === "실거주") return raw;
  return "실거주";
}

function checkLabels(note: InspectionNote): { completed: string[]; all: string[] } {
  const all = note.checklist.map((item) => toText(item.label, 40)).filter(Boolean);
  const completed = note.checklist
    .filter((item) => item.done)
    .map((item) => toText(item.label, 40))
    .filter(Boolean);
  return {
    all: [...new Set(all)],
    completed: [...new Set(completed)],
  };
}

function sectionText(note: InspectionNote, maxLength = 1200): string {
  return [
    note.summary,
    note.sections.pros,
    note.sections.cons,
    note.sections.location,
    note.sections.school,
    note.sections.transport,
    note.sections.facility,
    note.sections.future,
    note.sections.memo,
  ]
    .map((value) => toText(value, maxLength))
    .filter(Boolean)
    .join(" ");
}

export function buildInspectionAiPromptInput(note: InspectionNote, options: ReportOptions = {}): PromptInput {
  const labels = checkLabels(note);
  return {
    intent: noteIntent(note, options.intent),
    region: toText(note.region, 80),
    aptName: toText(note.aptName, 120),
    title: toText(note.title, 120),
    summary: toText(note.summary, 800),
    visitDate: toText(note.visitDate, 20),
    weather: toText(note.weather, 120),
    transportation: toText(note.transportation, 120),
    completedChecks: labels.completed.slice(0, 16),
    allChecks: labels.all.slice(0, 24),
    sections: note.sections,
    photosCount: note.photos.length,
    scores: note.scores,
  };
}

export function buildFallbackInspectionAiReport(
  note: InspectionNote,
  options: ReportOptions = {},
): InspectionAiReport {
  const generatedAt = new Date().toISOString();
  const intent = noteIntent(note, options.intent);
  const region = toText(note.region, 80);
  const aptName = toText(note.aptName, 120);
  const title = toText(note.title, 120);
  const targetLabel = aptName || region || title || "현장";
  const labels = checkLabels(note);
  const completedChecks = labels.completed;
  const allText = [sectionText(note), completedChecks.join(" "), note.weather, note.transportation].join(" ");

  const strengths: string[] = [];
  const risks: string[] = [];
  const followUps: string[] = [];

  if (region) strengths.push("지역 기준이 명확해 같은 생활권 후보와 비교하기 좋습니다.");
  if (aptName) strengths.push("단지명이 있어 유사 평형과 최근 거래 흐름을 붙여 보기 쉽습니다.");
  if (note.summary || note.sections.memo) strengths.push("현장 메모가 남아 있어 체감 요소를 판단 근거로 쓸 수 있습니다.");
  if (note.photos.length > 0) strengths.push("사진 근거가 있어 채광, 공용부, 동선 상태를 다시 확인할 수 있습니다.");
  if (completedChecks.includes("개발호재") || includesAnyText(allText, ["재개발", "재건축", "호재", "개발"])) {
    strengths.push("개발호재 관점의 단서가 있어 투자 비교 포인트를 잡기 쉽습니다.");
  }
  if (completedChecks.includes("상권") || includesAnyText(allText, ["상권", "편의", "마트", "카페"])) {
    strengths.push("상권과 편의시설 관련 단서가 있어 생활 인프라 비교에 유리합니다.");
  }
  if (note.scores.transport >= 4) strengths.push("교통 점수가 높아 이동 편의성 측면의 우선순위가 분명합니다.");
  if (note.scores.future >= 4) strengths.push("미래가치 점수가 높아 중장기 변화 요인을 계속 추적할 만합니다.");

  if (!note.summary && !note.sections.memo) {
    risks.push("핵심 메모가 부족해 AI가 현장 분위기와 실제 불편 요소를 판단하기 어렵습니다.");
  }
  if (note.photos.length === 0) {
    risks.push("사진 근거가 없어 채광, 공용부, 주차 동선 같은 현장 상태 확인이 제한됩니다.");
  }
  if (completedChecks.length === 0) {
    risks.push("체크리스트가 비어 있어 우선순위를 잡을 기준이 부족합니다.");
  }
  if (note.scores.transport <= 2) risks.push("교통 점수가 낮아 출퇴근 동선과 대체 교통수단 재확인이 필요합니다.");
  if (note.scores.school <= 2 && intent === "실거주") {
    risks.push("학군 점수가 낮아 실거주 수요와 향후 환금성 판단을 보수적으로 봐야 합니다.");
  }
  if (note.scores.future <= 2 && intent === "투자") {
    risks.push("미래가치 점수가 낮아 개발호재나 공급 리스크를 추가로 검증해야 합니다.");
  }
  if (!note.sections.cons && !includesAnyText(allText, ["리스크", "주의", "불편", "소음", "혼잡"])) {
    risks.push("단점 메모가 약해 최종 판단 전에 리스크 항목을 의식적으로 보강하는 편이 좋습니다.");
  }

  if (!note.sections.cons) followUps.push("단점과 리스크를 2~3개만 더 적어 등기, 누수, 관리비 같은 확인 항목을 분명히 하세요.");
  if (!note.sections.memo) followUps.push("주변 소음, 상권 분위기, 출퇴근 동선처럼 현장 체감 메모를 한두 문장 보강하세요.");
  if (note.photos.length === 0) followUps.push("사진에서 보이는 채광, 공용부, 주차 동선 근거를 추가하세요.");
  if (!region) followUps.push("지역명을 구체적으로 적어 지도 기반 후보 비교가 가능하게 만드세요.");
  if (intent === "투자") {
    followUps.push("같은 권역 매물과 가격 흐름을 비교한 뒤 개발호재와 공급 리스크를 함께 정리하세요.");
  } else if (intent === "전월세") {
    followUps.push("생활권과 교통 위주로 비교 후보를 확인한 뒤 전월세 조건 차이를 따로 정리하세요.");
  } else {
    followUps.push("채광, 소음, 주차, 학군 중 빠진 항목을 채운 뒤 실거주 후보끼리 비교하세요.");
  }

  const summaryParts = [
    `${intent} 관점에서 ${targetLabel} 임장 메모를 구조화했습니다.`,
    strengths[0] ? `강점은 ${strengths[0]}` : "입력 근거를 조금 더 보강하면 해석 정확도가 올라갑니다.",
    risks[0] ? `우선 보완할 점은 ${risks[0]}` : "현재 메모 기준으로는 큰 공백 없이 비교 준비가 진행되고 있습니다.",
  ];

  const score100 = {
    location: scoreTo100(note.scores.location),
    school: scoreTo100(note.scores.school),
    transport: scoreTo100(note.scores.transport),
    facility: scoreTo100(note.scores.facility),
    future: scoreTo100(note.scores.future),
  };
  const completeness = Math.min(
    1,
    [
      region,
      aptName,
      note.summary,
      note.sections.pros,
      note.sections.cons,
      note.sections.memo,
      ...completedChecks,
      ...note.photos,
    ].filter(Boolean).length / 12,
  );
  const completenessBoost = Math.round(completeness * 10);
  const residence = average(
    [score100.location, score100.school, score100.transport, score100.facility],
    50,
  ) + completenessBoost;
  const investment = average([score100.location, score100.transport, score100.future], 50) + completenessBoost;
  const infra = average([score100.transport, score100.facility, score100.school], 50) + completenessBoost;
  const keywords = [
    region,
    aptName,
    intent,
    ...completedChecks,
    ...(note.weather ? [note.weather] : []),
  ].filter(Boolean);

  return {
    headline: `${targetLabel} ${intent} AI 리포트`,
    summary: summaryParts.join(" "),
    strengths: (strengths.length ? strengths : ["핵심 판단 재료가 일부 정리되어 다음 비교 단계로 이어질 수 있습니다."]).slice(0, 5),
    risks: (risks.length ? risks : ["입력 근거가 아직 간단해 세부 비교 전 추가 메모를 권장합니다."]).slice(0, 5),
    followUps: (followUps.length ? followUps : ["지도 비교와 게시글 초안 연결 전에 핵심 메모를 한두 줄 더 보강하세요."]).slice(0, 5),
    keywords: [...new Set(keywords.map((item) => toText(item, 40)).filter(Boolean))].slice(0, 8),
    verdict:
      `${intent} 판단은 가능하지만, 빠진 체크 포인트를 보강한 뒤 ${targetLabel}와 비교 후보를 함께 보는 편이 안전합니다.`,
    recommendedAction:
      intent === "투자"
        ? "같은 권역 매물과 가격 흐름을 먼저 비교한 뒤 투자 메모를 게시글 초안으로 정리하세요."
        : intent === "전월세"
          ? "생활권과 동선 위주로 비교 후보를 확인한 뒤 조건 차이를 함께 정리하세요."
          : "실거주 핵심 체크를 한두 개 더 채운 뒤 지도 비교와 게시글 초안 정리를 이어가세요.",
    mapFocusRegion: region || aptName,
    mapFocusReason: region
      ? `${region} 기준으로 같은 생활권 후보와 공공데이터 비교를 이어갈 수 있습니다.`
      : aptName
        ? `${aptName}를 기준으로 유사 후보를 찾되, 지역명이 있으면 비교 정확도가 올라갑니다.`
        : "지역명이나 단지명이 있으면 지도 추천 정확도가 더 높아집니다.",
    scores: {
      residence: clampScore(residence, 50),
      investment: clampScore(investment, 50),
      infra: clampScore(infra, 50),
    },
    source: options.source ?? "fallback",
    generatedAt,
  };
}

export function parseInspectionAiReport(
  raw: string,
  note: InspectionNote,
  options: ReportOptions = {},
): InspectionAiReport {
  const cleaned = raw.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
  const parsed = JSON.parse(cleaned) as Record<string, unknown>;
  const fallback = buildFallbackInspectionAiReport(note, options);
  const scores = parsed.scores as Record<string, unknown> | undefined;

  return {
    headline: toText(parsed.headline, 90) || fallback.headline,
    summary: toText(parsed.summary, 420) || fallback.summary,
    strengths: normalizeTextList(parsed.strengths, 5, 140).length
      ? normalizeTextList(parsed.strengths, 5, 140)
      : fallback.strengths,
    risks: normalizeTextList(parsed.risks, 5, 140).length
      ? normalizeTextList(parsed.risks, 5, 140)
      : fallback.risks,
    followUps: normalizeTextList(parsed.followUps ?? parsed.follow_ups, 5, 140).length
      ? normalizeTextList(parsed.followUps ?? parsed.follow_ups, 5, 140)
      : fallback.followUps,
    keywords: normalizeTextList(parsed.keywords, 8, 40).length
      ? normalizeTextList(parsed.keywords, 8, 40)
      : fallback.keywords,
    verdict: toText(parsed.verdict, 220) || fallback.verdict,
    recommendedAction:
      toText(parsed.recommendedAction ?? parsed.recommended_action, 220) || fallback.recommendedAction,
    mapFocusRegion: toText(parsed.mapFocusRegion ?? parsed.map_focus_region, 100) || fallback.mapFocusRegion,
    mapFocusReason: toText(parsed.mapFocusReason ?? parsed.map_focus_reason, 220) || fallback.mapFocusReason,
    scores: {
      residence: clampScore(scores?.residence ?? scores?.residenceScore, fallback.scores.residence),
      investment: clampScore(scores?.investment ?? scores?.investmentScore, fallback.scores.investment),
      infra: clampScore(scores?.infra ?? scores?.infraScore, fallback.scores.infra),
    },
    source: options.source ?? "live",
    generatedAt: new Date().toISOString(),
  };
}

export function mergeInspectionReportIntoAnalysis(
  baseAnalysis: Record<string, unknown>,
  report: InspectionAiReport,
): Record<string, unknown> {
  const recommendations = [...new Set([report.recommendedAction, ...report.followUps].filter(Boolean))].slice(0, 6);
  const baseEngine = typeof baseAnalysis.engine === "string" ? baseAnalysis.engine : "rule-based-v1";
  const reportEngine =
    report.source === "fallback" ? "inspection-report-fallback-v1" : `${report.source}-inspection-report-v1`;

  return {
    ...baseAnalysis,
    engine: `${baseEngine} + ${reportEngine}`,
    source: report.source === "fallback" ? (baseAnalysis.source ?? "internal") : report.source,
    inspectionReport: report,
    narrativeSummary: report.summary,
    headline: report.headline,
    strengths: report.strengths,
    weaknesses: report.risks,
    recommendations,
    riskFlags: report.risks,
    keywords: report.keywords,
    detailedConclusion: report.verdict,
    llmDetailedConclusion:
      report.source === "fallback" ? baseAnalysis.llmDetailedConclusion : report.summary,
    actionPlan: {
      immediate: report.followUps.slice(0, 3),
      shortTerm: [report.recommendedAction, report.mapFocusReason].filter(Boolean).slice(0, 3),
    },
    mapFocusRegion: report.mapFocusRegion,
    mapFocusReason: report.mapFocusReason,
    reportScores: report.scores,
    generatedAt: report.generatedAt,
  };
}

export function inspectionAiReportJsonInstruction(): string {
  return [
    "JSON만 반환하세요. 마크다운 코드블록을 쓰지 마세요.",
    "필수 키: headline, summary, strengths, risks, followUps, keywords, verdict, recommendedAction, mapFocusRegion, mapFocusReason, scores.",
    "strengths, risks, followUps, keywords는 문자열 배열입니다.",
    "scores는 residence, investment, infra 숫자 점수(0~100)를 포함합니다.",
    "입력에 없는 가격, 수익률, 규제, 호재, 입지 정보를 지어내지 마세요.",
    "모든 문장은 한국어로, 사용자가 바로 실행할 수 있게 짧고 구체적으로 작성하세요.",
  ].join("\n");
}
