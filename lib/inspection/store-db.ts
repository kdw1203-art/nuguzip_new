import { getServiceSupabase } from "@/lib/supabase/service";
import { getReadOnlySupabase } from "@/lib/newui/supabase-read";
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
  /** 작성 폼의 종합 만족도 슬라이더(0~10) — 점수 축으로 파생시키지 않고 원본 그대로 보존 */
  satisfaction?: number;
  /** 작성 시 적용한 노트 템플릿 id (출처 표시용) */
  templateId?: string;
  /** 단지 허브 id — 회차 비교·지도 핸드오프의 정규 키(aptName 보다 우선) */
  complexId?: string;
  lat?: number;
  lng?: number;
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

/**
 * 입력된 축(>0)만 평균한다. 미입력 0을 분모에 넣으면 미완성 노트가
 * 낮은 "종합 점수"로 보여 판단 점수처럼 오해된다.
 * 축이 하나도 없으면 0 — 호출측에서 `> 0` / null 표시로 구분한다.
 */
export function inspectionAverageScore(scores: InspectionScores): number {
  const axes = [
    scores.location,
    scores.school,
    scores.transport,
    scores.facility,
    scores.future,
  ].filter((v) => Number.isFinite(v) && v > 0);
  if (!axes.length) return 0;
  return axes.reduce((sum, v) => sum + v, 0) / axes.length;
}

/** 점수 축이 하나라도 입력됐는지 */
export function hasInspectionScores(scores: InspectionScores): boolean {
  return (
    scores.location > 0 ||
    scores.school > 0 ||
    scores.transport > 0 ||
    scores.facility > 0 ||
    scores.future > 0
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
  const { data, error } = await q;
  /* 실패를 []로 돌려주면 "내가 쓴 노트가 하나도 없다"가 된다. 내 기록이 사라진
     것처럼 보이는 화면은 사용자를 가장 크게 놀라게 하는 거짓말이다.
     이 값을 못 없어도 되는 곳(홈 개인화·인사이트·크리에이터 게이트)은 이미
     자기 쪽에서 catch 한다. */
  if (error) throw noteQueryError("inspection_notes (내 노트 목록)", error);
  return (data ?? []).map(mapRow);
}

/** 조회 실패 전용 에러 — "행이 없음"과 절대 섞지 않는다. */
function noteQueryError(where: string, err: { message?: string; code?: string }): Error {
  return new Error(`${where} 조회 실패: ${err.message ?? "알 수 없는 오류"}`);
}

/**
 * 공개 임장노트 목록 (최신순).
 *
 * ── 2026-07-26: 두 가지를 고쳤다 ────────────────────────────────────────────
 * 1) 조회 실패를 빈 배열로 바꾸지 않는다.
 *    `const { data } = await …` 는 error 를 통째로 버리고, 실패하면 `data` 가
 *    null 이라 `[]` 가 나간다. 그러면 "공개 노트가 아직 없다" 와 "DB 를 못
 *    읽었다" 가 화면에서 같은 모양이 된다 — 이 레포가 이미 /tx 에서 하루 동안
 *    당한 사고다(lib/market/tx-bands.ts 헤더). 특히 이 함수는
 *    /sitemap-notes.xml 과 /feed.xml 도 먹여서, 실패 한 번이 "이 노트들은
 *    없어졌다" 는 신호로 크롤러에 나간다. 이제 실패는 던지고, 부르는 쪽이
 *    둘을 구분한다.
 * 2) getServiceSupabase() → getReadOnlySupabase()
 *    빌드·프리렌더 환경에는 서비스 롤 키가 없어 sb === null → 빈 메모리 배열이
 *    나갔다. inspection_notes 에는 anon 읽기 정책이 실제로 있으므로
 *    (inspection_notes_public_read: is_public AND slug 존재,
 *     inspection_notes_select_public_published: is_public AND published_at AND
 *     status='analyzed') anon 으로도 공개 노트를 읽는다. 서비스 롤이 있으면
 *    그대로 쓰고, 없을 때만 anon 으로 떨어진다.
 *    ※ anon 은 RLS 를 타므로 slug 도 published_at 도 없는 공개 노트는 보이지
 *      않는다. 서비스 롤보다 적게 보일 수 있다는 뜻이고, 이는 "권한대로 보인
 *      것" 이지 실패가 아니다.
 */
export async function listPublicNotes(limit = 50): Promise<InspectionNote[]> {
  const sb = getReadOnlySupabase();
  if (!sb) {
    throw new Error(
      "inspection_notes 를 읽을 수단이 없습니다 — SUPABASE_SERVICE_ROLE_KEY 도 " +
        "NEXT_PUBLIC_SUPABASE_URL/NEXT_PUBLIC_SUPABASE_ANON_KEY 도 설정되지 않았습니다.",
    );
  }
  const { data, error } = await sb
    .from("inspection_notes")
    .select("*")
    .eq("is_public", true)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    throw new Error(
      `inspection_notes 조회 실패 (공개 노트) — ${error.message}` +
        `${error.code ? ` [${error.code}]` : ""}${error.hint ? ` · 힌트: ${error.hint}` : ""}`,
    );
  }
  return (data ?? []).map(mapRow);
}

/** 목록 카드 한 장에 실제로 그려지는 것만. 본문·점수·사진은 여기 없다. */
export type PublicNoteCard = {
  id: string;
  title: string;
  region: string;
  aptName: string | null;
  visitDate: string;
  summary: string | null;
  createdAt: string;
};

/**
 * 공개 임장노트 **카드용** 목록 (최신순).
 *
 * listPublicNotes() 와 같은 조건·같은 정렬이지만 `select("*")` 가 아니다.
 * 그 차이가 왜 중요한지: inspection_notes 한 행에는 checklist·sections·
 * photos·ai_analysis·metadata 다섯 개의 jsonb 가 들어 있고, 그게 행 무게의
 * 대부분이다. /region/[id] 는 그렇게 100행을 통째로 받아 놓고 지역이 맞는
 * 4장만 그렸다 — 나머지 96행과 다섯 jsonb 는 전부 버려지는 전송이었다.
 * 지역 페이지는 265개고 Postgres 는 Micro 급이라, 버려지는 쪽이 훨씬 크다.
 *
 * 실패를 삼키지 않는 규칙은 listPublicNotes() 와 동일하다 — 위 주석 참고.
 * 못 읽으면 던지고, 부르는 쪽이 "아직 없다" 와 "못 읽었다" 를 구분한다.
 */
export async function listPublicNoteCards(
  limit = 50,
  /** 곁다리 예산 신호 (항목 25) — 예산이 접히면 PostgREST 요청도 끊는다. */
  signal?: AbortSignal,
): Promise<PublicNoteCard[]> {
  const sb = getReadOnlySupabase();
  if (!sb) {
    throw new Error(
      "inspection_notes 를 읽을 수단이 없습니다 — SUPABASE_SERVICE_ROLE_KEY 도 " +
        "NEXT_PUBLIC_SUPABASE_URL/NEXT_PUBLIC_SUPABASE_ANON_KEY 도 설정되지 않았습니다.",
    );
  }
  let q = sb
    .from("inspection_notes")
    .select("id,title,region,apt_name,visit_date,summary,created_at")
    .eq("is_public", true)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (signal) q = q.abortSignal(signal);
  const { data, error } = await q;
  if (error) {
    throw new Error(
      `inspection_notes 조회 실패 (공개 노트 카드) — ${error.message}` +
        `${error.code ? ` [${error.code}]` : ""}${error.hint ? ` · 힌트: ${error.hint}` : ""}`,
    );
  }
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: String(r.id),
    title: String(r.title ?? ""),
    region: String(r.region ?? ""),
    aptName: (r.apt_name as string | null) ?? null,
    visitDate: String(r.visit_date ?? "").slice(0, 10),
    summary: (r.summary as string | null) ?? null,
    createdAt: String(r.created_at ?? ""),
  }));
}

/**
 * 같은 작성자의 같은 단지(aptName) 노트 묶음 — 회차(방문 기록) 비교용.
 * 방문일 오름차순(같으면 생성일 오름차순)으로 반환한다.
 */
export async function listNotesByAuthorForApt(
  authorEmail: string,
  aptName: string,
  limit = 20,
): Promise<InspectionNote[]> {
  const sb = getServiceSupabase();
  if (!sb) {
    return memory
      .filter((n) => n.authorEmail === authorEmail && (n.aptName ?? "") === aptName)
      .sort(
        (a, b) =>
          a.visitDate.localeCompare(b.visitDate) || a.createdAt.localeCompare(b.createdAt),
      )
      .slice(0, limit);
  }
  const { data, error } = await sb
    .from("inspection_notes")
    .select("*")
    .eq("author_email", authorEmail)
    .eq("apt_name", aptName)
    .order("visit_date", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(limit);
  /* 회차 비교 섹션은 실패하면 "이 단지는 1회차뿐"으로 보인다 — 2·3회차를 쓴
     사람에게는 기록이 날아간 것처럼 보인다. */
  if (error) throw noteQueryError("inspection_notes (같은 단지 회차)", error);
  return (data ?? []).map(mapRow);
}

/**
 * 같은 작성자·같은 complexId(metadata) 노트 묶음.
 * aptName 오타·표기 차이로 회차가 갈라지는 문제를 줄인다.
 */
export async function listNotesByAuthorForComplex(
  authorEmail: string,
  complexId: string,
  limit = 20,
): Promise<InspectionNote[]> {
  const id = complexId.trim();
  if (!id) return [];
  const sb = getServiceSupabase();
  if (!sb) {
    return memory
      .filter(
        (n) =>
          n.authorEmail === authorEmail &&
          (n.metadata?.complexId ?? "").trim() === id,
      )
      .sort(
        (a, b) =>
          a.visitDate.localeCompare(b.visitDate) || a.createdAt.localeCompare(b.createdAt),
      )
      .slice(0, limit);
  }
  const { data, error } = await sb
    .from("inspection_notes")
    .select("*")
    .eq("author_email", authorEmail)
    .filter("metadata->>complexId", "eq", id)
    .order("visit_date", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw noteQueryError("inspection_notes (같은 complexId 회차)", error);
  return (data ?? []).map(mapRow);
}

/**
 * 웹17 — 관심 단지 대시보드용: 여러 단지의 최근 N일 **공개** 노트 수를 한
 * 번의 조회로 센다(단지당 쿼리를 날리면 관심 30곳 = 30요청). PostgREST 는
 * GROUP BY 가 없어 행을 받아 JS 에서 접는다 — 30일×전체 공개 노트 규모라
 * 행 수가 작다(상한 2000 명시). 실패는 던진다 — 호출자가 "조회 실패"를
 * "0건"과 구분해 말할 수 있어야 한다.
 */
export async function countRecentPublicNotesByComplex(
  complexIds: string[],
  days = 30,
): Promise<Map<string, number>> {
  const ids = [...new Set(complexIds.map((v) => v.trim()).filter(Boolean))];
  const out = new Map<string, number>();
  if (ids.length === 0) return out;
  const sb = getReadOnlySupabase();
  if (!sb) return out;
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data, error } = await sb
    .from("inspection_notes")
    .select("metadata->>complexId")
    .eq("is_public", true)
    .gte("created_at", since)
    .in("metadata->>complexId", ids)
    .limit(2000);
  if (error) throw noteQueryError("inspection_notes (단지별 최근 공개 노트 수)", error);
  for (const r of (data ?? []) as Record<string, unknown>[]) {
    const cid = String(r.complexId ?? "").trim();
    if (!cid) continue;
    out.set(cid, (out.get(cid) ?? 0) + 1);
  }
  return out;
}

export async function getNote(id: string): Promise<InspectionNote | null> {
  const sb = getServiceSupabase();
  if (!sb) return memory.find((n) => n.id === id) ?? null;
  const { data, error } = await sb
    .from("inspection_notes")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  /* maybeSingle 은 행이 없으면 {data:null,error:null} 이다. 즉 error 가 곧
     "실패", !data 가 곧 "없음" — 이 둘이 정확히 갈린다. null 을 그대로
     돌려주면 /notes/[id] 가 notFound() 를 부르는데, 남의 노트를 공유받아
     들어온 사람에게 "삭제된 노트"라고 단정하는 셈이다. */
  if (error) throw noteQueryError(`inspection_notes (노트 ${id})`, error);
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
  const { data, error } = await sb
    .from("inspection_notes")
    .update(body)
    .eq("id", id)
    .select()
    .maybeSingle();
  /* 쓰기가 실패했는데 null 을 돌려주면 부르는 쪽은 "그런 노트가 없다"로 읽는다.
     저장이 안 된 것을 "없는 노트"라고 답하면 사용자는 방금 쓴 내용을 잃는다. */
  if (error) throw noteQueryError(`inspection_notes (노트 ${id} 수정)`, error);
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

/* inspection_notes.checklist 는 jsonb 라 스키마가 강제되지 않는다. 실제로 지금
   테이블에는 세 가지 모양이 섞여 있다 —
     {label, checked}        NoteForm 이전 세대
     {no, item, detail, status}   AI Lab 시드
     {no, item, why, how, when}   AI Lab 시드
   여기서 그냥 InspectionChecklistItem[] 로 캐스팅하면 `label` 이 undefined 라
   화면에는 빈 줄이 그려진다. 항목이 있는데 없는 것처럼 보이는 것도 사실 왜곡이다.
   그래서 읽는 지점에서 한 번만 정규화한다.

   완료 여부는 **불리언이 명시된 경우에만** true 로 본다. status 가
   "현장 확인 필요" 같은 한국어 문장일 때 이를 해석해 완료로 추정하지 않는다 —
   확인하지 않은 것을 확인했다고 적는 쪽이 훨씬 위험하다. */
function normalizeChecklist(raw: unknown): InspectionChecklistItem[] {
  if (!Array.isArray(raw)) return [];
  const out: InspectionChecklistItem[] = [];
  for (const entry of raw) {
    if (typeof entry === "string") {
      const label = entry.trim();
      if (label) out.push({ label, done: false });
      continue;
    }
    if (!entry || typeof entry !== "object") continue;
    const o = entry as Record<string, unknown>;
    const label = ["label", "item", "text", "title", "name", "detail"]
      .map((k) => (typeof o[k] === "string" ? (o[k] as string).trim() : ""))
      .find((v) => v.length > 0);
    if (!label) continue;
    out.push({ label, done: o.done === true || o.checked === true });
  }
  return out;
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
    checklist: normalizeChecklist(r.checklist),
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
