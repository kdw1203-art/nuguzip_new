import { getServiceSupabase } from "@/lib/supabase/service";
import { WORKBENCH_COMPLEXES, compositeScore } from "@/lib/ai/workbench-constants";

export type InspectionScores = {
  location: number;
  school: number;
  transport: number;
  facility: number;
  future: number;
};

export type InspectionSections = {
  pros?: string;
  cons?: string;
  location?: string;
  school?: string;
  transport?: string;
  facility?: string;
  future?: string;
  memo?: string;
};

export type InspectionChecklistItem = { label: string; done: boolean };

export type PublicDataRef = {
  planId: string;
  title: string;
  mode: string;
  fetchedAt: string;
  summary?: string;
};

export type InspectionNoteMetadata = {
  publicDataRefs?: PublicDataRef[];
  evidenceRefs?: Array<Record<string, unknown>>;
  structuredNote?: Record<string, unknown>;
  inspectionReport?: Record<string, unknown>;
  inspectionReportGeneratedAt?: string;
  intent?: "실거주" | "투자" | "전월세";
};

export type InspectionNote = {
  id: string;
  authorEmail: string;
  authorLabel?: string | null;
  title: string;
  region: string;
  aptName?: string | null;
  visitDate: string;
  weather?: string | null;
  transportation?: string | null;
  summary?: string | null;
  scores: InspectionScores;
  checklist: InspectionChecklistItem[];
  sections: InspectionSections;
  photos: string[];
  aiAnalysis: Record<string, unknown> | null;
  metadata?: InspectionNoteMetadata;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
};

export function inspectionAverageScore(scores: InspectionScores): number {
  return (
    (scores.location + scores.school + scores.transport + scores.facility + scores.future) / 5
  );
}

type InvestorRole = "live" | "invest" | "flip" | "rent" | "balanced";

type RoleWeightPreset = {
  label: string;
  location: number;
  school: number;
  transport: number;
  facility: number;
  future: number;
};

const ROLE_WEIGHT_PRESETS: Record<InvestorRole, RoleWeightPreset> = {
  live: {
    label: "실거주",
    location: 0.28,
    school: 0.24,
    transport: 0.2,
    facility: 0.2,
    future: 0.08,
  },
  invest: {
    label: "투자",
    location: 0.2,
    school: 0.12,
    transport: 0.22,
    facility: 0.14,
    future: 0.32,
  },
  flip: {
    label: "단기매매",
    location: 0.18,
    school: 0.1,
    transport: 0.24,
    facility: 0.12,
    future: 0.36,
  },
  rent: {
    label: "임대수익",
    location: 0.22,
    school: 0.1,
    transport: 0.26,
    facility: 0.2,
    future: 0.22,
  },
  balanced: {
    label: "균형형",
    location: 0.24,
    school: 0.16,
    transport: 0.22,
    facility: 0.18,
    future: 0.2,
  },
};

type RegionRiskProfile = {
  id: string;
  label: string;
  keywords: string[];
  supplyPressure: number;
  transactionLiquidity: number;
  jeonseVolatility: number;
};

const REGION_RISK_PROFILES: RegionRiskProfile[] = [
  {
    id: "core_seoul",
    label: "서울 핵심권",
    keywords: ["강남", "서초", "송파", "용산", "마포", "seoul", "gangnam", "seocho", "songpa"],
    supplyPressure: 1,
    transactionLiquidity: 4,
    jeonseVolatility: 2,
  },
  {
    id: "metro_balance",
    label: "서울/수도권 일반권",
    keywords: ["성동", "양천", "동작", "영등포", "은평", "강서", "광진", "강동", "구로", "경기", "인천"],
    supplyPressure: 2,
    transactionLiquidity: 3,
    jeonseVolatility: 3,
  },
  {
    id: "outer_supply",
    label: "외곽·공급민감권",
    keywords: ["노원", "관악", "외곽", "신도시", "지방", "부산", "대구", "광주", "울산", "세종"],
    supplyPressure: 4,
    transactionLiquidity: 2,
    jeonseVolatility: 4,
  },
];

function detectRegionRiskProfile(regionText: string): RegionRiskProfile {
  const normalized = regionText.trim().toLowerCase();
  if (!normalized) return REGION_RISK_PROFILES[1];
  const hit = REGION_RISK_PROFILES.find((profile) =>
    profile.keywords.some((kw) => normalized.includes(kw.toLowerCase())),
  );
  return hit ?? REGION_RISK_PROFILES[1];
}

const memory: InspectionNote[] = [];

export async function listNotes(authorEmail: string | null): Promise<InspectionNote[]> {
  const sb = getServiceSupabase();
  if (!sb) return memory.filter((n) => !authorEmail || n.authorEmail === authorEmail);
  let q = sb
    .from("inspection_notes")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  if (authorEmail) q = q.eq("author_email", authorEmail);
  const { data } = await q;
  return (data ?? []).map(mapRow);
}

export async function listPublicNotes(limit = 50): Promise<InspectionNote[]> {
  const sb = getServiceSupabase();
  if (!sb) return memory.filter((n) => n.isPublic).slice(0, limit);
  const { data } = await sb
    .from("inspection_notes")
    .select("*")
    .eq("is_public", true)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map(mapRow);
}

export async function getNote(id: string): Promise<InspectionNote | null> {
  const sb = getServiceSupabase();
  if (!sb) return memory.find((n) => n.id === id) ?? null;
  const { data } = await sb
    .from("inspection_notes")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return data ? mapRow(data) : null;
}

export async function createNote(input: {
  authorEmail: string;
  authorLabel?: string;
  title: string;
  region: string;
  aptName?: string;
  visitDate?: string;
  weather?: string;
  transportation?: string;
  summary?: string;
  scores?: Partial<InspectionScores>;
  checklist?: InspectionChecklistItem[];
  sections?: InspectionSections;
  photos?: string[];
  aiAnalysis?: Record<string, unknown>;
  metadata?: InspectionNoteMetadata;
  isPublic?: boolean;
}): Promise<InspectionNote> {
  const sb = getServiceSupabase();
  const now = new Date().toISOString();
  const scores: InspectionScores = {
    location: input.scores?.location ?? 0,
    school: input.scores?.school ?? 0,
    transport: input.scores?.transport ?? 0,
    facility: input.scores?.facility ?? 0,
    future: input.scores?.future ?? 0,
  };
  const rec: InspectionNote = {
    id: `mem-${Date.now().toString(36)}`,
    authorEmail: input.authorEmail,
    authorLabel: input.authorLabel ?? null,
    title: input.title,
    region: input.region,
    aptName: input.aptName ?? null,
    visitDate: input.visitDate ?? new Date().toISOString().slice(0, 10),
    weather: input.weather ?? null,
    transportation: input.transportation ?? null,
    summary: input.summary ?? null,
    scores,
    checklist: input.checklist ?? [],
    sections: input.sections ?? {},
    photos: input.photos ?? [],
    aiAnalysis: input.aiAnalysis ?? null,
    metadata: input.metadata ?? {},
    isPublic: input.isPublic ?? false,
    createdAt: now,
    updatedAt: now,
  };
  if (!sb) {
    memory.unshift(rec);
    return rec;
  }
  const { data, error } = await sb
    .from("inspection_notes")
    .insert({
      author_email: input.authorEmail,
      author_label: input.authorLabel ?? null,
      title: input.title,
      region: input.region,
      apt_name: input.aptName ?? null,
      visit_date: input.visitDate ?? new Date().toISOString().slice(0, 10),
      weather: input.weather ?? null,
      transportation: input.transportation ?? null,
      summary: input.summary ?? null,
      score_location: scores.location,
      score_school: scores.school,
      score_transport: scores.transport,
      score_facility: scores.facility,
      score_future: scores.future,
      checklist: input.checklist ?? [],
      sections: input.sections ?? {},
      photos: input.photos ?? [],
      ai_analysis: input.aiAnalysis ?? null,
      metadata: input.metadata ?? {},
      is_public: input.isPublic ?? false,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return mapRow(data);
}

export async function updateNote(
  id: string,
  patch: Partial<Omit<InspectionNote, "id" | "createdAt" | "updatedAt" | "authorEmail">>,
): Promise<InspectionNote | null> {
  const sb = getServiceSupabase();
  if (!sb) {
    const r = memory.find((x) => x.id === id);
    if (!r) return null;
    Object.assign(r, patch, { updatedAt: new Date().toISOString() });
    return r;
  }
  const body: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.title !== undefined) body.title = patch.title;
  if (patch.region !== undefined) body.region = patch.region;
  if (patch.aptName !== undefined) body.apt_name = patch.aptName;
  if (patch.visitDate !== undefined) body.visit_date = patch.visitDate;
  if (patch.weather !== undefined) body.weather = patch.weather;
  if (patch.transportation !== undefined) body.transportation = patch.transportation;
  if (patch.summary !== undefined) body.summary = patch.summary;
  if (patch.scores !== undefined) {
    body.score_location = patch.scores.location;
    body.score_school = patch.scores.school;
    body.score_transport = patch.scores.transport;
    body.score_facility = patch.scores.facility;
    body.score_future = patch.scores.future;
  }
  if (patch.checklist !== undefined) body.checklist = patch.checklist;
  if (patch.sections !== undefined) body.sections = patch.sections;
  if (patch.photos !== undefined) body.photos = patch.photos;
  if (patch.aiAnalysis !== undefined) body.ai_analysis = patch.aiAnalysis;
  if (patch.metadata !== undefined) body.metadata = patch.metadata;
  if (patch.isPublic !== undefined) body.is_public = patch.isPublic;
  const { data } = await sb
    .from("inspection_notes")
    .update(body)
    .eq("id", id)
    .select()
    .maybeSingle();
  return data ? mapRow(data) : null;
}

export async function deleteNote(id: string): Promise<void> {
  const sb = getServiceSupabase();
  if (!sb) {
    const i = memory.findIndex((x) => x.id === id);
    if (i >= 0) memory.splice(i, 1);
    return;
  }
  await sb.from("inspection_notes").delete().eq("id", id);
}

function mapRow(r: Record<string, unknown>): InspectionNote {
  return {
    id: r.id as string,
    authorEmail: r.author_email as string,
    authorLabel: (r.author_label as string | null) ?? null,
    title: r.title as string,
    region: r.region as string,
    aptName: (r.apt_name as string | null) ?? null,
    visitDate: String(r.visit_date ?? "").slice(0, 10),
    weather: (r.weather as string | null) ?? null,
    transportation: (r.transportation as string | null) ?? null,
    summary: (r.summary as string | null) ?? null,
    scores: {
      location: Number(r.score_location ?? 0),
      school: Number(r.score_school ?? 0),
      transport: Number(r.score_transport ?? 0),
      facility: Number(r.score_facility ?? 0),
      future: Number(r.score_future ?? 0),
    },
    checklist: (r.checklist as InspectionChecklistItem[]) ?? [],
    sections: (r.sections as InspectionSections) ?? {},
    photos: (r.photos as string[]) ?? [],
    aiAnalysis: (r.ai_analysis as Record<string, unknown> | null) ?? null,
    metadata: (r.metadata as InspectionNoteMetadata | undefined) ?? {},
    isPublic: Boolean(r.is_public),
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

/**
 * 간단한 규칙 기반 AI 분석 생성기 (OPENAI 미연결 환경용).
 * 실제 OPENAI_API_KEY 가 설정되면 /api/inspection/ai 에서 대체 호출할 수 있도록 분리 설계.
 */
export function computeAiSummary(input: {
  scores: InspectionScores;
  sections: InspectionSections;
  region: string;
  investorRole?: InvestorRole;
  holdingYears?: number;
  riskTolerance?: number;
}): Record<string, unknown> {
  const avg = inspectionAverageScore(input.scores);
  const investorRole = input.investorRole ?? "balanced";
  const rolePreset = ROLE_WEIGHT_PRESETS[investorRole] ?? ROLE_WEIGHT_PRESETS.balanced;
  const riskTolerance = Math.max(1, Math.min(5, Number(input.riskTolerance ?? 3)));
  const holdingYears = Math.max(1, Math.min(20, Number(input.holdingYears ?? 5)));
  const regionProfile = detectRegionRiskProfile(input.region);
  const grade = avg >= 4.3 ? "A+" : avg >= 3.7 ? "A" : avg >= 3.0 ? "B" : avg >= 2.0 ? "C" : "D";
  const strongs: string[] = [];
  const weaks: string[] = [];
  const entries: Array<[keyof InspectionScores, string]> = [
    ["location", "입지"],
    ["school", "학군"],
    ["transport", "교통"],
    ["facility", "편의시설"],
    ["future", "미래가치"],
  ];
  for (const [k, label] of entries) {
    const v = input.scores[k];
    if (v >= 4) strongs.push(label);
    else if (v <= 2) weaks.push(label);
  }
  const recs: string[] = [];
  if (input.scores.transport <= 2) recs.push("교통 접근성 보완 계획(버스·지하철) 확인 필요");
  if (input.scores.school <= 2) recs.push("학군이 약함 — 자녀 없는 실수요자/투자자에 한정 고려");
  if (input.scores.future >= 4) recs.push("미래 가치 상위 — 재개발·신규 호재 팔로업 가치 있음");
  if (regionProfile.supplyPressure >= 4) recs.push("공급 압력 구간 — 매수 시점 분할과 가격 협상 여지 확인 권장");
  if (holdingYears <= 3) recs.push("보유 기간이 짧아 매도 타이밍·거래비용 영향이 큽니다.");
  if (!recs.length) recs.push("균형형 물건 — 보유 기간·레버리지를 중심으로 시나리오 재점검");
  const summary = `${input.region} 임장 분석 결과 평균 ${avg.toFixed(1)}점(${grade})입니다. 투자성향(${rolePreset.label}) 가중치를 반영하면 강점: ${strongs.join(", ") || "특이점 없음"} / 보완: ${weaks.join(", ") || "없음"}입니다.`;
  const baseWeighted =
    (input.scores.location * rolePreset.location +
      input.scores.school * rolePreset.school +
      input.scores.transport * rolePreset.transport +
      input.scores.facility * rolePreset.facility +
      input.scores.future * rolePreset.future) *
    20;
  const regionalRiskPenalty =
    regionProfile.supplyPressure * 2.2 +
    regionProfile.jeonseVolatility * 1.8 -
    regionProfile.transactionLiquidity * 1.6;
  const toleranceOffset = (riskTolerance - 3) * 1.8;
  const weightedScore = Math.max(
    0,
    Math.min(100, Math.round(baseWeighted - regionalRiskPenalty + toleranceOffset)),
  );
  const confidence =
    Math.min(
      95,
      55 +
        (strongs.length * 8 - weaks.length * 5) +
        (input.sections.memo?.trim() ? 4 : 0) +
        (input.sections.pros?.trim() ? 4 : 0) +
        regionProfile.transactionLiquidity * 2,
    ) || 55;
  const riskFlags: string[] = [];
  if (input.scores.future <= 2) riskFlags.push("개발·호재 모멘텀 약함");
  if (input.scores.transport <= 2) riskFlags.push("교통 접근성 리스크");
  if (input.scores.school <= 2) riskFlags.push("학군 수요 방어력 낮음");
  if (regionProfile.supplyPressure >= 4) riskFlags.push("지역 공급 물량 리스크(입주/미분양 압력)");
  if (regionProfile.jeonseVolatility >= 4) riskFlags.push("전세 변동성 리스크(역전세 구간 유의)");
  if (!input.sections.pros?.trim() || !input.sections.cons?.trim()) {
    riskFlags.push("장단점 서술 부족(근거 데이터 보강 필요)");
  }
  const opportunityFlags: string[] = [];
  if (input.scores.location >= 4) opportunityFlags.push("생활권·입지 우위");
  if (input.scores.transport >= 4) opportunityFlags.push("대중교통 접근성 우수");
  if (input.scores.future >= 4) opportunityFlags.push("중장기 가치 상승 여지");
  if (input.scores.facility >= 4) opportunityFlags.push("실거주 편의성 강점");
  const actionPlan = {
    immediate: [
      "실거래가(최근 3~6개월)와 현재 호가 괴리 확인",
      "동일 평형 2~3개 단지와 체크리스트 항목 교차 비교",
      "임장 사진 기준으로 소음/채광/동선 근거를 노트에 추가",
      "관심 투자성향에 맞는 가중치(실거주/투자/단기/임대) 재검토",
    ],
    shortTerm: [
      "금리 +1%p, 매매가 -10% 시나리오로 버틸 수 있는지 점검",
      "전세 수요/공실 리스크를 같은 생활권에서 비교",
      "리포트/전문가 의견과 본인 임장 점수의 불일치 항목 재검증",
    ],
  };

  const regionText = input.region.trim();
  const regionTokens = regionText
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
  const scoreBias =
    (input.scores.location + input.scores.transport + input.scores.future) / 3;
  const complexCandidates = WORKBENCH_COMPLEXES.map((c) => {
    const base = compositeScore(c);
    const regionBoost = regionTokens.some((t) => c.districtLabel.includes(t)) ? 8 : 0;
    const roleBoost =
      investorRole === "flip"
        ? c.devScore * 0.06
        : investorRole === "rent"
          ? c.liquidityIdx * 0.05
          : investorRole === "live"
            ? c.schoolScore * 0.05
            : c.transitScore * 0.04;
    const fitScore = Math.min(
      100,
      Math.round(base * 0.65 + scoreBias * 6 + regionBoost + roleBoost - regionalRiskPenalty * 0.4),
    );
    return {
      id: c.id,
      name: c.name,
      districtLabel: c.districtLabel,
      estimatedPriceMan: c.priceSaleMan,
      aiScore: fitScore,
      reason:
        regionBoost > 0
          ? `입력 지역(${regionText})과 유사한 생활권이며 ${rolePreset.label} 성향 기준 지표가 안정적입니다.`
          : `${rolePreset.label} 성향 가중치 기준으로 입지·교통·개발 조합이 유사합니다.`,
    };
  })
    .sort((a, b) => b.aiScore - a.aiScore)
    .slice(0, 3);

  const regionCandidates = Array.from(
    new Map(
      complexCandidates.map((c) => [
        c.districtLabel,
        {
          name: c.districtLabel,
          fitScore: c.aiScore,
          reason: `${c.name} 중심으로 거래 유동성과 생활 인프라 균형이 양호합니다.`,
        },
      ]),
    ).values(),
  ).slice(0, 3);

  const detailedConclusion =
    grade === "A+" || grade === "A"
      ? "전반적으로 우수한 입지/수요 조합입니다. 다만 고점 추격 여부와 금리 민감도를 함께 점검해야 합니다."
      : grade === "B"
        ? "평균 이상이지만 축별 편차가 있습니다. 약점 축을 보완할 수 있는 실거주/임대 전략이 필요합니다."
        : "현재는 보수적 접근이 유리합니다. 매수/진입 전 리스크 요인을 먼저 해소하거나 대체 지역과 비교 검토를 권장합니다.";

  return {
    grade,
    averageScore: Number(avg.toFixed(2)),
    weightedScore,
    investmentPersona: rolePreset.label,
    holdingYears,
    riskTolerance,
    confidence,
    regionalRiskProfile: {
      label: regionProfile.label,
      supplyPressure: regionProfile.supplyPressure,
      transactionLiquidity: regionProfile.transactionLiquidity,
      jeonseVolatility: regionProfile.jeonseVolatility,
      riskPenalty: Math.round(regionalRiskPenalty * 10) / 10,
    },
    riskFlags,
    opportunityFlags,
    scoreBreakdown: {
      location: input.scores.location,
      school: input.scores.school,
      transport: input.scores.transport,
      facility: input.scores.facility,
      future: input.scores.future,
    },
    summary,
    detailedConclusion,
    strengths: strongs,
    weaknesses: weaks,
    recommendations: recs,
    actionPlan,
    recommendedRegions: regionCandidates,
    recommendedComplexes: complexCandidates,
    region: input.region,
    generatedAt: new Date().toISOString(),
    engine: "rule-based-v1",
  };
}
