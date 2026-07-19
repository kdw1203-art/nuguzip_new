import type { MetadataRoute } from "next";

/* 시안 20b — 색인 정책: 공개 라우트 allow, 개인 영역(/admin·/my·/messages·/notifications) disallow */

const BASE_URL = "https://nuguzip.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/my", "/messages", "/notifications"],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
    host: BASE_URL,
  };
}
