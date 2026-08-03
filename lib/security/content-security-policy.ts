/**
 * Content-Security-Policy — next.config headers + middleware 공용.
 * 한곳에서만 정의해 배포·엣지·브라우저 간 불일치를 줄인다.
 */
export function buildContentSecurityPolicy(isDev: boolean): string {
  /* 카카오 JS SDK 는 **JS 키가 설정된 배포에서만** 내려받는다. 키가 없으면 SDK 를
     띄울 일 자체가 없으니 정책도 그만큼 좁게 유지한다(허용 도메인은 적을수록 좋다). */
  const kakaoSdkEnabled = Boolean(process.env.NEXT_PUBLIC_KAKAO_JS_KEY?.trim());
  const kakaoScript = kakaoSdkEnabled ? " https://t1.kakaocdn.net" : "";
  const kakaoConnect = kakaoSdkEnabled
    ? " https://kapi.kakao.com https://t1.kakaocdn.net"
    : "";

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

  /* 토스페이먼츠 결제위젯/결제창 v2 — SDK 는 js.tosspayments.com 에서 로드되고
     (cdn.toss.im 은 구 SDK 도메인), 위젯 UI·본인인증은 iframe 과 API 호출을
     쓴다. script 에 없으면 체크아웃 페이지에서 위젯 로드가 통째로 차단된다. */
  const tossScript = "https://cdn.toss.im https://js.tosspayments.com";
  const tossConnect =
    "https://cdn.toss.im https://*.cert.toss.im https://api.tosspayments.com https://event.tosspayments.com https://js.tosspayments.com";
  const tossFrame = "https://js.tosspayments.com https://*.tosspayments.com https://payment-gateway.tosspayments.com";

  return [
    "default-src 'self'",
    isDev
      ? `script-src 'self' 'unsafe-eval' 'unsafe-inline' ${naverMapScript} ${tossScript} https://*.vercel-scripts.com https://va.vercel-scripts.com ${vercelLive}${kakaoScript}`
      : `script-src 'self' 'unsafe-inline' ${naverMapScript} ${tossScript} https://*.vercel-scripts.com https://va.vercel-scripts.com ${vercelLive} ${googleAdsScript}${kakaoScript}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net",
    `font-src 'self' https://fonts.gstatic.com https://cdn.jsdelivr.net ${vercelLive}`,
    "img-src 'self' data: blob: https: http:",
    `connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.openai.com ${naverMapConnect} https://maps.apigw.ntruss.com https://naveropenapi.apigw.ntruss.com https://sens.apigw.ntruss.com https://nid.naver.com http://openapi.seoul.go.kr:8088 https://openapi.seoul.go.kr ${tossConnect} https://*.vercel-insights.com https://vitals.vercel-insights.com ${vercelLive} https://www.google-analytics.com https://*.google-analytics.com https://analytics.google.com https://stats.g.doubleclick.net https://accounts.google.com ${googleAdsConnect}${kakaoConnect}`,
    "worker-src 'self' blob:",
    "child-src 'self' blob:",
    `frame-src 'self' https://www.openstreetmap.org https://*.openstreetmap.org ${tossFrame} ${vercelLive} ${googleAdsFrame}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    // frame-ancestors는 X-Frame-Options보다 우선하며 더 정확하다
    "frame-ancestors 'self'",
    "upgrade-insecure-requests",
    /* 위반 리포트 수집 — enforce 정책은 그대로 두고 위반만 /api/security/csp-report 로 보낸다.
       report-uri 는 deprecated 지만 아직 가장 넓게 지원된다(report-to 는 Reporting-Endpoints
       헤더까지 있어야 동작해 미들웨어를 건드려야 하므로 지금은 report-uri 만 쓴다).
       목적: script-src 에서 'unsafe-inline' 을 빼기 전에 "무엇이 깨지는지"를 실측하는 것. */
    "report-uri /api/security/csp-report",
  ].join("; ");
}
