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

/* 사실 우선: 여기 있던 FALLBACK_BANNERS 2건을 삭제했다.
   - "AI 투자 분석 무료 체험" → ctaUrl "/ai-analysis" (없는 경로. 실제는 /analysis) = 404
   - "임장 모임 함께해요 / 이번 주말 강남·마포 임장 모임에 참여하세요"
     → ctaUrl "/market" (없는 경로. 실제는 /town/market) = 404
   둘 다 홈 첫 화면에 공개 노출되는 프로모션이었다. 하지도 않는 행사를
   "이번 주말"이라고 못박아 광고하고, 눌러도 404 로 떨어진다. 배너는 DB(banners)
   에 등록된 것만 노출한다 — 등록이 없으면 배너 영역을 그리지 않는다. */

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
  // DB 미연결이면 노출할 배너를 "모른다" — 지어낸 프로모션 대신 빈 목록.
  if (!sb) return [];

  let query = sb
    .from("banners")
    .select("*")
    .eq("is_active", true)
    .order("priority", { ascending: false });

  if (placement) {
    query = query.in("placement", [placement, "global"]);
  }

  const { data } = await query;
  // 조회 실패도 "노출할 배너 없음"으로 처리한다(가짜 배너로 채우지 않는다).
  if (!data) return [];

  const now = new Date().toISOString();
  return (data as Record<string, unknown>[])
    .map(mapRow)
    .filter((b) => {
      if (b.startsAt && b.startsAt > now) return false;
      if (b.endsAt && b.endsAt < now) return false;
      return true;
    });
}

export type BannerLifecycle = "live" | "scheduled" | "expired" | "paused";

/**
 * 배너의 현재 상태를 하나로 정리한다.
 * 어드민에서 "왜 안 보이지?" 를 즉시 답하기 위한 값 — 비활성/기간 전/기간 후를 구분한다.
 */
export function bannerLifecycle(b: Banner, now = new Date()): BannerLifecycle {
  if (!b.isActive) return "paused";
  const t = now.getTime();
  if (b.startsAt && new Date(b.startsAt).getTime() > t) return "scheduled";
  if (b.endsAt && new Date(b.endsAt).getTime() < t) return "expired";
  return "live";
}

/**
 * 어드민용 전체 목록 — 비활성·기간 지난 것까지 포함한다.
 *
 * listBanners() 는 `is_active = true` 로 걸러서 노출용으로 쓰는 함수라,
 * 그걸 어드민에 그대로 쓰면 꺼둔 배너가 목록에서 사라져 되살릴 방법이 없어진다.
 * (H4 CMS 의 핵심 요구가 "노출기간 관리" 라 지난 배너를 봐야 한다.)
 */
export async function listAllBanners(): Promise<Banner[]> {
  /* 2026-07-26: error 를 버리고 `!data → []` 로 넘겼다. 그러면 어드민은
     "등록 0건"으로 읽고, 이미 있는 배너를 다시 만들거나 "광고가 안 나간다"고
     오판한다. 조회 실패는 등록 0건이 아니다 — 던져서 호출부가 구분하게 한다. */
  const sb = getServiceSupabase();
  if (!sb) {
    throw new Error(
      "[banners] Supabase 서비스 클라이언트를 만들 수 없습니다 (SUPABASE_SERVICE_ROLE_KEY 누락)",
    );
  }
  const { data, error } = await sb
    .from("banners")
    .select("*")
    .order("priority", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(`banners 조회 실패: ${error.message}`);
  if (!Array.isArray(data)) throw new Error("banners 응답이 배열이 아닙니다");
  return (data as Record<string, unknown>[]).map(mapRow);
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
      // image_url·text_color·target_plan 이 빠져 있어서 생성 후에는 영영 못 고쳤다.
      ...(input.imageUrl !== undefined ? { image_url: input.imageUrl } : {}),
      ...(input.textColor !== undefined ? { text_color: input.textColor } : {}),
      ...(input.targetPlan !== undefined ? { target_plan: input.targetPlan } : {}),
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
