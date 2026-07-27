/**
 * 매물(listings) Supabase 백엔드 — 서버 전용.
 * "중개사 제휴 + 집주인 직접 등록" 모델 (당근·네이버부동산 벤치마크).
 * RLS deny-all(정책 없음) — service-role 경유만 허용. Supabase 미설정 시 빈 값.
 */
import { getServiceSupabase } from "@/lib/supabase/service";
import { getReadOnlySupabase } from "@/lib/newui/supabase-read";
import { logger } from "@/lib/log";
import { comparePriceToMarket } from "@/lib/listings/price-compare";

/** 갱신 없이 이 일수를 넘기면 "확인 필요"(stale). 자동 삭제 없음. */
export const LISTING_STALE_DAYS = 21;
/**
 * 갱신 없이 이 일수를 넘기면 마감을 제안한다. **제안일 뿐, 자동 마감은 하지 않는다.**
 * 갱신이 없다는 사실이 "거래가 끝났다"를 뜻하지는 않는다 — 그냥 바쁜 중개사일 수도 있다.
 * 60일인 이유: 21일의 세 주기쯤 지나야 "잊혔다"고 볼 만하고, 그전에 마감을 권하면
 * 아직 파는 중인 매물에 대고 그만두라는 소리가 된다.
 */
export const LISTING_CLOSE_SUGGEST_DAYS = 60;
/** 누적 신고가 이 값에 도달하면 자동 숨김(is_hidden=true). */
export const LISTING_REPORT_HIDE_THRESHOLD = 3;
/** 호가가 실거래 중위가 대비 이 %를 벗어나면 이상가로 플래그. */
export const LISTING_PRICE_ANOMALY_PCT = 40;

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
  /** 지도 핀 좌표 (등록 시 역지오코딩) */
  lat: number | null;
  lng: number | null;
  /** 대표 사진 URL (선택) */
  thumbnailUrl: string | null;
  /** 노출 부스트 만료 시각(ISO) — null이면 부스트 없음 */
  boostUntil: string | null;
  /** 소유 확인(등기부 등) 완료 여부 */
  ownerVerified: boolean;
  /** 상세 조회수 */
  viewCount: number;
  /** 마지막 갱신(끌어올리기) 시각(ISO) — 신선도 판정 기준. null이면 created_at 사용. */
  refreshedAt: string | null;
  /** 누적 신고 수 */
  reportCount: number;
  /** 신고 누적 등으로 자동 숨김된 매물 여부 — 공개 목록/상세에서 제외 */
  isHidden: boolean;
  /** 허위·중복·이상가 자동 플래그 사유(내부용). null이면 플래그 없음. */
  flagReason: string | null;
  /** 중복 주소 의심 여부 */
  isDuplicate: boolean;
}

/** 어드민 검수용 — 연락처·이메일 포함 */
export interface AdminListing extends PublicListing {
  authorEmail: string;
  address: string | null;
  contact: string | null;
  status: ListingStatus;
  rejectReason: string | null;
}

/** 상세 페이지·내 매물용 — 사진 배열까지 포함 */
export interface ListingDetail extends AdminListing {
  photos: string[];
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
    lat: r.lat != null && Number.isFinite(Number(r.lat)) ? Number(r.lat) : null,
    lng: r.lng != null && Number.isFinite(Number(r.lng)) ? Number(r.lng) : null,
    thumbnailUrl: r.thumbnail_url != null ? String(r.thumbnail_url) : null,
    boostUntil: r.boost_until != null ? String(r.boost_until) : null,
    ownerVerified: r.owner_verified === true,
    viewCount: r.view_count != null ? Number(r.view_count) : 0,
    refreshedAt: r.refreshed_at != null ? String(r.refreshed_at) : null,
    reportCount: r.report_count != null ? Number(r.report_count) : 0,
    isHidden: r.is_hidden === true,
    flagReason: r.flag_reason != null ? String(r.flag_reason) : null,
    isDuplicate: r.is_duplicate === true,
  };
}

/**
 * 신선도 단계 — 0 정상 · 1 확인 필요(21일) · 2 마감 제안(60일).
 * 기준시각은 refreshed_at, 없으면 created_at.
 *
 * 화면(배지)과 크론(알림)이 같은 함수를 쓴다. 둘이 갈리면 "화면엔 멀쩡한데
 * 알림은 오는" 상태가 생기고, 그건 알림을 끄게 만드는 가장 빠른 길이다.
 */
export type ListingStaleStage = 0 | 1 | 2;

export function listingStaleStage(
  listing: Pick<PublicListing, "refreshedAt" | "createdAt">,
  now: number = Date.now(),
): ListingStaleStage {
  const basis = listing.refreshedAt ?? listing.createdAt;
  const t = Date.parse(basis);
  if (!Number.isFinite(t)) return 0;
  const age = now - t;
  if (age > LISTING_CLOSE_SUGGEST_DAYS * 86_400_000) return 2;
  if (age > LISTING_STALE_DAYS * 86_400_000) return 1;
  return 0;
}

/** 신선도 판정 — LISTING_STALE_DAYS 초과 시 stale(1단계 이상). */
export function isListingStale(
  listing: Pick<PublicListing, "refreshedAt" | "createdAt">,
): boolean {
  return listingStaleStage(listing) >= 1;
}

/** jsonb photos → string[] (URL 배열) */
function parsePhotos(v: unknown): string[] {
  let arr: unknown = v;
  if (typeof v === "string") {
    try {
      arr = JSON.parse(v);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(arr)) return [];
  return arr.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
}

function mapDetail(r: Record<string, unknown>): ListingDetail {
  return { ...mapAdmin(r), photos: parsePhotos(r.photos) };
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
        "id,author_label,source,listing_type,complex_name,region_name,price_krw,deposit_krw,monthly_krw,area_m2,floor,description,created_at,lat,lng,thumbnail_url,boost_until,owner_verified,view_count,refreshed_at,report_count,is_hidden,flag_reason,is_duplicate",
      )
      .eq("status", "approved")
      .eq("is_hidden", false)
      .is("deleted_at", null);
    if (filter.listingType) q = q.eq("listing_type", filter.listingType);
    if (filter.regionName) q = q.eq("region_name", filter.regionName);
    if (filter.complexName) q = q.eq("complex_name", filter.complexName);
    // 부스트 우선(만료·null은 뒤) → 최신순
    const { data, error } = await q
      .order("boost_until", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(200);
    /* 못 읽은 것을 [] 로 돌려주면 /listings 는 "조건에 맞는 매물이 없어요",
       /complex/[id] 는 "등록된 매물 없음"이라고 단정한다 — 멀쩡히 올라와 있는
       남의 매물을 없다고 말하는 셈이다. 조회 실패는 던지고, 부르는 쪽이
       "지금 못 읽었다"를 그리게 한다(곁다리인 /complex/[id] 는 settle() 이 받는다). */
    if (error) {
      throw new Error(`listings 조회 실패: ${error.message ?? "알 수 없는 오류"}`);
    }
    return (data ?? []).map((r) => mapPublic(r as Record<string, unknown>));
  } catch (e) {
    /* 여기서 삼키지 않는다. 로그는 부르는 쪽(dbUnavailable·settle·ErrorState)이
       남기므로 중복으로 찍지 않고 그대로 올려 보낸다. */
    throw e;
  }
}

/** 지도 마커용 — 좌표를 가진 승인 매물 (최소 컬럼, author_email 비노출). */
export interface BoundsListing {
  id: string;
  lat: number;
  lng: number;
  listingType: ListingType;
  complexName: string;
  priceKrw: number | null;
  depositKrw: number | null;
  monthlyKrw: number | null;
  boostUntil: string | null;
}

/**
 * 뷰포트(bounds) 안의 승인 매물 — 지도 매물 레이어 마커용.
 * 좌표(lat/lng) 필수, 부스트 우선 → 최신순, 최대 limit건(기본 200).
 * getReadOnlySupabase 경유 — env 미설정/조회 실패 시 빈 배열.
 */
export async function listListingsInBounds(bounds: {
  swLat: number;
  swLng: number;
  neLat: number;
  neLng: number;
  limit?: number;
  listingType?: ListingType;
}): Promise<BoundsListing[]> {
  const sb = getReadOnlySupabase();
  if (!sb) return [];
  // min/max 뒤집힘 정규화
  const swLat = Math.min(bounds.swLat, bounds.neLat);
  const neLat = Math.max(bounds.swLat, bounds.neLat);
  const swLng = Math.min(bounds.swLng, bounds.neLng);
  const neLng = Math.max(bounds.swLng, bounds.neLng);
  if (![swLat, neLat, swLng, neLng].every((n) => Number.isFinite(n))) return [];
  const limit = Math.min(Math.max(Math.round(bounds.limit ?? 200), 1), 500);
  try {
    let q = sb
      .from("listings")
      .select(
        "id,lat,lng,listing_type,complex_name,price_krw,deposit_krw,monthly_krw,boost_until,created_at",
      )
      .eq("status", "approved")
      .eq("is_hidden", false)
      .is("deleted_at", null)
      .not("lat", "is", null)
      .not("lng", "is", null)
      .gte("lat", swLat)
      .lte("lat", neLat)
      .gte("lng", swLng)
      .lte("lng", neLng);
    if (bounds.listingType) q = q.eq("listing_type", bounds.listingType);
    const { data, error } = await q
      .order("boost_until", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    return (data as Array<Record<string, unknown>>)
      .filter((r) => Number.isFinite(Number(r.lat)) && Number.isFinite(Number(r.lng)))
      .map((r) => ({
        id: String(r.id ?? ""),
        lat: Number(r.lat),
        lng: Number(r.lng),
        listingType: isListingType(String(r.listing_type))
          ? (String(r.listing_type) as ListingType)
          : "sale",
        complexName: String(r.complex_name ?? ""),
        priceKrw: r.price_krw != null ? Number(r.price_krw) : null,
        depositKrw: r.deposit_krw != null ? Number(r.deposit_krw) : null,
        monthlyKrw: r.monthly_krw != null ? Number(r.monthly_krw) : null,
        boostUntil: r.boost_until != null ? String(r.boost_until) : null,
      }));
  } catch (e) {
    logger.warn("[listings] listListingsInBounds", e);
    return [];
  }
}

/** 검수 대기(pending) 목록 — 어드민 전용. */
export async function listPendingListings(): Promise<AdminListing[]> {
  /* 2026-07-26: 실패를 `[]` 로 삼켰다. 그러면 /admin/listings 는 "대기 0건 ·
     검수 대기 중인 매물이 없어요" 라고 말한다 — 올라온 매물이 며칠씩 검수 없이
     묶여 있어도 아무도 모른다. 실패는 던진다. */
  const sb = getServiceSupabase();
  if (!sb) {
    throw new Error(
      "[listings] Supabase 서비스 클라이언트를 만들 수 없습니다 (SUPABASE_SERVICE_ROLE_KEY 누락)",
    );
  }
  try {
    const { data, error } = await sb
      .from("listings")
      .select("*")
      .eq("status", "pending")
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(100);
    if (error) throw new Error(`listings(pending) 조회 실패: ${error.message}`);
    if (!Array.isArray(data)) throw new Error("listings(pending) 응답이 배열이 아닙니다");
    return data.map((r) => mapAdmin(r as Record<string, unknown>));
  } catch (e) {
    logger.error("[listings] 검수 대기 목록 조회 실패", e);
    throw e;
  }
}

/**
 * 신고가 쌓였거나 자동 숨김된 매물 — 어드민 전용.
 *
 * I7·I8 — 지금까지 어드민 큐는 status="pending" 만 봤다. 그런데 자동 숨김은
 * **이미 승인된** 매물에서 일어난다(reportListing 이 report_count 를 올리다가
 * LISTING_REPORT_HIDE_THRESHOLD 에 닿으면 is_hidden=true). 그 매물은 pending 이
 * 아니므로 어느 화면에도 뜨지 않았다 — 신고를 받아 감추기는 하는데 사람이 그걸
 * 들여다보는 자리가 없었고, 억울하게 숨겨진 매물이 되살아날 길도 없었다.
 * 신고가 한 건이라도 있거나 숨김 상태인 매물을 여기서 모아 준다.
 */
export async function listReportedListings(limit = 100): Promise<AdminListing[]> {
  /* 2026-07-26: 실패를 `[]` 로 삼켰다. 신고 3건이면 자동 숨김이 걸리는 큐라서,
     실패가 "신고 0건"으로 보이면 감춰진 매물을 아무도 확인하지 않게 된다. 던진다. */
  const sb = getServiceSupabase();
  if (!sb) {
    throw new Error(
      "[listings] Supabase 서비스 클라이언트를 만들 수 없습니다 (SUPABASE_SERVICE_ROLE_KEY 누락)",
    );
  }
  try {
    const { data, error } = await sb
      .from("listings")
      .select("*")
      .or("report_count.gt.0,is_hidden.eq.true")
      .is("deleted_at", null)
      .order("report_count", { ascending: false })
      .limit(limit);
    if (error) throw new Error(`listings(reported) 조회 실패: ${error.message}`);
    if (!Array.isArray(data)) throw new Error("listings(reported) 응답이 배열이 아닙니다");
    return data.map((r) => mapAdmin(r as Record<string, unknown>));
  } catch (e) {
    logger.error("[listings] 신고 매물 조회 실패", e);
    throw e;
  }
}

/**
 * 숨김 해제 / 재숨김 — 운영자 판단으로 되돌리는 경로(I8).
 * 해제할 때 report_count 를 0 으로 되돌린다. 안 그러면 임계값을 이미 넘긴 상태라
 * 다음 신고 한 건에 즉시 다시 숨겨져서, 해제가 사실상 아무 효과가 없다.
 */
export async function setListingHidden(
  id: string,
  hidden: boolean,
): Promise<boolean> {
  const sb = getServiceSupabase();
  if (!sb || !id) return false;
  try {
    const update: Record<string, unknown> = {
      is_hidden: hidden,
      updated_at: new Date().toISOString(),
    };
    if (!hidden) update.report_count = 0;
    const { error } = await sb.from("listings").update(update).eq("id", id);
    return !error;
  } catch (e) {
    logger.warn("[listings] setListingHidden", e);
    return false;
  }
}

/** 검수 대기 건수 — 어드민 대시보드 링크 배지용. */
export async function countPendingListings(): Promise<number> {
  /* 2026-07-26: 실패를 전부 0 으로 눌렀다. 어드민 헤더에 "매물 검수 0건" 이라고
     뜨면 운영자는 검수 화면을 열지 않는다 — 실제로는 대기가 쌓여 있는데도.
     집계 실패는 0건이 아니다. 던져서 호출부가 "—" 로 그리게 한다. */
  const sb = getServiceSupabase();
  if (!sb) {
    throw new Error(
      "[listings] Supabase 서비스 클라이언트를 만들 수 없습니다 (SUPABASE_SERVICE_ROLE_KEY 누락)",
    );
  }
  const { count, error } = await sb
    .from("listings")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  if (error) {
    logger.error("[listings] 검수 대기 건수 집계 실패", error.message);
    throw new Error(`listings(pending) 집계 실패: ${error.message}`);
  }
  if (typeof count !== "number") throw new Error("listings(pending) 집계 결과가 숫자가 아닙니다");
  return count;
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
  lat?: number | null;
  lng?: number | null;
  thumbnailUrl?: string | null;
  photos?: string[] | null;
}): Promise<{ id: string }> {
  const sb = getServiceSupabase();
  if (!sb) throw new Error("저장소가 준비되지 않았어요. 잠시 후 다시 시도해 주세요.");

  // #5 허위매물 자동 플래그 (1) 중복 주소 — best-effort, 등록을 막지 않는다.
  let isDuplicate = false;
  let flagReason: string | null = null;
  try {
    if (await detectDuplicateAddress(input.address, input.listingType)) {
      isDuplicate = true;
      flagReason = "중복 주소 의심";
    }
  } catch (e) {
    logger.warn("[listings] createListing:duplicate", e);
  }

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
      lat: input.lat ?? null,
      lng: input.lng ?? null,
      thumbnail_url: input.thumbnailUrl ?? null,
      photos: input.photos && input.photos.length > 0 ? input.photos : null,
      status: "pending",
      is_duplicate: isDuplicate,
      flag_reason: flagReason,
    })
    .select("id")
    .single();
  if (error || !data) {
    logger.warn("[listings] createListing", error);
    throw new Error("매물 등록에 실패했어요. 잠시 후 다시 시도해 주세요.");
  }
  const id = String(data.id);

  // #5 허위매물 자동 플래그 (2) 이상가 — 매매만, 삽입 후 best-effort. 등록 결과에 영향 주지 않는다.
  if (input.listingType === "sale") {
    try {
      const cmp = await comparePriceToMarket({
        complexName: input.complexName,
        regionName: input.regionName,
        areaM2: input.areaM2 ?? null,
        listingType: input.listingType,
        priceKrw: input.priceKrw ?? null,
        depositKrw: input.depositKrw ?? null,
      });
      if (cmp && Math.abs(cmp.deltaPct) > LISTING_PRICE_ANOMALY_PCT) {
        const priceReason = `시세 대비 ${cmp.deltaPct > 0 ? "고가" : "저가"} ${cmp.deltaPct}%`;
        const combined = flagReason ? `${flagReason}; ${priceReason}` : priceReason;
        await sb.from("listings").update({ flag_reason: combined }).eq("id", id);
      }
    } catch (e) {
      logger.warn("[listings] createListing:priceAnomaly", e);
    }
  }

  return { id };
}

/** 주소 정규화 — 공백 제거 + 소문자 (중복 판정 비교용). */
function normalizeAddress(address: string): string {
  return address.replace(/\s+/g, "").toLowerCase();
}

/**
 * 같은 정규화 주소 + 같은 거래유형 매물이 이미 존재하는지 — 중복 매물 자동 플래그용.
 * best-effort: 저장소 미설정/조회 실패 시 false. 후보를 정규화 비교(최대 1000건).
 */
export async function detectDuplicateAddress(
  address: string | null | undefined,
  listingType: ListingType,
): Promise<boolean> {
  const raw = (address ?? "").trim();
  if (!raw) return false;
  const target = normalizeAddress(raw);
  if (!target) return false;
  const sb = getServiceSupabase();
  if (!sb) return false;
  try {
    const { data, error } = await sb
      .from("listings")
      .select("address")
      .eq("listing_type", listingType)
      .not("address", "is", null)
      .limit(1000);
    if (error || !data) return false;
    return (data as Array<Record<string, unknown>>).some(
      (r) => normalizeAddress(String(r.address ?? "")) === target,
    );
  } catch (e) {
    logger.warn("[listings] detectDuplicateAddress", e);
    return false;
  }
}

/**
 * #6 끌어올리기(갱신) — 소유자 본인만. refreshed_at·updated_at 을 now 로 갱신.
 * 소유자 불일치/미존재 시 ok:false.
 *
 * I10 — 신선도 알림 단계도 함께 0 으로 되돌린다. 이걸 빠뜨리면 끌어올린 매물이
 * 60일 뒤 다시 낡았을 때 stale_notice_stage 가 이미 1 이라 1단계 안내를 건너뛰고
 * 곧장 마감 제안이 나간다. "끌어올렸다"는 곧 "이 매물은 다시 새것"이라는 뜻이므로
 * 알림 주기도 그 시점부터 새로 시작해야 한다.
 */
export async function refreshListing(
  id: string,
  ownerEmail: string,
): Promise<{ ok: boolean; refreshedAt: string | null }> {
  const sb = getServiceSupabase();
  if (!sb || !id || !ownerEmail) return { ok: false, refreshedAt: null };
  const now = new Date().toISOString();
  try {
    const { data, error } = await sb
      .from("listings")
      .update({
        refreshed_at: now,
        updated_at: now,
        stale_notified_at: null,
        stale_notice_stage: 0,
      })
      .eq("id", id)
      .eq("author_email", ownerEmail)
      .select("id")
      .maybeSingle();
    if (error || !data) return { ok: false, refreshedAt: null };
    return { ok: true, refreshedAt: now };
  } catch (e) {
    logger.warn("[listings] refreshListing", e);
    return { ok: false, refreshedAt: null };
  }
}

/**
 * I5 매물 부스트 — boost_until 을 max(현재 부스트, now) + days 로 연장(소유자 스코프).
 * 결제가 아닌 포인트 소비로 셀프서비스. 반환: 성공 시 boostUntil, 실패 시 null.
 */
export async function boostListing(
  id: string,
  ownerEmail: string,
  days: number,
): Promise<string | null> {
  const sb = getServiceSupabase();
  if (!sb || !id || !ownerEmail || days <= 0) return null;
  try {
    const { data: cur } = await sb
      .from("listings")
      .select("boost_until")
      .eq("id", id)
      .eq("author_email", ownerEmail)
      .maybeSingle();
    if (!cur) return null;
    const now = Date.now();
    const prev = cur.boost_until ? Date.parse(String(cur.boost_until)) : 0;
    const base = Number.isFinite(prev) && prev > now ? prev : now;
    const until = new Date(base + days * 86_400_000).toISOString();
    const { error } = await sb
      .from("listings")
      .update({ boost_until: until, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("author_email", ownerEmail);
    if (error) return null;
    return until;
  } catch (e) {
    logger.warn("[listings] boostListing", e);
    return null;
  }
}

/**
 * #5 신고 누적 — report_count +1, LISTING_REPORT_HIDE_THRESHOLD(3) 도달 시 is_hidden=true.
 * best-effort(원자성 미보장, 실패 무시).
 */
export async function markListingReport(
  listingId: string,
): Promise<{ ok: boolean; reportCount: number; hidden: boolean }> {
  const sb = getServiceSupabase();
  if (!sb || !listingId) return { ok: false, reportCount: 0, hidden: false };
  try {
    const { data, error } = await sb
      .from("listings")
      .select("report_count,is_hidden")
      .eq("id", listingId)
      .maybeSingle();
    /* 읽기가 실패했는데 current=0 으로 이어가면 report_count 를 1 로 덮어써
       그동안 쌓인 신고를 지운다 — best-effort 는 "실패해도 괜찮다"이지
       "실패하면 남의 데이터를 지워도 된다"가 아니다. 못 읽었으면 쓰지 않는다. */
    if (error) {
      logger.warn("[listings] markListingReport 조회 실패 — 카운터를 건드리지 않음", error);
      return { ok: false, reportCount: 0, hidden: false };
    }
    const row = (data ?? {}) as Record<string, unknown>;
    const current = row.report_count != null ? Number(row.report_count) : 0;
    const next = current + 1;
    const nowHidden = next >= LISTING_REPORT_HIDE_THRESHOLD;
    const update: Record<string, unknown> = { report_count: next };
    if (nowHidden) update.is_hidden = true;
    await sb.from("listings").update(update).eq("id", listingId);
    return { ok: true, reportCount: next, hidden: nowHidden || row.is_hidden === true };
  } catch (e) {
    logger.warn("[listings] markListingReport", e);
    return { ok: false, reportCount: 0, hidden: false };
  }
}

/** I2 매물 수정 시 갱신 가능한 필드. */
export type ListingEditPatch = Partial<{
  listingType: ListingType;
  priceKrw: number | null;
  depositKrw: number | null;
  monthlyKrw: number | null;
  areaM2: number | null;
  floor: number | null;
  description: string | null;
  contact: string | null;
}>;

/**
 * I2 매물 수정 — 소유자 본인만. 편집 가능 필드만 갱신한다.
 * 승인·반려 상태였다면 편집 내용 재검수를 위해 pending 으로 되돌리고 반려사유를 지운다
 * (라이브 매물의 가격 등이 무검수로 바뀌지 않도록 — 사실 우선/신뢰).
 * 마감·삭제된 매물은 수정 불가.
 */
export async function updateListing(
  id: string,
  ownerEmail: string,
  patch: ListingEditPatch,
): Promise<{ ok: boolean; status?: ListingStatus; error?: string }> {
  const sb = getServiceSupabase();
  if (!sb || !id || !ownerEmail) {
    return { ok: false, error: "저장소가 준비되지 않았어요." };
  }
  try {
    const { data: cur } = await sb
      .from("listings")
      .select("author_email, status, deleted_at")
      .eq("id", id)
      .maybeSingle();
    const row = (cur ?? null) as Record<string, unknown> | null;
    if (!row) return { ok: false, error: "매물을 찾을 수 없어요." };
    if (row.deleted_at != null) return { ok: false, error: "이미 삭제된 매물이에요." };
    const owner = String(row.author_email ?? "").trim().toLowerCase();
    if (!owner || owner !== ownerEmail.trim().toLowerCase()) {
      return { ok: false, error: "본인 매물만 수정할 수 있어요." };
    }
    const curStatus = String(row.status ?? "pending") as ListingStatus;
    if (curStatus === "closed") {
      return { ok: false, error: "마감된 매물은 수정할 수 없어요." };
    }

    const body: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.listingType !== undefined) body.listing_type = patch.listingType;
    if (patch.priceKrw !== undefined) body.price_krw = patch.priceKrw;
    if (patch.depositKrw !== undefined) body.deposit_krw = patch.depositKrw;
    if (patch.monthlyKrw !== undefined) body.monthly_krw = patch.monthlyKrw;
    if (patch.areaM2 !== undefined) body.area_m2 = patch.areaM2;
    if (patch.floor !== undefined) body.floor = patch.floor;
    if (patch.description !== undefined) body.description = patch.description;
    if (patch.contact !== undefined) body.contact = patch.contact;

    let nextStatus = curStatus;
    if (curStatus === "approved" || curStatus === "rejected") {
      body.status = "pending";
      body.reject_reason = null;
      nextStatus = "pending";
    }

    const { error } = await sb.from("listings").update(body).eq("id", id);
    if (error) {
      logger.warn("[listings] updateListing", error);
      return { ok: false, error: "수정에 실패했어요. 잠시 후 다시 시도해 주세요." };
    }
    return { ok: true, status: nextStatus };
  } catch (e) {
    logger.warn("[listings] updateListing", e);
    return { ok: false, error: "수정 처리 중 오류가 발생했어요." };
  }
}

/**
 * I2 매물 삭제 — 소유자 본인만. 하드 삭제 대신 deleted_at 소프트 삭제.
 * 리드·조회 이력을 보존하고 되돌릴 수 있게 한다(멱등: 이미 삭제면 ok).
 */
export async function deleteListing(
  id: string,
  ownerEmail: string,
): Promise<{ ok: boolean; error?: string }> {
  const sb = getServiceSupabase();
  if (!sb || !id || !ownerEmail) {
    return { ok: false, error: "저장소가 준비되지 않았어요." };
  }
  try {
    const { data: cur } = await sb
      .from("listings")
      .select("author_email, deleted_at")
      .eq("id", id)
      .maybeSingle();
    const row = (cur ?? null) as Record<string, unknown> | null;
    if (!row) return { ok: false, error: "매물을 찾을 수 없어요." };
    if (row.deleted_at != null) return { ok: true };
    const owner = String(row.author_email ?? "").trim().toLowerCase();
    if (!owner || owner !== ownerEmail.trim().toLowerCase()) {
      return { ok: false, error: "본인 매물만 삭제할 수 있어요." };
    }
    const now = new Date().toISOString();
    const { error } = await sb
      .from("listings")
      .update({ deleted_at: now, updated_at: now })
      .eq("id", id);
    if (error) {
      logger.warn("[listings] deleteListing", error);
      return { ok: false, error: "삭제에 실패했어요. 잠시 후 다시 시도해 주세요." };
    }
    return { ok: true };
  } catch (e) {
    logger.warn("[listings] deleteListing", e);
    return { ok: false, error: "삭제 처리 중 오류가 발생했어요." };
  }
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

/** 단건 조회 — 상세 페이지. 상태 무관하게 반환(공개 여부 판단은 호출부). */
export async function getListingById(id: string): Promise<ListingDetail | null> {
  const sb = getServiceSupabase();
  if (!sb || !id) return null;
  try {
    const { data, error } = await sb
      .from("listings")
      .select("*")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();
    if (error || !data) return null;
    return mapDetail(data as Record<string, unknown>);
  } catch (e) {
    logger.warn("[listings] getListingById", e);
    return null;
  }
}

/** 내 매물 — 상태 무관 전체(검수중·노출중·반려·마감). 최신순. */
export async function listMyListings(email: string): Promise<ListingDetail[]> {
  const sb = getServiceSupabase();
  if (!sb || !email) return [];
  try {
    const { data, error } = await sb
      .from("listings")
      .select("*")
      .eq("author_email", email)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error || !data) return [];
    return data.map((r) => mapDetail(r as Record<string, unknown>));
  } catch (e) {
    logger.warn("[listings] listMyListings", e);
    return [];
  }
}

/** 상세 조회수 +1 — best-effort(원자성 미보장, 실패 무시). */
export async function incrementView(id: string): Promise<void> {
  const sb = getServiceSupabase();
  if (!sb || !id) return;
  try {
    const { data, error } = await sb
      .from("listings")
      .select("view_count")
      .eq("id", id)
      .maybeSingle();
    /* 같은 이유 — 못 읽은 채 0+1 로 쓰면 누적 조회수가 1 로 리셋된다. */
    if (error) {
      logger.warn("[listings] incrementView 조회 실패 — 조회수를 건드리지 않음", error);
      return;
    }
    const current =
      data && (data as Record<string, unknown>).view_count != null
        ? Number((data as Record<string, unknown>).view_count)
        : 0;
    await sb
      .from("listings")
      .update({ view_count: current + 1 })
      .eq("id", id);
  } catch (e) {
    logger.warn("[listings] incrementView", e);
  }
}
