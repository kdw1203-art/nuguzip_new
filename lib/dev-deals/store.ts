/**
 * 개발물건 중개 — 서버 전용 조회 헬퍼.
 *
 * RLS deny-all(정책 없음) 테이블(dev_deals / dev_partners / dev_inquiries) 이므로
 * service-role(또는 read-only) 클라이언트 경유로만 접근한다. 미설정 시 빈 값.
 * 원본 연락처(email/phone) 는 공개 조회에서 select 하지 않는다.
 *
 * 사실 우선: 공개 조회에서 is_sample=true 행은 제외한다.
 * 테이블에 남아 있던 예시 행은 실제 등록 건과 구분이 어렵다 —
 * "[예시] 강북구 미아동 가로주택정비사업 시공사 모집"(168세대·총사업비 420억·담당 김○○)과
 * "[예시] 대성종합건설"(시공사·책임준공 실적 다수)은 둘 다 is_verified=true 라
 * 카드에 초록 "검증" 배지까지 달려 나갔다. 여기 오는 사람은 시공사·설계사·신탁이고
 * 카드의 "참여 문의" 는 실제 제안으로 이어진다. 존재하지 않는 사업장에 제안을 넣게
 * 만드는 종류라 목록·상세·문의 검증에서 모두 걷어낸다.
 * 물건이 0건일 때 레이아웃은 app/dev-deals/page.tsx 의 EXAMPLE_DEAL 이 대신한다
 * (지역을 "○○구" 로 가려 실제 사업장으로 오인할 수 없는 형태).
 * (행 자체는 지우지 않는다.)
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
/* 2026-07-26: 실패할 때 `[]` 를 돌려줬다. 그러면 개발물건 허브는 "등록된
   개발물건이 없어요" 로 그려진다 — 시행사가 올려 둔 물건이 있어도 사라진 것처럼
   보이고, 반대로 "아직 아무도 안 쓰는 서비스" 라는 잘못된 인상을 준다.
   실패는 던져서 호출부가 "지금 불러오지 못했다"고 말하게 한다. */
export async function listDeals(filter: DealFilter = {}): Promise<DevDeal[]> {
  const sb = getReadOnlySupabase();
  if (!sb) throw new Error("Supabase 읽기 클라이언트를 만들 수 없습니다 (환경변수 누락)");
  try {
    let q = sb.from("dev_deals").select(DEAL_COLUMNS).eq("is_sample", false);
    if (filter.type) q = q.eq("deal_type", filter.type);
    if (filter.region) q = q.eq("region", filter.region);
    if (filter.status) q = q.eq("status", filter.status);
    if (filter.partner) q = q.contains("needed_partners", [filter.partner]);
    const { data, error } = await q
      .order("created_at", { ascending: false })
      .limit(120);
    if (error) throw new Error(error.message);
    if (!Array.isArray(data)) throw new Error("dev_deals 응답이 배열이 아닙니다");
    return data.map((r) => mapDeal(r as Record<string, unknown>));
  } catch (e) {
    logger.error("[dev-deals] listDeals 조회 실패", e);
    throw e;
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
      .eq("is_sample", false) // 예시 물건 상세·문의 진입 차단
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
    const { data, error } = await sb
      .from("dev_deals")
      .select("view_count")
      .eq("id", id)
      .maybeSingle();
    /* 못 읽은 것을 0 으로 보고 아래 update 를 태우면 쌓인 조회수가 1 로
       덮어써진다 — best-effort 인 +1 이 데이터 파괴가 된다. 못 읽었으면 쓰지 않는다. */
    if (error) {
      logger.warn(`[dev-deals] view_count 조회 실패 (${id}) — +1 을 건너뜁니다.`, error);
      return;
    }
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
    let q = sb.from("dev_partners").select(PARTNER_COLUMNS).eq("is_sample", false);
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

/** listPartnersAll 페치 상한 — 전량이 이 안에 들어와야 클라이언트 type 필터가
 *  서버 .eq 필터와 동치다. 실측(2026-08-10): dev_partners 전체 1행(실등록 0). */
export const PARTNERS_FETCH_CAP = 120;

export type PartnersAllResult = {
  /** false = 조회 실패 — "아직 없어요"(빈 결과)와 구별해 그려야 한다.
   *  dev_partners 는 anon SELECT 가 없어 service-role 이 죽으면 여기로 온다
   *  (그 부류는 health.privilegedRead 가 감시한다). */
  ok: boolean;
  items: DevPartner[];
  /** 페치 상한 도달 — 전량 보장이 깨졌을 수 있음 */
  truncated: boolean;
};

/**
 * 전량 로더 (ISR /dev-deals/partners 용) — type 필터는 클라이언트가 메모리에서
 * 건다. 기존 listPartners 와 달리 실패([] 삼키기)와 빈 결과를 구별한다 —
 * ISR 이 실패 화면을 "아직 없어요"로 캐시하지 않게 하기 위해서다(dev-deals 교훈).
 */
export async function listPartnersAll(): Promise<PartnersAllResult> {
  const sb = getReadOnlySupabase();
  if (!sb) return { ok: false, items: [], truncated: false };
  try {
    const { data, error } = await sb
      .from("dev_partners")
      .select(PARTNER_COLUMNS)
      .eq("is_sample", false)
      .order("created_at", { ascending: false })
      .limit(PARTNERS_FETCH_CAP);
    if (error || !data) {
      logger.warn("[dev-deals] listPartnersAll", error ?? "no data");
      return { ok: false, items: [], truncated: false };
    }
    const items = data.map((r) => mapPartner(r as Record<string, unknown>));
    return { ok: true, items, truncated: items.length >= PARTNERS_FETCH_CAP };
  } catch (e) {
    logger.warn("[dev-deals] listPartnersAll", e);
    return { ok: false, items: [], truncated: false };
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
      .eq("is_sample", false) // 예시 업체 상세 진입 차단
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
