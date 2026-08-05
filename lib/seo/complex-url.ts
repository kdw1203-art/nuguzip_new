/**
 * 단지 URL 단일 진실 공급원 (Single Source of Truth)
 * ---------------------------------------------------------------------------
 * 문제:
 *   sitemap-complexes.xml 은 /complex/<base64 인코딩 한글명> 을 제출하는데,
 *   그 페이지의 <link rel="canonical"> 은 /complex/kapt.A10027336 을 가리킨다.
 *   그리고 kapt.* URL 은 어떤 사이트맵에도 없다(0건).
 *   → 구글은 사이트맵 URL 을 "대체 페이지(중복)"로 처리하고 색인하지 않는다.
 *   → 2026-08-05 실측: 표본 120개 중 36개(30%) 불일치 = 약 7,700개 URL 영향.
 *     (scripts/audit-sitemap-canonical.mjs 로 재현 가능)
 *
 * 해결:
 *   사이트맵 생성부 · canonical 생성부 · 내부 링크가 전부 이 파일의
 *   complexPath() 하나만 호출하게 만든다. 그러면 불일치가 구조적으로 불가능해진다.
 *
 * 롤아웃은 2단계로 나눈다 (URL_STYLE):
 *   'code'  — Phase 1. 기존 canonical(kapt.*)을 그대로 표준으로 확정.
 *             URL 이 하나도 바뀌지 않으므로 리스크 0. 사이트맵만 맞춰진다.
 *             ★ 먼저 이걸로 배포해서 색인이 회복되는지 확인할 것.
 *   'slug'  — Phase 2. 한글 슬러그로 승격. 검색 노출에 유리하지만
 *             25,000개 URL 이 바뀌므로 301 리다이렉트가 반드시 함께 켜져야 한다.
 */

/** Phase 1 = 'code', Phase 2 = 'slug'. 환경변수로 무중단 전환 가능. */
export const URL_STYLE: 'code' | 'slug' =
  (process.env.NEXT_PUBLIC_COMPLEX_URL_STYLE as 'code' | 'slug') ?? 'code'

export const SITE_ORIGIN = 'https://nuguzip.com'

export type ComplexUrlInput = {
  /** K-apt 단지코드. 예: 'A10027336'. 없을 수 있음. */
  kaptCode?: string | null
  /** 기존 인코딩 ID (apartment_complexes.id). kaptCode 가 없을 때의 대체 키. */
  legacyId: string
  /** 예: '안양 만안구'. 슬러그 모드에서만 사용. */
  regionName?: string | null
  /** 예: '래미안안양메가트리아'. 슬러그 모드에서만 사용. */
  complexName?: string | null
}

/**
 * 한글을 살린 URL 슬러그.
 * 한글은 percent-encoding 되지만 브라우저·구글·네이버 SERP 에서는 디코딩되어
 * 사람이 읽을 수 있게 표시된다. base64 보다 검색 신호가 훨씬 낫다.
 */
export function toSlug(input: string): string {
  return input
    .normalize('NFC')
    .replace(/[\x00-\x1f\x7f]/g, ' ')           // 제어문자(구분자 \x01 포함) 제거
    .replace(/[^0-9A-Za-z가-힣\s-]/g, '') // 한글·영숫자·공백·하이픈만 허용
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80)
}

/**
 * 단지 페이지의 표준(canonical) 경로.
 * ★ 사이트맵 · generateMetadata · 내부 <Link> 전부 이 함수만 쓸 것.
 */
export function complexPath(c: ComplexUrlInput): string {
  // kapt 코드가 없으면 기존 ID 가 곧 표준이다 (현재도 self-canonical 로 동작 중).
  if (!c.kaptCode) return `/complex/${c.legacyId}`

  if (URL_STYLE === 'code') {
    // Phase 1: 지금 canonical 이 내보내고 있는 형태 그대로. URL 변화 없음.
    return `/complex/kapt.${c.kaptCode}`
  }

  // Phase 2: 지역-단지명-코드. 코드가 뒤에 붙어 있어 유일성이 보장되고,
  // 슬러그가 바뀌어도 parseComplexParam 이 코드만 읽으므로 깨지지 않는다.
  const parts = [c.regionName, c.complexName]
    .filter(Boolean)
    .map((s) => toSlug(String(s)))
    .filter(Boolean)

  if (parts.length === 0) return `/complex/kapt.${c.kaptCode}`
  return `/complex/${parts.join('-')}-${c.kaptCode}`
}

/** 절대 URL. 사이트맵과 canonical 양쪽에서 사용. */
export function complexUrl(c: ComplexUrlInput): string {
  return `${SITE_ORIGIN}${complexPath(c)}`
}

/**
 * URL 파라미터에서 단지를 식별한다.
 * 슬러그가 어떻게 바뀌든 끝의 kapt 코드만 신뢰하므로 링크가 썩지 않는다.
 * 지원 형태:
 *   kapt.A10027336
 *   안양-만안구-래미안안양메가트리아-A10027336
 *   7JWI7JaR...(레거시 base64)
 */
export function parseComplexParam(
  raw: string,
): { kaptCode: string; legacyId?: undefined } | { legacyId: string; kaptCode?: undefined } {
  const param = decodeURIComponent(raw)

  const dotted = param.match(/^kapt\.([A-Z]\d{6,})$/i)
  if (dotted) return { kaptCode: dotted[1].toUpperCase() }

  const trailing = param.match(/(?:^|-)([A-Z]\d{6,})$/i)
  if (trailing) return { kaptCode: trailing[1].toUpperCase() }

  return { legacyId: param }
}

/**
 * 색인 대상 판정.
 * 실거래도 없고 노트/Q&A 도 없는 "시세 준비 중" 페이지 2만 개를 그대로 제출하면
 * 크롤 예산만 태우고 사이트 전체 품질 평가를 끌어내린다(scaled content abuse).
 * 노트나 Q&A 가 붙는 순간 자동으로 색인 대상으로 승격된다.
 */
export function shouldIndexComplex(c: {
  tx_count?: number | null
  note_count?: number | null
  qna_count?: number | null
}): boolean {
  return (
    (c.tx_count ?? 0) >= 3 ||
    (c.note_count ?? 0) >= 1 ||
    (c.qna_count ?? 0) >= 1
  )
}
