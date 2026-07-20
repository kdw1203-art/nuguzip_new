/**
 * 매물(listings) Supabase 백엔드 — 서버 전용.
 * "중개사 제휴 + 집주인 직접 등록" 모델 (당근·네이버부동산 벤치마크).
 * RLS deny-all(정책 없음) — service-role 경유만 허용. Supabase 미설정 시 빈 값.
 */
import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/log";

export const LISTING_TYPES = ["sale", "jeonse", "monthly"] as const;
export type ListingType = (typeof LISTING_TYPES)[number];

export const LISTING_SOURCES = ["owner", "agent"] as const;
export type ListingSource = (typeof LISTING_SOURCES)[number];

export type ListingStatus = "pending" | "approved" | "rejected" | "closed";

export const LISTING_TYPE_LABEL: Record<ListingType, string> = {
  sale: "매매",
  jeonse: "전세",
  monthly: "월세",
};

export const LISTING_SOURCE_LABEL: Record<ListingSource, string> = {
  owner: "집주인 직접",
  agent: "중개사",
};

export function isListingType(v: string): v is ListingType {
  return (LISTING_TYPES as readonly string[]).includes(v);
}

export function isListingSource(v: string): v is ListingSource {
  return (LISTING_SOURCES as readonly string[]).includes(v);
}

/** 공개 목록용 — author_email 비노출 */
export interface PublicListing {
  id: string;
  authorLabel: string;
  source: ListingSource;
  listingType: ListingType;
  complexName: string;
  regionName: string | null;
  priceKrw: number | null;
  depositKrw: number | null;
  monthlyKrw: number | null;
  areaM2: number | null;
  floor: number | null;
  description: string | null;
  createdAt: string;
}

/** 어드민 검수용 — 연락처·이메일 포함 */
export interface AdminListing extends PublicListing {
  authorEmail: string;
  address: string | null;
  contact: string | null;
  status: ListingStatus;
  rejectReason: string | null;
}

function mapPublic(r: Record<string, unknown>): PublicListing {
  return {
    id: String(r.id ?? ""),
    authorLabel: String(r.author_label ?? "등록자"),
    source: isListingSource(String(r.source)) ? (String(r.source) as ListingSource) : "owner",
    listingType: isListingType(String(r.listing_type))
      ? (String(r.listing_type) as ListingType)
      : "sale",
    complexName: String(r.complex_name ?? ""),
    regionName: r.region_name != null ? String(r.region_name) : null,
    priceKrw: r.price_krw != null ? Number(r.price_krw) : null,
    depositKrw: r.deposit_krw != null ? Number(r.deposit_krw) : null,
    monthlyKrw: r.monthly_krw != null ? Number(r.monthly_krw) : null,
    areaM2: r.area_m2 != null ? Number(r.area_m2) : null,
    floor: r.floor != null ? Number(r.floor) : null,
    description: r.description != null ? String(r.description) : null,
    createdAt: String(r.created_at ?? new Date().toISOString()),
  };
}

function mapAdmin(r: Record<string, unknown>): AdminListing {
  const status = String(r.status ?? "pending");
  return {
    ...mapPublic(r),
    authorEmail: String(r.author_email ?? ""),
    address: r.address != null ? String(r.address) : null,
    contact: r.contact != null ? String(r.contact) : null,
    status: (["pending", "approved", "rejected", "closed"] as const).includes(
      status as ListingStatus,
    )
      ? (status as ListingStatus)
      : "pending",
    rejectReason: r.reject_reason != null ? String(r.reject_reason) : null,
  };
}

export interface ListingFilter {
  listingType?: ListingType;
  regionName?: string;
  complexName?: string;
}

/** 승인(approved)된 매물만 — 공개 목록. 최신순, 최대 200건. */
export async function listApprovedListings(
  filter: ListingFilter = {},
): Promise<PublicListing[]> {
  const sb = getServiceSupabase();
  if (!sb) return [];
  try {
    let q = sb
      .from("listings")
      .select(
        "id,author_label,source,listing_type,complex_name,region_name,price_krw,deposit_krw,monthly_krw,area_m2,floor,description,created_at",
      )
      .eq("status", "approved");
    if (filter.listingType) q = q.eq("listing_type", filter.listingType);
    if (filter.regionName) q = q.eq("region_name", filter.regionName);
    if (filter.complexName) q = q.eq("complex_name", filter.complexName);
    const { data, error } = await q.order("created_at", { ascending: false }).limit(200);
    if (error || !data) return [];
    return data.map((r) => mapPublic(r as Record<string, unknown>));
  } catch (e) {
    logger.warn("[listings] listApprovedListings", e);
    return [];
  }
}

/** 검수 대기(pending) 목록 — 어드민 전용. */
export async function listPendingListings(): Promise<AdminListing[]> {
  const sb = getServiceSupabase();
  if (!sb) return [];
  try {
    const { data, error } = await sb
      .from("listings")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(100);
    if (error || !data) return [];
    return data.map((r) => mapAdmin(r as Record<string, unknown>));
  } catch (e) {
    logger.warn("[listings] listPendingListings", e);
    return [];
  }
}

/** 검수 대기 건수 — 어드민 대시보드 링크 배지용. */
export async function countPendingListings(): Promise<number> {
  const sb = getServiceSupabase();
  if (!sb) return 0;
  try {
    const { count, error } = await sb
      .from("listings")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}

export async function createListing(input: {
  authorEmail: string;
  authorLabel: string;
  source: ListingSource;
  listingType: ListingType;
  complexName: string;
  regionName: string | null;
  address?: string | null;
  priceKrw?: number | null;
  depositKrw?: number | null;
  monthlyKrw?: number | null;
  areaM2?: number | null;
  floor?: number | null;
  description?: string | null;
  contact?: string | null;
}): Promise<{ id: string }> {
  const sb = getServiceSupabase();
  if (!sb) throw new Error("저장소가 준비되지 않았어요. 잠시 후 다시 시도해 주세요.");
  const { data, error } = await sb
    .from("listings")
    .insert({
      author_email: input.authorEmail,
      author_label: input.authorLabel,
      source: input.source,
      listing_type: input.listingType,
      complex_name: input.complexName,
      region_name: input.regionName,
      address: input.address ?? null,
      price_krw: input.priceKrw ?? null,
      deposit_krw: input.depositKrw ?? null,
      monthly_krw: input.monthlyKrw ?? null,
      area_m2: input.areaM2 ?? null,
      floor: input.floor ?? null,
      description: input.description ?? null,
      contact: input.contact ?? null,
      status: "pending",
    })
    .select("id")
    .single();
  if (error || !data) {
    logger.warn("[listings] createListing", error);
    throw new Error("매물 등록에 실패했어요. 잠시 후 다시 시도해 주세요.");
  }
  return { id: String(data.id) };
}

/** 승인/반려 처리 — 어드민 전용. */
export async function updateListingStatus(
  id: string,
  status: "approved" | "rejected",
  rejectReason?: string | null,
): Promise<boolean> {
  const sb = getServiceSupabase();
  if (!sb) return false;
  const { error } = await sb
    .from("listings")
    .update({
      status,
      reject_reason: status === "rejected" ? (rejectReason ?? null) : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "pending");
  if (error) {
    logger.warn("[listings] updateListingStatus", error);
    return false;
  }
  return true;
}
