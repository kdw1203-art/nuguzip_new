/**
 * Content-Security-Policy — next.config headers + middleware 공용.
 * 한곳에서만 정의해 배포·엣지·브라우저 간 불일치를 줄인다.
 */
export function buildContentSecurityPolicy(isDev: boolean): string {
  const naverMapScript =
    "https://oapi.map.naver.com https://*.pstatic.net blob:";
  const naverMapConnect =
    "https://oapi.map.naver.com https://openapi.map.naver.com https://*.map.naver.net wss://*.map.naver.net https://*.map.naver.com https://map.pstatic.net https://*.pstatic.net https://kr-col-ext.ncloudstorage.com https://ncp-maps.map.naver.com https://kr-col-ext.nelo.navercorp.com https://*.nelo.navercorp.com https://*.navercorp.com";
  const vercelLive = "https://vercel.live https://*.vercel.live wss://*.vercel.live";
  const googleAdsScript =
    "https://www.googletagmanager.com https://pagead2.googlesyndication.com https://*.googlesyndication.com https://www.gstatic.com https://www.google.com";
  const googleAdsConnect =
    "https://*.googlesyndication.com https://*.doubleclick.net https://www.google.com https://www.gstatic.com";
  const googleAdsFrame =
    "https://googleads.g.doubleclick.net https://*.googlesyndication.com https://tpc.googlesyndication.com";

  return [
    "default-src 'self'",
    isDev
      ? `script-src 'self' 'unsafe-eval' 'unsafe-inline' ${naverMapScript} https://cdn.toss.im https://*.vercel-scripts.com https://va.vercel-scripts.com ${vercelLive}`
      : `script-src 'self' 'unsafe-inline' ${naverMapScript} https://cdn.toss.im https://*.vercel-scripts.com https://va.vercel-scripts.com ${vercelLive} ${googleAdsScript}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net",
    `font-src 'self' https://fonts.gstatic.com https://cdn.jsdelivr.net ${vercelLive}`,
    "img-src 'self' data: blob: https: http:",
    `connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.openai.com ${naverMapConnect} https://maps.apigw.ntruss.com https://naveropenapi.apigw.ntruss.com https://sens.apigw.ntruss.com https://nid.naver.com http://openapi.seoul.go.kr:8088 https://openapi.seoul.go.kr https://cdn.toss.im https://*.cert.toss.im https://*.vercel-insights.com https://vitals.vercel-insights.com ${vercelLive} https://www.google-analytics.com https://*.google-analytics.com https://analytics.google.com https://stats.g.doubleclick.net https://accounts.google.com ${googleAdsConnect}`,
    "worker-src 'self' blob:",
    "child-src 'self' blob:",
    `frame-src 'self' https://www.openstreetmap.org https://*.openstreetmap.org ${vercelLive} ${googleAdsFrame}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    // frame-ancestors는 X-Frame-Options보다 우선하며 더 정확하다
    "frame-ancestors 'self'",
    "upgrade-insecure-requests",
  ].join("; ");
}
