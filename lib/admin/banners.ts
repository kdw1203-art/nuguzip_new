/**
 * 배너 데이터 스토어
 * Supabase `banners` 테이블을 사용합니다.
 * Supabase 미설정 시 정적 기본 배너를 반환합니다.
 */
import { getServiceSupabase } from "@/lib/supabase/service";

export type BannerPlacement = "home" | "community" | "market" | "inspection" | "global";

export type Banner = {
  id: string;
  title: string;
  subtitle?: string | null;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  imageUrl?: string | null;
  bgFrom: string;
  bgTo: string;
  textColor: string;
  placement: BannerPlacement;
  isActive: boolean;
  priority: number;
  startsAt?: string | null;
  endsAt?: string | null;
  targetPlan?: string | null;
  createdBy?: string | null;
  createdAt: string;
};

const FALLBACK_BANNERS: Banner[] = [
  {
    id: "fallback-1",
    title: "AI 투자 분석 무료 체험",
    subtitle: "AI로 내 투자 스타일을 분석해 보세요",
    ctaLabel: "AI 분석 시작",
    ctaUrl: "/ai-analysis",
    bgFrom: "#3182f6",
    bgTo: "#7c3aed",
    textColor: "white",
    placement: "home",
    isActive: true,
    priority: 100,
    createdAt: new Date().toISOString(),
  },
  {
    id: "fallback-2",
    title: "임장 모임 함께해요",
    subtitle: "이번 주말 강남·마포 임장 모임에 참여하세요",
    ctaLabel: "모임 보기",
    ctaUrl: "/market",
    bgFrom: "#10b981",
    bgTo: "#0d9488",
    textColor: "white",
    placement: "home",
    isActive: true,
    priority: 90,
    createdAt: new Date().toISOString(),
  },
];

function mapRow(row: Record<string, unknown>): Banner {
  return {
    id: String(row.id ?? ""),
    title: String(row.title ?? ""),
    subtitle: row.subtitle ? String(row.subtitle) : null,
    ctaLabel: row.cta_label ? String(row.cta_label) : null,
    ctaUrl: row.cta_url ? String(row.cta_url) : null,
    imageUrl: row.image_url ? String(row.image_url) : null,
    bgFrom: String(row.bg_from ?? "#3182f6"),
    bgTo: String(row.bg_to ?? "#1d4ed8"),
    textColor: String(row.text_color ?? "white"),
    placement: String(row.placement ?? "home") as BannerPlacement,
    isActive: Boolean(row.is_active),
    priority: Number(row.priority ?? 0),
    startsAt: row.starts_at ? String(row.starts_at) : null,
    endsAt: row.ends_at ? String(row.ends_at) : null,
    targetPlan: row.target_plan ? String(row.target_plan) : null,
    createdBy: row.created_by ? String(row.created_by) : null,
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

function isActive(b: Banner): boolean {
  const now = Date.now();
  if (!b.isActive) return false;
  if (b.startsAt && new Date(b.startsAt).getTime() > now) return false;
  if (b.endsAt && new Date(b.endsAt).getTime() < now) return false;
  return true;
}

/** 특정 위치의 활성 배너 목록 반환 */
export async function listBanners(placement?: BannerPlacement): Promise<Banner[]> {
  const sb = getServiceSupabase();
  if (!sb) {
    const filtered = FALLBACK_BANNERS.filter(
      (b) => !placement || b.placement === placement || b.placement === "global",
    );
    return filtered;
  }

  let query = sb
    .from("banners")
    .select("*")
    .eq("is_active", true)
    .order("priority", { ascending: false });

  if (placement) {
    query = query.in("placement", [placement, "global"]);
  }

  const { data } = await query;
  if (!data) return FALLBACK_BANNERS;

  const now = new Date().toISOString();
  return (data as Record<string, unknown>[])
    .map(mapRow)
    .filter((b) => {
      if (b.startsAt && b.startsAt > now) return false;
      if (b.endsAt && b.endsAt < now) return false;
      return true;
    });
}

/** 배너 생성 (관리자) */
export async function createBanner(
  input: Omit<Banner, "id" | "createdAt"> & { createdBy?: string },
): Promise<Banner | null> {
  const sb = getServiceSupabase();
  if (!sb) return null;

  const { data, error } = await sb
    .from("banners")
    .insert({
      title: input.title,
      subtitle: input.subtitle,
      cta_label: input.ctaLabel,
      cta_url: input.ctaUrl,
      image_url: input.imageUrl,
      bg_from: input.bgFrom,
      bg_to: input.bgTo,
      text_color: input.textColor,
      placement: input.placement,
      is_active: input.isActive,
      priority: input.priority,
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      target_plan: input.targetPlan,
      created_by: input.createdBy,
    })
    .select()
    .single();

  if (error || !data) return null;
  return mapRow(data as Record<string, unknown>);
}

/** 배너 수정 (관리자) */
export async function updateBanner(
  id: string,
  input: Partial<Omit<Banner, "id" | "createdAt">>,
): Promise<boolean> {
  const sb = getServiceSupabase();
  if (!sb) return false;

  const { error } = await sb
    .from("banners")
    .update({
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.subtitle !== undefined ? { subtitle: input.subtitle } : {}),
      ...(input.ctaLabel !== undefined ? { cta_label: input.ctaLabel } : {}),
      ...(input.ctaUrl !== undefined ? { cta_url: input.ctaUrl } : {}),
      ...(input.bgFrom !== undefined ? { bg_from: input.bgFrom } : {}),
      ...(input.bgTo !== undefined ? { bg_to: input.bgTo } : {}),
      ...(input.placement !== undefined ? { placement: input.placement } : {}),
      ...(input.isActive !== undefined ? { is_active: input.isActive } : {}),
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
      ...(input.startsAt !== undefined ? { starts_at: input.startsAt } : {}),
      ...(input.endsAt !== undefined ? { ends_at: input.endsAt } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  return !error;
}

/** 배너 삭제 (관리자) */
export async function deleteBanner(id: string): Promise<boolean> {
  const sb = getServiceSupabase();
  if (!sb) return false;
  const { error } = await sb.from("banners").delete().eq("id", id);
  return !error;
}

export { isActive };
