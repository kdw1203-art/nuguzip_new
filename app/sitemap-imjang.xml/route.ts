import { sitemapSectionRoute } from "@/lib/seo/sitemap-sections";

/* N4 — /sitemap.xml 인덱스가 가리키는 자식 사이트맵 (임장 가이드).
   내용·정책은 lib/seo/sitemap-sections.ts 한 곳에 모아 두고 여기서는 위임만 한다. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = sitemapSectionRoute("imjang");
