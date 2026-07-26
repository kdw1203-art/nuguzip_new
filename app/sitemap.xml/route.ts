import { buildSitemapIndex } from "@/lib/seo/sitemap-sections";
import { CRAWLER_ENDPOINT_CACHE_CONTROL } from "@/lib/http/cache-policy";

/**
 * /sitemap.xml — **사이트맵 인덱스** (N4 이후).
 *
 * 예전에는 여기서 5,600여 개 URL 을 한 파일로 냈다. 지금은 유형별 자식
 * 사이트맵(/sitemap-pages.xml, /sitemap-complexes.xml …)을 가리키는 인덱스다.
 * 왜 쪼갰는지, 왜 인덱스에 lastmod 를 안 적는지는 lib/seo/sitemap-sections.ts
 * 상단 주석에 적었다.
 *
 * 서치콘솔·서치어드바이저에는 이 URL 하나만 제출하면 된다 — 인덱스를 제출하면
 * 자식이 따라 잡히고, 색인 보고서는 자식별로 따로 나온다(그게 분할의 목적이다).
 *
 * 왜 메타데이터 규약(app/sitemap.ts)이 아닌가는 lib/seo/build-sitemap.ts 상단
 * 주석에 실측 근거와 함께 적었다. 요약하면:
 *   - force-dynamic: 캐시 헤더가 Next 에 덮여 크롤마다 980KB 를 새로 만들었다.
 *   - revalidate: 생성이 빌드 타임으로 가서 서비스 롤 키가 없어 URL 5,615 → 403.
 * 라우트 핸들러는 런타임 생성(데이터 온전) + 헤더 직접 지정(캐시 실제 적용)이라
 * 두 문제를 동시에 없앤다.
 *
 * Cache-Control 은 미들웨어의 크롤러 분기와 같은 값을 쓴다. 여기서도 직접 싣는
 * 이유는 두 겹으로 막기 위해서다 — 미들웨어 값이 덮이는 일이 실제로 있었다.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const { xml, cacheable } = await buildSitemapIndex();
  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      // 비어 있으면 안 되는 유형이 비었을 때는 그 상태를 한 시간 굳히지 않는다.
      "Cache-Control": cacheable ? CRAWLER_ENDPOINT_CACHE_CONTROL : "no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
