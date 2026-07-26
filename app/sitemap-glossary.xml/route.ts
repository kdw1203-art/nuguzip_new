import { sitemapSectionRoute } from "@/lib/seo/sitemap-sections";

/* N4 — /sitemap.xml 인덱스가 가리키는 자식 사이트맵. 내용·정책은
   lib/seo/sitemap-sections.ts 한 곳에 모아 두고 여기서는 위임만 한다.
   (Next 앱 라우터는 sitemap-[유형].xml 같은 부분 동적 세그먼트를 지원하지 않아
   유형마다 파일이 하나씩 필요하다.) */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = sitemapSectionRoute("glossary");
