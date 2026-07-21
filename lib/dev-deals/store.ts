/**
 * 개발물건 중개 — 서버 전용 조회 헬퍼.
 *
 * RLS deny-all(정책 없음) 테이블(dev_deals / dev_partners / dev_inquiries) 이므로
 * service-role(또는 read-only) 클라이언트 경유로만 접근한다. 미설정 시 빈 값.
 * 원본 연락처(email/phone) 는 공개 조회에서 select 하지 않는다.
 */
import "server-only";
import { getReadOnlySupabase } from "@/lib/newui/supabase-read";
import { logger } from "@/lib/log";
import { getServiceSupabase } from "@/lib/supabase/service";
import type { DevDeal, DevPartner, DevInquiry } from "@/lib/dev-deals/types";

/** 공개 노출 안전 컬럼 (contact_email / contact_phone 제외) */
const DEAL_COLUMNS =
  "id,title,deal_type,region,address,land_area_m2,gross_floor_area_m2,units,total_cost_krw,needed_partners,budget_text,summary,description,contact_name,contact_masked,status,is_verified,is_sample,view_count,inquiry_count,created_at,updated_at";

const PARTNER_COLUMNS =
  "id,company_name,partner_type,specialties,region,intro,portfolio_url,contact_masked,is_verified,is_sample,created_at";

const INQUIRY_COLUMNS =
  "id,deal_id,from_company,partner_type,message,proposed_terms,status,created_at";

function toStringArray(v: unknown): string[] {
  if (Array.isArray(v)) {
    return v.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
  }
  return [];
}

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function mapDeal(r: Record<string, unknown>): DevDeal {
  return {
    id: String(r.id ?? ""),
    ownerEmail: r.owner_email != null ? String(r.owner_email) : null,
    title: String(r.title ?? ""),
    dealType: String(r.deal_type ?? "기타"),
    region: r.region != null ? String(r.region) : null,
    address: r.address != null ? String(r.address) : null,
    landAreaM2: num(r.land_area_m2),
    grossFloorAreaM2: num(r.gross_floor_area_m2),
    units: num(r.units),
    totalCostKrw: num(r.total_cost_krw),
    neededPartners: toStringArray(r.needed_partners),
    budgetText: r.budget_text != null ? String(r.budget_text) : null,
    summary: r.summary != null ? String(r.summary) : null,
    description: r.description != null ? String(r.description) : null,
    contactName: r.contact_name != null ? String(r.contact_name) : null,
    contactMasked: r.contact_masked != null ? String(r.contact_masked) : null,
    status: String(r.status ?? "open"),
    isVerified: r.is_verified === true,
    isSample: r.is_sample === true,
    viewCount: num(r.view_count) ?? 0,
    inquiryCount: num(r.inquiry_count) ?? 0,
    createdAt: String(r.created_at ?? new Date().toISOString()),
    updatedAt: r.updated_at != null ? String(r.updated_at) : null,
  };
}

function mapPartner(r: Record<string, unknown>): DevPartner {
  return {
    id: String(r.id ?? ""),
    ownerEmail: r.owner_email != null ? String(r.owner_email) : null,
    companyName: String(r.company_name ?? ""),
    partnerType: String(r.partner_type ?? "기타"),
    specialties: toStringArray(r.specialties),
    region: r.region != null ? String(r.region) : null,
    intro: r.intro != null ? String(r.intro) : null,
    portfolioUrl: r.portfolio_url != null ? String(r.portfolio_url) : null,
    contactMasked: r.contact_masked != null ? String(r.contact_masked) : null,
    isVerified: r.is_verified === true,
    isSample: r.is_sample === true,
    createdAt: String(r.created_at ?? new Date().toISOString()),
  };
}

function mapInquiry(r: Record<string, unknown>): DevInquiry {
  return {
    id: String(r.id ?? ""),
    dealId: String(r.deal_id ?? ""),
    fromEmail: r.from_email != null ? String(r.from_email) : null,
    fromCompany: r.from_company != null ? String(r.from_company) : null,
    partnerType: r.partner_type != null ? String(r.partner_type) : null,
    message: r.message != null ? String(r.message) : null,
    proposedTerms: r.proposed_terms != null ? String(r.proposed_terms) : null,
    status: String(r.status ?? "received"),
    createdAt: String(r.created_at ?? new Date().toISOString()),
  };
}

export interface DealFilter {
  /** deal_type 정확 일치 */
  type?: string;
  /** region 정확 일치 */
  region?: string;
  /** needed_partners 배열에 포함되는 협력 분야 */
  partner?: string;
  /** status 정확 일치 */
  status?: string;
}

/** 개발물건 목록 — 최신순, 최대 120건. */
export async function listDeals(filter: DealFilter = {}): Promise<DevDeal[]> {
  const sb = getReadOnlySupabase();
  if (!sb) return [];
  try {
    let q = sb.from("dev_deals").select(DEAL_COLUMNS);
    if (filter.type) q = q.eq("deal_type", filter.type);
    if (filter.region) q = q.eq("region", filter.region);
    if (filter.status) q = q.eq("status", filter.status);
    if (filter.partner) q = q.contains("needed_partners", [filter.partner]);
    const { data, error } = await q
      .order("created_at", { ascending: false })
      .limit(120);
    if (error || !data) return [];
    return data.map((r) => mapDeal(r as Record<string, unknown>));
  } catch (e) {
    logger.warn("[dev-deals] listDeals", e);
    return [];
  }
}

/** 개발물건 단건 조회 — 상세 페이지. 없으면 null. */
export async function getDeal(id: string): Promise<DevDeal | null> {
  const sb = getReadOnlySupabase();
  if (!sb || !id) return null;
  try {
    const { data, error } = await sb
      .from("dev_deals")
      .select(DEAL_COLUMNS)
      .eq("id", id)
      .maybeSingle();
    if (error || !data) return null;
    return mapDeal(data as Record<string, unknown>);
  } catch (e) {
    logger.warn("[dev-deals] getDeal", e);
    return null;
  }
}

/** 상세 조회수 +1 — best-effort(원자성 미보장, 실패 무시). */
export async function incrementDealView(id: string): Promise<void> {
  const sb = getServiceSupabase();
  if (!sb || !id) return;
  try {
    const { data } = await sb
      .from("dev_deals")
      .select("view_count")
      .eq("id", id)
      .maybeSingle();
    const current =
      data && (data as Record<string, unknown>).view_count != null
        ? Number((data as Record<string, unknown>).view_count)
        : 0;
    await sb
      .from("dev_deals")
      .update({ view_count: current + 1 })
      .eq("id", id);
  } catch (e) {
    logger.warn("[dev-deals] incrementDealView", e);
  }
}

export interface PartnerFilter {
  /** partner_type 정확 일치 */
  type?: string;
}

/** 협력업체 목록 — 최신순, 최대 120건. */
export async function listPartners(filter: PartnerFilter = {}): Promise<DevPartner[]> {
  const sb = getReadOnlySupabase();
  if (!sb) return [];
  try {
    let q = sb.from("dev_partners").select(PARTNER_COLUMNS);
    if (filter.type) q = q.eq("partner_type", filter.type);
    const { data, error } = await q
      .order("created_at", { ascending: false })
      .limit(120);
    if (error || !data) return [];
    return data.map((r) => mapPartner(r as Record<string, unknown>));
  } catch (e) {
    logger.warn("[dev-deals] listPartners", e);
    return [];
  }
}

/** 협력업체 단건 조회. 없으면 null. */
export async function getPartner(id: string): Promise<DevPartner | null> {
  const sb = getReadOnlySupabase();
  if (!sb || !id) return null;
  try {
    const { data, error } = await sb
      .from("dev_partners")
      .select(PARTNER_COLUMNS)
      .eq("id", id)
      .maybeSingle();
    if (error || !data) return null;
    return mapPartner(data as Record<string, unknown>);
  } catch (e) {
    logger.warn("[dev-deals] getPartner", e);
    return null;
  }
}

/** 특정 개발물건에 접수된 참여 문의 목록 — 최신순, 최대 100건. */
export async function listDealInquiries(dealId: string): Promise<DevInquiry[]> {
  const sb = getReadOnlySupabase();
  if (!sb || !dealId) return [];
  try {
    const { data, error } = await sb
      .from("dev_inquiries")
      .select(INQUIRY_COLUMNS)
      .eq("deal_id", dealId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error || !data) return [];
    return data.map((r) => mapInquiry(r as Record<string, unknown>));
  } catch (e) {
    logger.warn("[dev-deals] listDealInquiries", e);
    return [];
  }
}
