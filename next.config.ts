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
/**
 * NEXT_PUBLIC_SUPABASE_URL 에서 이 프로젝트의 스토리지 호스트만 뽑아 remotePatterns 로.
 * 값이 없거나 파싱이 안 되면 개발에서만 종전 와일드카드로 되돌리고, 프로덕션에서는
 * 아무 호스트도 허용하지 않는다 — 이미지가 안 뜨는 쪽이 오픈 프록시보다 낫다.
 */
function supabaseImagePatterns() {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  /* `/object/public/**` 만 열면 비공개 버킷의 서명 URL(`/object/sign/**`)이 막힌다.
     이 프로젝트의 버킷은 전부 비공개라 서명 URL 쪽이 정상 경로다. 그래서 경로는
     `/object/**` 로 넓히되, **호스트는 우리 프로젝트 하나로 묶어 둔다** — 경로만
     넓히고 호스트가 `**.supabase.co` 로 남으면 오픈 프록시는 그대로다. */
  const storageObjects = "/storage/v1/object/**";
  if (raw) {
    try {
      const { hostname } = new URL(raw);
      return [{ protocol: "https" as const, hostname, pathname: storageObjects }];
    } catch {
      // 아래 폴백으로.
    }
  }
  if (process.env.NODE_ENV === "production") return [];
  return [
    { protocol: "https" as const, hostname: "**.supabase.co", pathname: storageObjects },
    { protocol: "https" as const, hostname: "**.supabase.io", pathname: storageObjects },
  ];
}

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
      /* Supabase Storage — **우리 프로젝트 호스트 하나**로 고정한다.
         `**.supabase.co` 는 세상의 모든 Supabase 프로젝트를 뜻해서, /_next/image 가
         아무 버킷의 파일이나 우리 도메인 이름으로 대신 받아 주는 오픈 프록시가 된다
         (대역폭도 우리가 낸다). 호스트는 NEXT_PUBLIC_SUPABASE_URL 에서 뽑는다. */
      ...supabaseImagePatterns(),
      // Naver 정적 리소스/프로필 (phinf·ssl·map 등 모든 pstatic 서브도메인)
      { protocol: "https" as const, hostname: "**.pstatic.net", pathname: "/**" },
      // Google (프로필 이미지)
      {
        protocol: "https" as const,
        hostname: "lh3.googleusercontent.com",
        pathname: "/**",
      },
      // 일반 CDN / 공공 이미지 허용
      {
        protocol: "https" as const,
        hostname: "images.unsplash.com",
        pathname: "/**",
      },
      /* 아바타만 쓴다 — githubusercontent 는 사용자가 올린 임의 파일도 서빙하는
         호스트라 경로를 열어 두면 그쪽 전체가 우리 이미지 프록시 뒤에 붙는다. */
      {
        protocol: "https" as const,
        hostname: "avatars.githubusercontent.com",
        pathname: "/u/**",
      },
      // 로컬 개발 — 프로덕션 설정에 실어 보내지 않는다.
      ...(process.env.NODE_ENV === "production"
        ? []
        : [{ protocol: "http" as const, hostname: "localhost" }]),
    ],
    formats: ["image/avif", "image/webp"],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    minimumCacheTTL: 60 * 60 * 24 * 7, // 7일 — 외부 이미지 재요청 비용 절감
    /* SVG 는 최적화기가 그대로 흘려보내는 포맷이고 <script> 를 품을 수 있다.
       기본값이 이미 false 지만, 나중에 누가 켤 때 이 주석을 먼저 읽게 명시해 둔다.
       attachment 는 혹시 새는 파일이 브라우저에서 문서로 렌더되지 않게 하는 안전망. */
    dangerouslyAllowSVG: false,
    contentDispositionType: "attachment",
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
      /* 크로스오리진 격리. `same-origin` 이 아니라 `same-origin-allow-popups` 인 이유는
         구글·네이버·카카오 OAuth 가 팝업으로 뜨고 opener 로 결과를 돌려주기 때문 —
         `same-origin` 이면 그 연결이 끊겨 소셜 로그인이 통째로 깨진다. */
      { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
      /* 우리 응답을 남의 문서가 <img>/<script> 로 끌어다 쓰지 못하게 한다.
         same-site 로 둬야 서브도메인(og 이미지 등) 사용이 유지된다. */
      { key: "Cross-Origin-Resource-Policy", value: "same-site" },
      // 이 origin 을 별도 프로세스로 — 같은 사이트의 다른 origin 과 힙을 나눈다.
      { key: "Origin-Agent-Cluster", value: "?1" },
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
