import { buildSitemap, serializeSitemap } from "@/lib/seo/build-sitemap";
import { CRAWLER_ENDPOINT_CACHE_CONTROL } from "@/lib/http/cache-policy";

/**
 * /sitemap.xml — 라우트 핸들러.
 *
 * 왜 메타데이터 규약(app/sitemap.ts)이 아닌가는 lib/seo/build-sitemap.ts 상단
 * 주석에 실측 근거와 함께 적었다. 요약하면:
 *   - force-dynamic: 캐시 헤더가 Next 에 덮여 크롤마다 980KB 를 새로 만들었다.
 *   - revalidate: 생성이 빌드 타임으로 가서 서비스 롤 키가 없어 URL 5,615 → 403.
 * 라우트 핸들러는 런타임 생성(데이터 온전) + 헤더 직접 지정(캐시 실제 적용)이라
 * 두 문제를 동시에 없앤다.
 *
 * Cache-Control 은 미들웨어의 크롤러 분기와 같은 값을 쓴다. 여기서도 직접 실는
 * 이유는 두 겹으로 막기 위해서다 — 미들웨어 값이 덮이는 일이 실제로 있었다.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const { entries } = await buildSitemap();
  return new Response(serializeSitemap(entries), {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": CRAWLER_ENDPOINT_CACHE_CONTROL,
      "X-Robots-Tag": "noindex",
    },
  });
}
