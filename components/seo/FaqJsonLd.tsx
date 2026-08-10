/**
 * FAQPage JSON-LD
 * ---------------------------------------------------------------------------
 * 왜 이게 우선순위가 높은가:
 *   - 네이버가 국내 검색의 64.28% 를 쥐고 있지만, 일반 검색에서
 *     외부 웹사이트가 가져가는 몫은 9.5% 뿐이다.
 *   - 그런데 네이버 AI 브리핑 인용에서는 외부 웹사이트가 16.5% 를 차지하고,
 *     인용의 49.3% 가 검색 Top10 밖에서 나온다.
 *   - 특히 정보성 키워드는 Top10 중첩률이 28.6% 에 불과하다.
 *   → 도메인 파워가 없는 신규 사이트가 노출을 얻는 사실상 유일한 통로.
 *   → FAQ 스키마가 그 통로에서 가장 효과가 큰 신호로 보고되어 있다.
 *
 * 사용 규칙 (이거 안 지키면 스키마만 넣어도 소용없음):
 *   1. 첫 문단에 질문의 직답을 배치한다. 배경 설명은 뒤로.
 *   2. 화면에 실제로 보이는 Q&A 와 스키마 내용이 일치해야 한다.
 *      (보이지 않는 내용을 스키마에만 넣으면 구조화 데이터 정책 위반)
 *   3. datePublished / dateModified 를 함께 노출한다. 신선도 가중이 크다.
 */

export type FaqItem = { q: string; a: string }

export function FaqJsonLd({ items }: { items: FaqItem[] }) {
  if (!items?.length) return null

  const json = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((i) => ({
      '@type': 'Question',
      name: i.q,
      acceptedAnswer: { '@type': 'Answer', text: i.a },
    })),
  }

  return (
    <script
      type="application/ld+json"
      // JSON.stringify 결과에 </script> 가 섞이지 않도록 이스케이프
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(json).replace(/</g, '\\u003c'),
      }}
    />
  )
}

/**
 * 정보성 페이지용 Article JSON-LD.
 * dateModified 를 반드시 실제 갱신 시각으로 채울 것 — 신선도 신호의 핵심.
 */
export function ArticleJsonLd(props: {
  headline: string
  description: string
  url: string
  datePublished: string // ISO
  dateModified: string  // ISO
}) {
  const json = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: props.headline,
    description: props.description,
    mainEntityOfPage: { '@type': 'WebPage', '@id': props.url },
    datePublished: props.datePublished,
    dateModified: props.dateModified,
    author: { '@type': 'Organization', name: '누구집', url: 'https://nuguzip.com' },
    publisher: {
      '@type': 'Organization',
      name: '누구집',
      url: 'https://nuguzip.com',
    },
  }
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(json).replace(/</g, '\\u003c'),
      }}
    />
  )
}
