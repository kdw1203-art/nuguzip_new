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
  /** 시/도 — 예: "서울" */
  addressRegion?: string | null;
  /** 시군구·읍면동 — 예: "송파구", "잠실동" */
  addressLocality?: string | null;
}): Record<string, unknown> | undefined {
  const street = input.streetAddress?.trim() || undefined;
  const region = input.addressRegion?.trim() || undefined;
  const locality = input.addressLocality?.trim() || undefined;
  if (!street && !region && !locality) return undefined;
  return compact({
    "@type": "PostalAddress",
    addressCountry: "KR",
    addressRegion: region,
    addressLocality: locality,
    streetAddress: street,
  });
}

/** 실좌표가 있을 때만 GeoCoordinates. 0,0(미지오코딩 기본값)은 좌표 없음으로 본다. */
function geoCoordinates(
  lat?: number | null,
  lng?: number | null,
): Record<string, unknown> | undefined {
  if (typeof lat !== "number" || typeof lng !== "number") return undefined;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
  if (lat === 0 && lng === 0) return undefined;
  return { "@type": "GeoCoordinates", latitude: lat, longitude: lng };
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
  /** 읍면동 — 예: "잠실동". 없으면 생략(추정하지 않는다). */
  locality?: string | null;
  /** 지오코딩된 실좌표. 없으면 geo 자체를 넣지 않는다. */
  lat?: number | null;
  lng?: number | null;
  /** 총 세대수 — 공공데이터에 있을 때만 */
  households?: number | null;
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
      addressLocality: input.locality,
    }),
    geo: geoCoordinates(input.lat, input.lng),
    numberOfAccommodationUnits:
      typeof input.households === "number" && input.households > 0
        ? { "@type": "QuantitativeValue", value: input.households }
        : undefined,
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
  /** 상위 시/도 — 예: 지역이 "송파구"면 "서울". 없으면 지역명 자체를 시/도로 둔다. */
  parentRegion?: string | null;
}): Record<string, unknown> {
  const url = `${BASE_URL}/region/${input.id}`;
  const parent = input.parentRegion?.trim() || undefined;
  const obj: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Place",
    "@id": url,
    url,
    name: input.name,
    description: input.description?.trim() || undefined,
    // 상위 시/도를 알면 addressRegion=시/도 + addressLocality=구 로 나눠 적는다.
    // 모르면 지역명 하나만 addressRegion 으로 둔다(없는 상위 지역을 지어내지 않는다).
    address: parent
      ? postalAddress({ addressRegion: parent, addressLocality: input.name })
      : postalAddress({ addressRegion: input.name }),
  };
  return compact(obj);
}

/* ---------- BreadcrumbList ---------- */

/**
 * BreadcrumbList JSON-LD.
 *
 * ⚠️ url 없는 중간 항목은 **버린다**. 구글은 마지막 요소를 뺀 모든 ListItem 에
 * item(URL)을 요구하고, 없으면 심각 오류로 그 페이지의 탐색경로를 통째로
 * 무시한다. 2026-07-27 Search Console 경고가 정확히 이것이었다 —
 * "'item' 입력란이 누락되었습니다(경로: 'itemListElement')".
 *
 * 원인은 호출부에서 목적지 없는 라벨을 크럼으로 넣은 것이었다:
 *   /complex/[id] → { name: v.dong }        (동 이름, 해당 페이지 없음)
 *   /region/[id]  → { name: "지역 시세" }   (지역 목록 페이지 없음)
 * 둘 다 2만 5천여 개 단지 페이지와 지역 페이지에 깔려 있었다.
 *
 * 왜 호출부만 고치지 않고 여기서 막는가: 이 두 라우트는 ISR 동적 페이지라
 * 빌드 산출물에 HTML 이 없고, 그래서 check-jsonld 게이트가 볼 수 없다
 * (스크립트 상단에 명시된 사각지대). 게이트가 못 잡는 자리는 자료구조가
 * 대신 막아야 한다 — 링크 없는 단계는 애초에 탐색경로의 단계가 아니다.
 *
 * position 은 걸러낸 뒤 1부터 다시 매긴다(구글은 연속된 번호를 요구한다).
 */
export function breadcrumbJsonLd(
  items: Array<{ name: string; url?: string }>,
): Record<string, unknown> {
  const navigable = items.filter(
    (it, i) => i === items.length - 1 || Boolean(it.url?.trim()),
  );
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: navigable.map((it, i) =>
      compact({
        "@type": "ListItem",
        position: i + 1,
        name: it.name,
        item: it.url ? absoluteUrl(it.url) : undefined,
      }),
    ),
  };
}

/* ---------- FAQPage (G13/S19 — Q&A 블록과 반드시 같은 배열에서 생성) ---------- */

export type FaqItem = { q: string; a: string };

/**
 * FAQPage JSON-LD. 규칙: 화면에 실제로 보이는 Q&A 와 같은 items 배열로만 만든다 —
 * 화면에 없는 질문을 스키마에만 넣는 것은 구글 정책 위반이자 허위 표기다.
 */
export function faqJsonLd(items: FaqItem[]): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((it) => ({
      "@type": "Question",
      name: it.q,
      acceptedAnswer: { "@type": "Answer", text: it.a },
    })),
  };
}

/** JSON-LD 객체 → 안전한 <script> 문자열 (XSS 차단: < 이스케이프) */
export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
