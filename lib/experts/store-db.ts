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

export async function listExperts(): Promise<UserExpertProfile[]> {
  const sb = getServiceSupabase();
  if (!sb) return memory;
  const { data, error } = await sb
    .from("expert_profiles")
    .select("*")
    .order("rating", { ascending: false })
    .limit(200);
  if (error) return [];
  return (data ?? []).map(mapRow);
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
    responseTime: "대기",
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
