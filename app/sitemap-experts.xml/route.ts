import { sitemapSectionRoute } from "@/lib/seo/sitemap-sections";

/* [개선 #3] 인증 전문가 프로필 사이트맵. 내용·정책은 lib/seo/sitemap-sections.ts
   한 곳에 모아 두고 여기서는 위임만 한다. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = sitemapSectionRoute("experts");
