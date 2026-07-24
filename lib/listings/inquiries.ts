/**
 * 매물 문의(리드) — 서버 전용.
 * 관심 구매/임차자가 매물에 남긴 문의를 등록자(중개사)가 인박스에서 받아 관리한다.
 * listing_inquiry: RLS deny-all(정책 없음) — service-role 경유만. Supabase 미설정 시 빈 값.
 */
import "server-only";
import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/log";
import { getListingById } from "@/lib/listings/store-db";

export const INQUIRY_STATUSES = ["new", "read", "replied", "archived"] as const;
export type InquiryStatus = (typeof INQUIRY_STATUSES)[number];

export const INQUIRY_MESSAGE_MAX = 1000;
export const INQUIRY_CONTACT_MAX = 120;

export function isInquiryStatus(v: string): v is InquiryStatus {
  return (INQUIRY_STATUSES as readonly string[]).includes(v);
}

export interface Inquiry {
  id: string;
  listingId: string;
  listingOwnerEmail: string;
  complexName: string | null;
  regionName: string | null;
  inquirerEmail: string | null;
  inquirerLabel: string | null;
  contact: string | null;
  message: string;
  status: InquiryStatus;
  createdAt: string;
  readAt: string | null;
}

function mapInquiry(r: Record<string, unknown>): Inquiry {
  const status = String(r.status ?? "new");
  return {
    id: String(r.id ?? ""),
    listingId: String(r.listing_id ?? ""),
    listingOwnerEmail: String(r.listing_owner_email ?? ""),
    complexName: r.complex_name != null ? String(r.complex_name) : null,
    regionName: r.region_name != null ? String(r.region_name) : null,
    inquirerEmail: r.inquirer_email != null ? String(r.inquirer_email) : null,
    inquirerLabel: r.inquirer_label != null ? String(r.inquirer_label) : null,
    contact: r.contact != null ? String(r.contact) : null,
    message: String(r.message ?? ""),
    status: isInquiryStatus(status) ? status : "new",
    createdAt: String(r.created_at ?? new Date().toISOString()),
    readAt: r.read_at != null ? String(r.read_at) : null,
  };
}

export type CreateInquiryResult =
  | { ok: true; id: string }
  | { ok: false; reason: "unavailable" | "not_found" | "self" | "invalid" };

/**
 * 문의 생성 — 승인(approved) 매물에만. 본인(등록자) 매물엔 문의 불가.
 * 매물의 등록자 이메일·단지·지역을 스냅샷으로 비정규화해 저장(매물 변경돼도 맥락 보존).
 */
export async function createInquiry(input: {
  listingId: string;
  inquirerEmail: string | null;
  inquirerLabel: string | null;
  contact: string | null;
  message: string;
}): Promise<CreateInquiryResult> {
  const sb = getServiceSupabase();
  if (!sb) return { ok: false, reason: "unavailable" };

  const message = input.message.trim().slice(0, INQUIRY_MESSAGE_MAX);
  if (!message) return { ok: false, reason: "invalid" };

  const listing = await getListingById(input.listingId).catch(() => null);
  if (!listing || listing.isHidden || listing.status !== "approved") {
    return { ok: false, reason: "not_found" };
  }
  // 본인(등록자) 매물엔 문의를 남길 수 없다.
  if (
    input.inquirerEmail &&
    input.inquirerEmail.toLowerCase() === listing.authorEmail.toLowerCase()
  ) {
    return { ok: false, reason: "self" };
  }

  const contact = input.contact?.trim().slice(0, INQUIRY_CONTACT_MAX) || null;
  try {
    const { data, error } = await sb
      .from("listing_inquiry")
      .insert({
        listing_id: listing.id,
        listing_owner_email: listing.authorEmail,
        complex_name: listing.complexName,
        region_name: listing.regionName,
        inquirer_email: input.inquirerEmail,
        inquirer_label: input.inquirerLabel,
        contact,
        message,
        status: "new",
      })
      .select("id")
      .single();
    if (error || !data) {
      logger.warn("[inquiries] createInquiry", error);
      return { ok: false, reason: "unavailable" };
    }
    return { ok: true, id: String(data.id) };
  } catch (e) {
    logger.warn("[inquiries] createInquiry", e);
    return { ok: false, reason: "unavailable" };
  }
}

/** 등록자(중개사) 인박스 — 받은 문의 최신순. */
export async function listInquiriesForOwner(
  ownerEmail: string,
  limit = 100,
): Promise<Inquiry[]> {
  const sb = getServiceSupabase();
  if (!sb || !ownerEmail) return [];
  try {
    const { data, error } = await sb
      .from("listing_inquiry")
      .select("*")
      .eq("listing_owner_email", ownerEmail)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    return data.map((r) => mapInquiry(r as Record<string, unknown>));
  } catch (e) {
    logger.warn("[inquiries] listInquiriesForOwner", e);
    return [];
  }
}

/** 내가 남긴 문의(구매/임차자 관점) — 최신순. */
export async function listMyInquiries(
  inquirerEmail: string,
  limit = 50,
): Promise<Inquiry[]> {
  const sb = getServiceSupabase();
  if (!sb || !inquirerEmail) return [];
  try {
    const { data, error } = await sb
      .from("listing_inquiry")
      .select("*")
      .eq("inquirer_email", inquirerEmail)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    return data.map((r) => mapInquiry(r as Record<string, unknown>));
  } catch (e) {
    logger.warn("[inquiries] listMyInquiries", e);
    return [];
  }
}

export type OwnerInquiryStats = { total: number; unread: number };

/** 등록자 문의 요약 — 총 건수·미확인(new) 건수. */
export async function getOwnerInquiryStats(
  ownerEmail: string,
): Promise<OwnerInquiryStats> {
  const sb = getServiceSupabase();
  if (!sb || !ownerEmail) return { total: 0, unread: 0 };
  try {
    const [totalRes, unreadRes] = await Promise.all([
      sb
        .from("listing_inquiry")
        .select("id", { count: "exact", head: true })
        .eq("listing_owner_email", ownerEmail),
      sb
        .from("listing_inquiry")
        .select("id", { count: "exact", head: true })
        .eq("listing_owner_email", ownerEmail)
        .eq("status", "new"),
    ]);
    return { total: totalRes.count ?? 0, unread: unreadRes.count ?? 0 };
  } catch (e) {
    logger.warn("[inquiries] getOwnerInquiryStats", e);
    return { total: 0, unread: 0 };
  }
}

/** 미확인(new) 문의 수 — 내비 배지용. */
export async function countUnreadForOwner(ownerEmail: string): Promise<number> {
  const { unread } = await getOwnerInquiryStats(ownerEmail);
  return unread;
}

/**
 * 문의 상태 변경 — 등록자 본인 소유 문의만(listing_owner_email 일치).
 * read 로 바꿀 때 read_at 기록. 반환: 갱신 성공 여부.
 */
export async function updateInquiryStatus(
  id: string,
  ownerEmail: string,
  status: InquiryStatus,
): Promise<boolean> {
  const sb = getServiceSupabase();
  if (!sb || !id || !ownerEmail) return false;
  try {
    const patch: Record<string, unknown> = { status };
    if (status === "read" || status === "replied") {
      patch.read_at = new Date().toISOString();
    }
    const { error } = await sb
      .from("listing_inquiry")
      .update(patch)
      .eq("id", id)
      .eq("listing_owner_email", ownerEmail);
    if (error) {
      logger.warn("[inquiries] updateInquiryStatus", error);
      return false;
    }
    return true;
  } catch (e) {
    logger.warn("[inquiries] updateInquiryStatus", e);
    return false;
  }
}
