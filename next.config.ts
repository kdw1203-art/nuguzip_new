import type { NextConfig } from "next";
import { buildContentSecurityPolicy } from "./lib/security/content-security-policy";

/**
 * Next 설정 — 모바일·웹 최적화
 * - `optimizePackageImports`: lucide-react, recharts 등 큰 라이브러리 트리 셰이킹 강화
 * - `productionBrowserSourceMaps: false`: 배포 산출물 크기·빌드 속도 ↑
 * - `poweredByHeader: false`: 노출 정보 최소화
 * - `images`: AVIF/WebP 우선, 캐시 1년, 모바일·데스크탑 적정 사이즈
 * - 정적 자산(`/_next/static`, `/icons`, `/fonts`) immutable 캐시
 * - PWA manifest/service worker 헤더 유지
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  /**
   * 페이지 하나를 prerender 하는 데 허용하는 시간(초). 기본값은 60이다.
   *
   * 2026-07-27 배포 실패: 조회 한 건의 최악 소요(25s × 3시도 + 백오프 1.2s =
   * 76.2s)가 이 60초보다 **컸다.** 그래서 DB 가 느려졌을 때 로더가 "조회 실패"를
   * 정직하게 렌더할 기회조차 없이 페이지가 시간 초과 났고, 3회 재시도 끝에
   * `next build` 가 죽었다 — 느린 DB 가 곧 배포 장애였다.
   *
   * 지켜야 하는 부등식은 하나다:
   *   한 페이지의 직렬 조회 수 × 조회 총 예산  <  이 값
   * 조회 총 예산은 lib/newui/supabase-read.ts 에서 빌드 중 20초로 묶어 두었다.
   * 120초면 직렬 6건까지 여유가 있다. 이 값을 줄이거나 그쪽 예산을 늘릴 때는
   * 반드시 둘을 같이 본다.
   */
  staticPageGenerationTimeout: 120,
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  compress: true,
  // OG 공유 카드 한글 폰트(Pretendard 서브셋)를 각 서버리스 번들에 포함 — process.cwd() 경로로 읽음
  outputFileTracingIncludes: {
    "/api/og/note": ["./lib/og/fonts/**"],
    "/api/og/complex": ["./lib/og/fonts/**"],
    "/api/og/listing": ["./lib/og/fonts/**"],
    "/api/screenshot": ["./lib/og/fonts/**"],
    "/og-image": ["./lib/og/fonts/**"],
  },
  eslint: {
    // 빌드는 통과시키고 lint는 별도 `npm run lint` / CI에서 강제합니다.
    ignoreDuringBuilds: true,
  },
  experimental: {
    // 큰 패키지의 부분 임포트만 가져오도록 트리 셰이킹 강화 (LCP·INP 개선)
    optimizePackageImports: [
      "lucide-react",
      "recharts",
      "date-fns",
      "embla-carousel-react",
      "@radix-ui/react-accordion",
      "@radix-ui/react-collapsible",
      "@radix-ui/react-dialog",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-popover",
      "@radix-ui/react-tooltip",
    ],
    scrollRestoration: true,
  },
  images: {
    remotePatterns: [
      /* Supabase Storage (`**` — 중첩 서브도메인 포함).
         `/object/public/**` 만 열어 두면 비공개 버킷의 서명 URL
         (`/object/sign/**`)이 막힌다. 이 프로젝트의 버킷은 전부 비공개라
         서명 URL 쪽이 정상 경로다. 그래서 `/object/**` 로 넓힌다 —
         호스트는 여전히 우리 Supabase 도메인으로 묶여 있다. */
      {
        protocol: "https",
        hostname: "**.supabase.co",
        pathname: "/storage/v1/object/**",
      },
      {
        protocol: "https",
        hostname: "**.supabase.io",
        pathname: "/storage/v1/object/**",
      },
      // Naver 정적 리소스/프로필 (phinf·ssl·map 등 모든 pstatic 서브도메인)
      { protocol: "https", hostname: "**.pstatic.net" },
      // Google (프로필 이미지)
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      // 일반 CDN / 공공 이미지 허용
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "*.githubusercontent.com" },
      // 로컬 개발
      { protocol: "http", hostname: "localhost" },
    ],
    formats: ["image/avif", "image/webp"],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    minimumCacheTTL: 60 * 60 * 24 * 7, // 7일 — 외부 이미지 재요청 비용 절감
  },
  /** Cloudflare Quick Tunnel / localtunnel 등으로 모바일에서 `next dev` 접속 시 RSC 차단 완화 */
  allowedDevOrigins: [
    "127.0.0.1",
    "localhost",
    "*.trycloudflare.com",
    "*.loca.lt",
    "*.ngrok-free.app",
    "*.ngrok.io",
  ],
  async headers() {
    const isDev = process.env.NODE_ENV === "development";
    const csp = buildContentSecurityPolicy(isDev);
    const base = [
      { key: "Content-Security-Policy", value: csp },
      // X-Frame-Options 제거 — CSP frame-ancestors 'self' 로 대체 (더 정확하고 강력)
      { key: "X-Content-Type-Options", value: "nosniff" },
      /* G5: 여기 있던 전역 `Cache-Control: no-store` 를 제거했다.
         `/:path*` 에 걸려 있어서 빌드 시 prerender 해 둔 공개 페이지까지 CDN 이
         재사용하지 못했다(매 요청 오리진 왕복 = TTFB 손해).
         문서·API 응답의 캐시 정책은 미들웨어가 경로별로 판단한다:
         공개 prerender 라우트만 s-maxage 허용, 그 외는 그대로 no-store.
         (lib/http/cache-policy.ts + scripts/check-cache-policy.mjs) */
      {
        key: "Referrer-Policy",
        value: "strict-origin-when-cross-origin",
      },
      {
        key: "Permissions-Policy",
        value:
          "camera=(), microphone=(), geolocation=(self), payment=(), usb=(), interest-cohort=()",
      },
      { key: "X-DNS-Prefetch-Control", value: "on" },
    ];
    const httpsDeploy =
      process.env.AUTH_URL?.trim().startsWith("https://") ||
      Boolean(process.env.VERCEL_URL);
    const hsts = httpsDeploy
      ? [
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains; preload",
          },
        ]
      : [];

    // 정적 자산 immutable 캐시 — Next 빌드 산출물·로컬 폰트·아이콘
    const staticAssetHeaders = [
      {
        source: "/_next/static/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      {
        source: "/icons/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=2592000, immutable" },
        ],
      },
      {
        source: "/fonts/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
    ];

    const pwaHeaders = [
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-store" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/manifest.webmanifest",
        headers: [
          { key: "Content-Type", value: "application/manifest+json" },
          { key: "Cache-Control", value: "public, max-age=3600" },
        ],
      },
      {
        source: "/.well-known/assetlinks.json",
        headers: [
          { key: "Content-Type", value: "application/json" },
          { key: "Cache-Control", value: "public, max-age=3600" },
        ],
      },
    ];
    return [
      { source: "/:path*", headers: [...base, ...hsts] },
      ...staticAssetHeaders,
      ...pwaHeaders,
    ];
  },
};

export default nextConfig;
