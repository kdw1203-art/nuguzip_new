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
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  compress: true,
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
      // Supabase Storage
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
      {
        protocol: "https",
        hostname: "*.supabase.io",
        pathname: "/storage/v1/object/public/**",
      },
      // Naver (프로필 이미지)
      { protocol: "https", hostname: "phinf.pstatic.net" },
      { protocol: "https", hostname: "ssl.pstatic.net" },
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
      // 동적 페이지 기본 캐시 정책 (정적 자산은 더 구체적인 패턴이 덮어씀)
      { key: "Cache-Control", value: "no-store" },
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
