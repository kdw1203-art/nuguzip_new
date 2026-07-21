/**
 * 개발물건 중개 — 서버 전용 쓰기 헬퍼.
 *
 * RLS deny-all 테이블이므로 service-role 경유로만 insert 한다.
 * 모든 함수는 {ok, id?} 를 반환하며 실패는 try/catch + logger 로 흡수한다(throw 안 함).
 */
import "server-only";
import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/log";

export interface WriteResult {
  ok: boolean;
  id?: string;
  error?: string;
}

export interface CreateDealInput {
  ownerEmail: string;
  title: string;
  dealType: string;
  region: string | null;
  address: string | null;
  landAreaM2: number | null;
  grossFloorAreaM2: number | null;
  units: number | null;
  totalCostKrw: number | null;
  neededPartners: string[];
  budgetText: string | null;
  summary: string | null;
  description: string | null;
  contactName: string | null;
  contactMasked: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
}

/** 개발물건 등록 — status=open 로 저장. */
export async function createDeal(input: CreateDealInput): Promise<WriteResult> {
  const sb = getServiceSupabase();
  if (!sb) return { ok: false, error: "저장소가 준비되지 않았어요." };
  try {
    const { data, error } = await sb
      .from("dev_deals")
      .insert({
        owner_email: input.ownerEmail,
        title: input.title,
        deal_type: input.dealType,
        region: input.region,
        address: input.address,
        land_area_m2: input.landAreaM2,
        gross_floor_area_m2: input.grossFloorAreaM2,
        units: input.units,
        total_cost_krw: input.totalCostKrw,
        needed_partners: input.neededPartners,
        budget_text: input.budgetText,
        summary: input.summary,
        description: input.description,
        contact_name: input.contactName,
        contact_masked: input.contactMasked,
        contact_email: input.contactEmail,
        contact_phone: input.contactPhone,
        status: "open",
        is_verified: false,
        is_sample: false,
      })
      .select("id")
      .single();
    if (error || !data) {
      logger.warn("[dev-deals] createDeal", error);
      return { ok: false, error: "개발물건 등록에 실패했어요." };
    }
    return { ok: true, id: String(data.id) };
  } catch (e) {
    logger.error("[dev-deals] createDeal", e);
    return { ok: false, error: "개발물건 등록 중 오류가 발생했어요." };
  }
}

export interface CreatePartnerInput {
  ownerEmail: string;
  companyName: string;
  partnerType: string;
  specialties: string[];
  region: string | null;
  intro: string | null;
  portfolioUrl: string | null;
  contactMasked: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
}

/** 협력업체 등록. */
export async function createPartner(input: CreatePartnerInput): Promise<WriteResult> {
  const sb = getServiceSupabase();
  if (!sb) return { ok: false, error: "저장소가 준비되지 않았어요." };
  try {
    const { data, error } = await sb
      .from("dev_partners")
      .insert({
        owner_email: input.ownerEmail,
        company_name: input.companyName,
        partner_type: input.partnerType,
        specialties: input.specialties,
        region: input.region,
        intro: input.intro,
        portfolio_url: input.portfolioUrl,
        contact_masked: input.contactMasked,
        contact_email: input.contactEmail,
        contact_phone: input.contactPhone,
        is_verified: false,
        is_sample: false,
      })
      .select("id")
      .single();
    if (error || !data) {
      logger.warn("[dev-deals] createPartner", error);
      return { ok: false, error: "협력업체 등록에 실패했어요." };
    }
    return { ok: true, id: String(data.id) };
  } catch (e) {
    logger.error("[dev-deals] createPartner", e);
    return { ok: false, error: "협력업체 등록 중 오류가 발생했어요." };
  }
}

export interface CreateInquiryInput {
  dealId: string;
  fromEmail: string;
  fromCompany: string | null;
  partnerType: string | null;
  message: string | null;
  proposedTerms: string | null;
}

/** 참여 문의 등록 — 성공 시 dev_deals.inquiry_count 를 best-effort 로 +1. */
export async function createInquiry(input: CreateInquiryInput): Promise<WriteResult> {
  const sb = getServiceSupabase();
  if (!sb) return { ok: false, error: "저장소가 준비되지 않았어요." };
  try {
    const { data, error } = await sb
      .from("dev_inquiries")
      .insert({
        deal_id: input.dealId,
        from_email: input.fromEmail,
        from_company: input.fromCompany,
        partner_type: input.partnerType,
        message: input.message,
        proposed_terms: input.proposedTerms,
        status: "received",
      })
      .select("id")
      .single();
    if (error || !data) {
      logger.warn("[dev-deals] createInquiry", error);
      return { ok: false, error: "참여 문의 접수에 실패했어요." };
    }
    // inquiry_count +1 (best-effort, 실패 무시)
    try {
      const { data: row } = await sb
        .from("dev_deals")
        .select("inquiry_count")
        .eq("id", input.dealId)
        .maybeSingle();
      const current =
        row && (row as Record<string, unknown>).inquiry_count != null
          ? Number((row as Record<string, unknown>).inquiry_count)
          : 0;
      await sb
        .from("dev_deals")
        .update({ inquiry_count: current + 1 })
        .eq("id", input.dealId);
    } catch (e) {
      logger.warn("[dev-deals] createInquiry bump", e);
    }
    return { ok: true, id: String(data.id) };
  } catch (e) {
    logger.error("[dev-deals] createInquiry", e);
    return { ok: false, error: "참여 문의 접수 중 오류가 발생했어요." };
  }
}
