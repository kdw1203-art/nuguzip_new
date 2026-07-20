/**
 * schema.org JSON-LD 빌더 — SEO 구조화 데이터 (서버/클라이언트 공용, 순수 함수).
 * 실데이터로 존재하는 필드만 채운다(허위 데이터 금지). null/undefined/빈값은 compact 로 제거.
 * 각 페이지 본문에서 <script type="application/ld+json"> 로 주입한다.
 */

const BASE_URL = "https://nuguzip.com";

/** null·undefined·빈문자열·빈객체를 재귀적으로 제거 (0·false 는 보존) */
function compact<T>(value: T): T {
  if (Array.isArray(value)) {
    return value
      .map((v) => compact(v))
      .filter((v) => v !== undefined && v !== null) as unknown as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === undefined || v === null || v === "") continue;
      const cv = compact(v);
      if (cv === undefined || cv === null || cv === "") continue;
      if (
        typeof cv === "object" &&
        !Array.isArray(cv) &&
        Object.keys(cv as Record<string, unknown>).length === 0
      ) {
        continue;
      }
      if (Array.isArray(cv) && cv.length === 0) continue;
      out[k] = cv;
    }
    return out as T;
  }
  return value;
}

function absoluteUrl(path: string): string {
  return path.startsWith("http") ? path : `${BASE_URL}${path.startsWith("/") ? "" : "/"}${path}`;
}

/* ---------- 우편 주소 ---------- */

function postalAddress(input: {
  streetAddress?: string | null;
  addressRegion?: string | null;
}): Record<string, unknown> | undefined {
  const street = input.streetAddress?.trim() || undefined;
  const region = input.addressRegion?.trim() || undefined;
  if (!street && !region) return undefined;
  return compact({
    "@type": "PostalAddress",
    addressCountry: "KR",
    addressRegion: region,
    streetAddress: street,
  });
}

/* ---------- RealEstateListing (/listings/[id]) ---------- */

export function realEstateListingJsonLd(input: {
  id: string;
  name: string;
  description?: string | null;
  priceKrw?: number | null;
  offerLabel?: string | null;
  areaM2?: number | null;
  address?: string | null;
  regionName?: string | null;
  images?: string[];
}): Record<string, unknown> {
  const url = `${BASE_URL}/listings/${input.id}`;
  const obj: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "RealEstateListing",
    "@id": url,
    url,
    name: input.name,
    description: input.description?.trim() || undefined,
    image:
      input.images && input.images.length > 0
        ? input.images.map((i) => absoluteUrl(i))
        : undefined,
    address: postalAddress({
      streetAddress: input.address,
      addressRegion: input.regionName,
    }),
    floorSize:
      input.areaM2 && input.areaM2 > 0
        ? { "@type": "QuantitativeValue", value: input.areaM2, unitCode: "MTK" }
        : undefined,
    offers:
      input.priceKrw && input.priceKrw > 0
        ? compact({
            "@type": "Offer",
            price: input.priceKrw,
            priceCurrency: "KRW",
            name: input.offerLabel?.trim() || undefined,
            availability: "https://schema.org/InStock",
          })
        : undefined,
  };
  return compact(obj);
}

/* ---------- Residence/Place + AggregateOffer (/complex/[id]) ---------- */

export function complexResidenceJsonLd(input: {
  id: string;
  name: string;
  address?: string | null;
  regionName?: string | null;
  /** 표시용 가격대(예: "8.2억") — 데이터 있을 때만 */
  priceRange?: string | null;
  /** 최근 실거래가(원) — AggregateOffer 용 */
  latestAmountKrw?: number | null;
}): Record<string, unknown> {
  const url = `${BASE_URL}/complex/${encodeURIComponent(input.id)}`;
  const obj: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "ApartmentComplex",
    "@id": url,
    url,
    name: input.name,
    address: postalAddress({
      streetAddress: input.address,
      addressRegion: input.regionName,
    }),
    priceRange: input.priceRange?.trim() || undefined,
    makesOffer:
      input.latestAmountKrw && input.latestAmountKrw > 0
        ? {
            "@type": "AggregateOffer",
            priceCurrency: "KRW",
            lowPrice: input.latestAmountKrw,
            highPrice: input.latestAmountKrw,
            offerCount: 1,
          }
        : undefined,
  };
  return compact(obj);
}

/* ---------- Place (/region/[id]) ---------- */

export function regionPlaceJsonLd(input: {
  id: string;
  name: string;
  description?: string | null;
}): Record<string, unknown> {
  const url = `${BASE_URL}/region/${input.id}`;
  const obj: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Place",
    "@id": url,
    url,
    name: input.name,
    description: input.description?.trim() || undefined,
    address: postalAddress({ addressRegion: input.name }),
  };
  return compact(obj);
}

/* ---------- BreadcrumbList ---------- */

export function breadcrumbJsonLd(
  items: Array<{ name: string; url?: string }>,
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) =>
      compact({
        "@type": "ListItem",
        position: i + 1,
        name: it.name,
        item: it.url ? absoluteUrl(it.url) : undefined,
      }),
    ),
  };
}

/** JSON-LD 객체 → 안전한 <script> 문자열 (XSS 차단: < 이스케이프) */
export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
