import { getServiceSupabase } from "@/lib/supabase/service";

export type UserExpertProfile = {
  id: string;
  userId: string | null;
  /** 등록 세션 이메일(정규화). 소유권 판별에 사용 */
  ownerEmail: string | null;
  name: string;
  title: string;
  category: string;
  regions: string[];
  specialties: string[];
  introduction: string;
  consultationFee: number;
  reportFee: number;
  rating: number;
  reviews: number;
  consultations: number;
  experience: string;
  responseRate: number;
  responseTime: string;
  isVerified: boolean;
  isPremium: boolean;
  badge?: string | null;
  gradient?: string | null;
  /** 운영 검증: 공인중개사 개설 등록번호 등(공개 정책에 따라 표기) */
  brokerRegistrationNo?: string | null;
  verificationCheckedAt?: string | null;
  verificationNote?: string | null;
  createdAt: string;
  updatedAt: string;
};

const memory: UserExpertProfile[] = [];

/**
 * 전문가별 "실제로 답변이 나간" 상담 건수.
 *
 * J8 — expert_profiles.consultations 컬럼은 default 0 이고 이 값을 올려 주는 코드가
 * 저장소·라우트·DB 트리거 어디에도 없다(확인함). 그래서 목록의 "상담 N건"은 항상 0 이고,
 * 그 컬럼으로 정렬하는 "상담수순"은 영원히 0 끼리 비교하는 정렬이었다.
 * 컬럼을 믿는 대신 실제 원장인 expert_consultations 에서 센다 — replied_at 이 있는 행,
 * 즉 전문가가 실제로 답을 보낸 건만 "상담"으로 인정한다(요청만 하고 만 건은 제외).
 *
 * PostgREST 는 GROUP BY 를 못 하므로 expert_id 만 받아 와서 JS 에서 센다.
 */
async function countRepliedConsultations(): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  const sb = getServiceSupabase();
  if (!sb) return counts;
  const { data, error } = await sb
    .from("expert_consultations")
    .select("expert_id")
    .not("expert_id", "is", null)
    .not("replied_at", "is", null)
    .limit(20000);
  if (error) return counts;
  for (const row of data ?? []) {
    const key = String((row as { expert_id: unknown }).expert_id);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

export async function listExperts(): Promise<UserExpertProfile[]> {
  const sb = getServiceSupabase();
  if (!sb) return memory;
  // 정렬 기준을 rating 에서 created_at 으로 바꿨다 — rating 은 아무도 쓰지 않는
  // 상수 0 컬럼이라 "평점 높은 순"이 아니라 사실상 무작위 순서였다.
  const { data, error } = await sb
    .from("expert_profiles")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return [];
  const rows = (data ?? []).map(mapRow);
  const counts = await countRepliedConsultations();
  return rows.map((e) => ({ ...e, consultations: counts.get(e.id) ?? 0 }));
}

/** listExpertsAll 페치 상한 — 전량이 이 안이어야 클라이언트 필터가 서버 필터와 동치.
 *  실측(2026-08-10): expert_profiles 0행. */
export const EXPERTS_FETCH_CAP = 200;

export type ExpertsAllResult = {
  /** false = 조회 실패 — "전문가 없음"(빈 결과)과 구별해 그려야 한다.
   *  기존 listExperts 는 error 를 [] 로 삼켜서 이 구별이 로더에서 죽어 있었다. */
  ok: boolean;
  items: UserExpertProfile[];
  truncated: boolean;
};

/**
 * 전량 로더 (ISR /town/experts 용). !sb(서비스키 미설정)는 실패가 아니라 미설정이라
 * 기존 listExperts 와 같이 memory(빈 배열)를 ok 로 돌려준다.
 * 주의: 호출부가 클라이언트에 넘길 때는 반드시 슬림 DTO 로 — ownerEmail·userId 가
 * 프로필에 실려 있어 그대로 넘기면 공개 ISR 캐시에 개인정보가 들어간다.
 */
export async function listExpertsAll(): Promise<ExpertsAllResult> {
  const sb = getServiceSupabase();
  if (!sb) return { ok: true, items: memory, truncated: false };
  try {
    const { data, error } = await sb
      .from("expert_profiles")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(EXPERTS_FETCH_CAP);
    if (error) return { ok: false, items: [], truncated: false };
    const rows = (data ?? []).map(mapRow);
    const counts = await countRepliedConsultations();
    const items = rows.map((e) => ({ ...e, consultations: counts.get(e.id) ?? 0 }));
    return { ok: true, items, truncated: items.length >= EXPERTS_FETCH_CAP };
  } catch {
    return { ok: false, items: [], truncated: false };
  }
}

export async function getExpert(id: string): Promise<UserExpertProfile | null> {
  const sb = getServiceSupabase();
  if (!sb) return memory.find((x) => x.id === id) ?? null;
  const { data } = await sb
    .from("expert_profiles")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return data ? mapRow(data) : null;
}

function normOwner(email: string | undefined | null): string | null {
  if (!email) return null;
  const s = email.trim().toLowerCase();
  return s.length ? s : null;
}

export async function getExpertByOwnerEmail(
  email: string,
): Promise<UserExpertProfile | null> {
  const owner = normOwner(email);
  if (!owner) return null;
  const sb = getServiceSupabase();
  if (!sb) {
    return memory.find((x) => normOwner(x.ownerEmail) === owner) ?? null;
  }
  const { data } = await sb
    .from("expert_profiles")
    .select("*")
    .eq("owner_email", owner)
    .maybeSingle();
  return data ? mapRow(data) : null;
}

export async function createExpert(input: {
  name: string;
  title: string;
  category: string;
  regions?: string[];
  specialties?: string[];
  introduction?: string;
  consultationFee?: number;
  reportFee?: number;
  experience?: string;
  userId?: string | null;
  ownerEmail?: string | null;
}): Promise<UserExpertProfile> {
  const sb = getServiceSupabase();
  const now = new Date().toISOString();
  const rec: UserExpertProfile = {
    id: `mem-${Date.now().toString(36)}`,
    userId: input.userId ?? null,
    ownerEmail: normOwner(input.ownerEmail),
    name: input.name,
    title: input.title,
    category: input.category,
    regions: input.regions ?? [],
    specialties: input.specialties ?? [],
    introduction: input.introduction ?? "",
    consultationFee: input.consultationFee ?? 0,
    reportFee: input.reportFee ?? 0,
    rating: 0,
    reviews: 0,
    consultations: 0,
    experience: input.experience ?? "",
    responseRate: 0,
    responseTime: "",
    isVerified: false,
    isPremium: false,
    badge: null,
    gradient: null,
    createdAt: now,
    updatedAt: now,
  };
  if (!sb) {
    memory.unshift(rec);
    return rec;
  }
  const { data, error } = await sb
    .from("expert_profiles")
    .insert({
      user_id: input.userId ?? null,
      owner_email: normOwner(input.ownerEmail),
      name: input.name,
      title: input.title,
      category: input.category,
      regions: input.regions ?? [],
      specialties: input.specialties ?? [],
      introduction: input.introduction ?? null,
      consultation_fee: input.consultationFee ?? 0,
      report_fee: input.reportFee ?? 0,
      experience: input.experience ?? null,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return mapRow(data);
}

export async function updateExpert(
  id: string,
  patch: Partial<{
    name: string;
    title: string;
    category: string;
    regions: string[];
    specialties: string[];
    introduction: string;
    consultationFee: number;
    reportFee: number;
    experience: string;
  }>,
): Promise<UserExpertProfile | null> {
  const sb = getServiceSupabase();
  if (!sb) {
    const r = memory.find((x) => x.id === id);
    if (!r) return null;
    Object.assign(r, patch, { updatedAt: new Date().toISOString() });
    return r;
  }
  const body: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) body.name = patch.name;
  if (patch.title !== undefined) body.title = patch.title;
  if (patch.category !== undefined) body.category = patch.category;
  if (patch.regions !== undefined) body.regions = patch.regions;
  if (patch.specialties !== undefined) body.specialties = patch.specialties;
  if (patch.introduction !== undefined) body.introduction = patch.introduction;
  if (patch.consultationFee !== undefined) body.consultation_fee = patch.consultationFee;
  if (patch.reportFee !== undefined) body.report_fee = patch.reportFee;
  if (patch.experience !== undefined) body.experience = patch.experience;
  const { data, error } = await sb
    .from("expert_profiles")
    .update(body)
    .eq("id", id)
    .select()
    .maybeSingle();
  if (error || !data) return null;
  return mapRow(data);
}

export async function markExpertVerified(
  id: string,
  patch: {
    brokerRegistrationNo?: string | null;
    verificationNote?: string | null;
    nextRevalidationAt?: string | null;
  },
): Promise<UserExpertProfile | null> {
  const sb = getServiceSupabase();
  const now = new Date().toISOString();
  if (!sb) {
    const r = memory.find((x) => x.id === id);
    if (!r) return null;
    r.isVerified = true;
    r.brokerRegistrationNo = patch.brokerRegistrationNo ?? r.brokerRegistrationNo;
    r.verificationCheckedAt = now;
    r.verificationNote = patch.verificationNote ?? r.verificationNote;
    r.updatedAt = now;
    return r;
  }
  const { data, error } = await sb
    .from("expert_profiles")
    .update({
      is_verified: true,
      broker_registration_no: patch.brokerRegistrationNo ?? null,
      verification_checked_at: now,
      verification_note: patch.verificationNote ?? null,
      updated_at: now,
    })
    .eq("id", id)
    .select()
    .maybeSingle();
  if (error || !data) return null;
  return mapRow(data);
}

export async function deleteExpert(id: string): Promise<void> {
  const sb = getServiceSupabase();
  if (!sb) {
    const i = memory.findIndex((x) => x.id === id);
    if (i >= 0) memory.splice(i, 1);
    return;
  }
  await sb.from("expert_profiles").delete().eq("id", id);
}

function mapRow(r: Record<string, unknown>): UserExpertProfile {
  return {
    id: r.id as string,
    userId: (r.user_id as string | null) ?? null,
    ownerEmail: normOwner(r.owner_email as string | null),
    name: r.name as string,
    title: r.title as string,
    category: r.category as string,
    regions: (r.regions as string[]) ?? [],
    specialties: (r.specialties as string[]) ?? [],
    introduction: (r.introduction as string | null) ?? "",
    consultationFee: Number(r.consultation_fee ?? 0),
    reportFee: Number(r.report_fee ?? 0),
    rating: Number(r.rating ?? 0),
    reviews: Number(r.reviews ?? 0),
    consultations: Number(r.consultations ?? 0),
    experience: (r.experience as string | null) ?? "",
    responseRate: Number(r.response_rate ?? 0),
    responseTime: (r.response_time as string | null) ?? "",
    isVerified: Boolean(r.is_verified),
    isPremium: Boolean(r.is_premium),
    badge: (r.badge as string | null) ?? null,
    gradient: (r.gradient as string | null) ?? null,
    brokerRegistrationNo: (r.broker_registration_no as string | null) ?? null,
    verificationCheckedAt: (r.verification_checked_at as string | null) ?? null,
    verificationNote: (r.verification_note as string | null) ?? null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}
