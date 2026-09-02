/**
 * 전역 구조화 데이터 (S16/G16) — Organization + WebSite JSON-LD.
 *
 * 값은 전부 단일 출처에서 읽는다: 브랜드명은 lib/seo/page-metadata 의 SITE_NAME,
 * 법적 표기는 lib/brand/business-info 의 getBusinessInfo(). 여기 문자열을
 * 새로 적지 않는다 — og:siteName 이 두 값으로 갈렸던 사고의 재발 방지.
 *
 * 서버 컴포넌트 + 정적 값만 사용 — layout 의 "데이터 페칭 0" 원칙(G5 프리렌더
 * 전략)을 깨지 않는다.
 */
import { getBusinessInfo } from "@/lib/brand/business-info";
import { SITE_NAME, SITE_DEFAULT } from "@/lib/seo/page-metadata";
/* 직렬화는 jsonLdScript 로 통일한다 — `<` 를 이스케이프하지 않으면 값 하나만 사용자/환경변수
   기원이 되는 날 </script> 로 문서를 빠져나간다. 전역 컴포넌트라 모든 페이지가 같이 뚫린다. */
import { jsonLdScript } from "@/lib/seo/jsonld";

const BASE_URL = "https://naezipnow.com";

export function SiteJsonLd() {
  const biz = getBusinessInfo();

  const organization = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${BASE_URL}/#organization`,
    name: SITE_NAME,
    legalName: biz.legalName,
    url: BASE_URL,
    logo: `${BASE_URL}/icons/icon-192.png`,
    email: biz.supportEmail,
    description: SITE_DEFAULT.description,
  };

  const website = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${BASE_URL}/#website`,
    name: SITE_NAME,
    url: BASE_URL,
    inLanguage: "ko-KR",
    publisher: { "@id": `${BASE_URL}/#organization` },
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: `${BASE_URL}/search?q={query}` },
      "query-input": "required name=query",
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(organization) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(website) }}
      />
    </>
  );
}
