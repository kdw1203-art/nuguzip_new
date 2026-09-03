import { DEFAULT_DESKTOP_ORIGIN } from "@/lib/platform-shell";
import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SwRegister } from "./components/SwRegister";
import { InstallPrompt } from "./components/InstallPrompt";
import { IosInstallHint } from "./components/IosInstallHint";
import { AdSenseLoader } from "./components/AdSenseLoader";
import { getAdSenseClient } from "@/lib/ads/adsense-policy";
import { WebVitalsReporter } from "./components/WebVitalsReporter";
import { ClientErrorReporter } from "./components/ClientErrorReporter";
import { TrafficRecorder } from "./components/TrafficRecorder";
import { ThemeProvider } from "./components/ThemeProvider";
import { ThemeColorMeta } from "./components/ThemeColorMeta";
import { ToastProvider } from "./components/toast/ToastProvider";
import { SoftSignupProvider } from "./components/soft-signup/SoftSignupProvider";
import { UpgradePaywallProvider } from "./components/UpgradePaywallProvider";
import { ReferralRedeem } from "@/components/ReferralRedeem";
import { SiteJsonLd } from "./components/SiteJsonLd";
import { CookieConsentBanner } from "@/components/consent/cookie-consent-banner";
import { Ga4GtagLoader } from "@/components/ga4-gtag-loader";
import { ViewportGroupTracker } from "./components/ViewportGroupTracker";
import { MomentProvider } from "./components/motion/MomentProvider";
import { NavigationProgress } from "./components/motion/NavigationProgress";
import { PageTransition } from "./components/motion/PageTransition";
import { DragScroll } from "./components/motion/DragScroll";
import { RevealOnScroll } from "./components/motion/RevealOnScroll";
import { Analytics } from "@vercel/analytics/next";

export const metadata: Metadata = {
  metadataBase: new URL(DEFAULT_DESKTOP_ORIGIN), /* [947] 도메인 단일 소스 */
  manifest: "/manifest.webmanifest",
  /* S2·S3 — 검색엔진 소유 확인 메타태그 (2026-07-25 소유자 제공 토큰).
     구글: 정식 도메인 속성 인증은 Vercel DNS 의 TXT 레코드로 하고, 이 태그는
     URL 접두어 속성용 폴백. 네이버: 서치어드바이저 HTML 태그 방식(정식).
     검증 토큰은 공개돼도 되는 값이다(시크릿 아님). */
  /* [960] 애드센스 사이트 연결 — 구글이 허용하는 세 방식(코드 스니펫·ads.txt·메타 태그)
     을 전부 갖춘다. 스니펫은 아래 <head>, ads.txt 는 app/ads.txt/route.ts, 메타는 여기. */
  other: { "google-adsense-account": getAdSenseClient() ?? "" },
  verification: {
    google: "d4jn9bf7SyTraz2EEnn4aNIPemHwz-Bqqflre4DEuXU",
    /* [955] 네이버 토큰 2개 — 첫 값은 nuguzip.com 속성(유지), 둘째는 naezipnow.com 속성
       (2026-09-03 도메인 전환 뒤 서치어드바이저가 새로 발급). 배열이면 meta 가 두 줄 나간다. */
    other: {
      "naver-site-verification": [
        "411fe0d67e731e16c96f4994d904f6160e4927af",
        "7d0c6c7a97eea67fa4a5d6eab160e1c6131a51d9",
      ],
    },
  },
  /* 브랜드 포지션(전략 정본 §6): "임장 관리"라는 비어 있는 카테고리의 첫 이름.
     시세를 '보는' 앱이 아니라 현장에 '가는' 사람의 앱 — 문장도 그 대립을 싣는다. */
  title: "내집나우 — 시세는 누구나 봅니다, 현장은 가 본 사람만 압니다",
  description:
    "부동산 임장 관리 플랫폼 내집나우. 임장노트 3분 기록 → AI 정리 → 실거래가 지도 비교. 임장 체크리스트부터 지역 분석 리포트까지, 로그인 없이 시작하세요.",
  openGraph: {
    title: "내집나우 — 시세는 누구나 봅니다, 현장은 가 본 사람만 압니다",
    description:
      "부동산 임장 관리 플랫폼 내집나우. 임장노트 3분 기록 → AI 정리 → 실거래가 지도 비교.",
    siteName: "내집나우",
    locale: "ko_KR",
    type: "website",
    // S4 — 기본 공유 카드(/og-image). 페이지 전용 카드가 있으면 각 페이지가 덮어쓴다.
    images: [{ url: "/og-image", width: 1200, height: 630, alt: "내집나우" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#f7f9fc",
  viewportFit: "cover", // 세이프에어리어(env safe-area-inset-*) 활성화
};

/**
 * 페이지 함수 실행 상한(초) — 이 레이아웃 아래 **모든 페이지**에 적용된다.
 * (app/api 의 Route Handler 는 각자 route.ts 에서 따로 지정한다 — 35곳.)
 *
 * 2026-08-01 감사: app/api 밖에는 maxDuration 이 한 곳도 없어 모든 페이지가
 * Vercel 기본 300초를 상속했고, 최근 6주 런타임 오류 1,624건 중 802건이
 * "Task timed out after 300 seconds" 였다 — 페이지 하나가 5분씩 컴퓨트를
 * 태우고 사용자는 빈 화면을 봤다. 조회 한 건의 총 예산이 45초(supabase-read·
 * service.ts)이므로, 120초면 직렬 실패 2건 + 렌더까지 "조회 실패" 화면을
 * 정직하게 그릴 시간이 되고, 그 밖의 것은 장애다 — 5분을 태울 이유가 없다.
 */
export const maxDuration = 120;

/* 슬로건 "오래 머물 집을, 지금." + 빈 화면 문구 글자만 담은 Noto Serif KR 서브셋 CSS. */
const BRAND_SERIF_CSS =
  "https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@600&display=swap&text=%EC%98%A4%EB%9E%98%20%EB%A8%B8%EB%AC%BC%20%EC%A7%91%EC%9D%84%2C%20%EC%A7%80%EA%B8%88.%EC%95%84%EC%A7%81%20%EA%B8%B0%EB%A1%9D%EC%9D%B4%20%EC%97%86%EC%96%B4%EC%9A%94";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full antialiased" suppressHydrationWarning>
      <head>
        {/* G7 — 폰트 CDN 사전 연결.
            preconnect 없이는 DNS→TCP→TLS 세 왕복이 링크를 만난 뒤에야 시작된다.
            미리 열어 두면 그 왕복이 HTML 파싱과 겹친다. crossOrigin 은 필수 —
            폰트는 CORS 로 받으므로 이게 없으면 연결이 재사용되지 않고 따로
            하나 더 열린다.
            (이 주석은 원래 "아래 stylesheet 은 렌더 블로킹"이라고 적혀 있었다.
             아래에서 media=print→all 스왑으로 비차단으로 바꾼 뒤에도 문장이
             남아 있었다. 낡은 설명은 낡은 코드보다 위험하다 — 다음 사람이
             있지도 않은 차단을 없애려고 시간을 쓴다. 지금은 차단이 아니고,
             preconnect 가 줄이는 건 '폰트가 늦게 뜨는 시간'이다.) */}
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://cdn.jsdelivr.net" />
        {/* N3 — RSS 자동 발견. 리더·크롤러는 이 태그로 피드를 찾는다. 메타데이터
            규약(alternates.types)에 두지 않은 이유는, 페이지가 canonical 을
            지정하면 alternates 객체가 통째로 덮여 피드 링크가 사라지기 때문이다.
            여기 두면 모든 페이지에 남는다. */}
        <link
          rel="alternate"
          type="application/rss+xml"
          title="내집나우 — 실거래 리포트·임장노트"
          href={`${DEFAULT_DESKTOP_ORIGIN}/feed.xml`}
        />
        {/* LCP: Pretendard 비차단 — preload 후 media=print→all 스왑.
            첫 페인트는 시스템 폰트, 로드 후 Pretendard.

            서브셋도 이미 끝나 있다(2026-08-04 실측). 쓰는 파일은
            pretendardvariable-**dynamic-subset**.min.css 로, @font-face 92개가
            unicode-range 로 쪼개져 있어 브라우저가 **실제로 쓰인 글자 구간만**
            내려받는다. 홈 HTML 의 본문 글자를 unicode-range 에 대입해 세어 보면
            92조각 중 13조각(약 330KB)만 필요하고, /map 도 13조각(약 338KB)이다.
            비서브셋 통짜 파일은 2,009KB — 즉 서브셋으로 이미 84% 를 안 받고 있다.
            더 줄이려면 글자를 직접 골라 셀프호스팅해야 하는데, 사용자가 입력한
            단지명·지역명이 본문에 그대로 나오는 사이트라 고정 글자 집합을 만들 수
            없다. 없는 글자가 시스템 폰트로 튀는 쪽이 330KB 보다 나쁘다. */}
        <link
          rel="preload"
          as="style"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
        <link
          id="pretendard-font"
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
          media="print"
        />
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){var l=document.getElementById('pretendard-font');if(!l)return;function a(){l.media='all'}l.addEventListener('load',a);if(l.sheet)a();})();",
          }}
        />
        <noscript>
          <link
            rel="stylesheet"
            href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
          />
        </noscript>
        {/* [946] 브랜드 슬로건 세리프 — text= 파라미터로 슬로건 글자만 서브셋(수 KB).
            통짜 Noto Serif KR(수백 KB)을 문장 하나 때문에 싣지 않는다.
            [949] 946 에서는 이 링크가 **렌더 차단** stylesheet 였다 — 모든 페이지가
            첫 페인트 전에 fonts.googleapis.com 으로 DNS·TCP·TLS 를 새로 열고 CSS 를
            받아야 했다(슬로건이 없는 단지 페이지까지). 실사용 web_vitals 14일:
            /complex FCP p75 2.3s 중 TTFB 를 뺀 0.9s 가 이런 차단 자원 몫이다.
            Pretendard 와 같은 preload → media=print→all 스왑으로 비차단화하고,
            폰트 파일 호스트(gstatic)를 미리 연결한다. 슬로건은 display=swap 이라
            시스템 세리프로 먼저 그려지고 로드 후 바뀐다. */}
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="preload" as="style" href={BRAND_SERIF_CSS} />
        <link id="brand-serif-font" rel="stylesheet" href={BRAND_SERIF_CSS} media="print" />
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){var l=document.getElementById('brand-serif-font');if(!l)return;function a(){l.media='all'}l.addEventListener('load',a);if(l.sheet)a();})();",
          }}
        />
        <noscript>
          <link rel="stylesheet" href={BRAND_SERIF_CSS} />
        </noscript>
        {/* #19 PWA — iOS 홈 화면 아이콘 · 웹앱 메타
            G9: .svg → .png 로 교체했다. Safari 는 apple-touch-icon 으로 SVG 를
            받지 않는다 — 지금까지 iOS 에서 홈 화면에 추가하면 아이콘이 아니라
            페이지 스크린샷 축소판이 박혔다는 뜻이다(조용히 실패해서 티가 안 났다).
            [946 리브랜딩] 내집나우 아이콘 세트로 교체 — 180px 전용 파일 사용. */}
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16.png" />
        {/* [960] 구글 애드센스 공식 스니펫 — 소유자 제공(2026-09-03) 그대로 <head> 에.
            정적 HTML 에 있어야 애드센스 "코드 삽입" 확인과 자동 광고가 동작한다
            (예전엔 AdSenseLoader 가 세션 판정 뒤 클라이언트에서 끼워 넣어 크롤러가
            못 볼 수 있었다). 대신 광고 **요청**은 pauseAdRequests=1 로 잠근 채
            시작하고, AdSenseLoader 가 제외 경로(/payment·/my…)·광고 없는 플랜
            (pro/expert/enterprise) 판정을 마친 뒤에만 푼다 — 스크립트는 모든
            페이지에 있지만 광고는 정책이 허용하는 자리에만 나온다. */}
        <script
          dangerouslySetInnerHTML={{
            __html: "window.adsbygoogle=window.adsbygoogle||[];window.adsbygoogle.pauseAdRequests=1;",
          }}
        />
        <script
          async
          src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(getAdSenseClient() ?? "")}`}
          crossOrigin="anonymous"
        />
        {/* S16/G16 — Organization·WebSite JSON-LD (정적 값만, 데이터 페칭 없음) */}
        <SiteJsonLd />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="내집나우" />
      </head>
      <body className="min-h-full flex flex-col">
        {/* #18 a11y — 본문 바로가기 (키보드 첫 Tab). sr-only 로만 두면 포커스가
            와도 안 보여서 반쪽짜리다 — 포커스 시 화면에 나타나야 한다(고도화 47). */}
        <a
          href="#main-content"
          className="sr-only z-[100] focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:rounded-xl focus:bg-primary focus:px-4 focus:py-2.5 focus:t-body focus:font-bold focus:text-white focus:shadow-lg"
        >
          본문 바로가기
        </a>
        <ThemeProvider>
          {/* 시스템 바 색을 지금 테마에 맞춘다 — 다크로 켜면 화면만 어두워지고
              상태바는 밝은 회색으로 남아 있었다. useTheme 이 아니라 html 의
              class 를 직접 보는 방식이라(이유는 컴포넌트 주석) ThemeProvider
              안팎 어디에 둬도 동작한다. 굳이 여기 두는 건 테마와 같이 읽히게
              하려는 것뿐이다. */}
          <ThemeColorMeta />
          <ToastProvider>
            {/* 저장·로그인처럼 "성사"가 중요한 순간의 1.5초 장면. 루트에 두는
                이유는 연출 도중 화면이 바뀌어도 끊기지 않게 하기 위해서다. */}
            <MomentProvider>
              {/* A3 비로그인 액션 → 소프트 가입 프롬프트 (401 즉시 리다이렉트 대체) */}
              <SoftSignupProvider>
                {/* 402/쿼터 — SoftSignup(401)과 짝인 전역 페이월 */}
                <UpgradePaywallProvider>
                  {children}
                  {/* 이동 중 상단 진행바 · 경로 전환 페이드 · 스크롤 리빌.
                      셋 다 렌더하는 마크업이 없거나(null) 화면 위 얇은 한 줄이라
                      본문 레이아웃에는 영향을 주지 않는다. */}
                  <NavigationProgress />
                  <PageTransition />
                  <RevealOnScroll />
                  {/* 가로 스크롤 레일 마우스 드래그(문서 위임·렌더 없음) */}
                  <DragScroll />
                  {/* 친구 추천 리딤 트리거 (ref_code 쿠키 → 리딤, 렌더 없음) */}
                  <ReferralRedeem />
                  <SwRegister />
                  {/* G9 — 설치 프롬프트. 브라우저가 beforeinstallprompt 를 보낼 때만 뜬다
                      (안 오면 아무것도 렌더하지 않는다). SwRegister 바로 뒤에 둔 건
                      순서 의존이 아니라 읽는 사람 편의 — 둘 다 PWA 관련이다. */}
                  <InstallPrompt />
                  {/* iOS 사파리는 beforeinstallprompt 가 없어 위 배너가 절대 안 뜬다.
                      주소창·도구막대를 없애는 유일한 경로("공유 → 홈 화면에 추가")를
                      안내만 하는 컴포넌트를 따로 둔다. */}
                  <IosInstallHint />
                  <AdSenseLoader />
                  <WebVitalsReporter />
                  <ClientErrorReporter />
                  {/* 어드민 트래픽 대시보드용 1st-party 페이지뷰·체류 기록 —
                      GA4 와 같은 분석 동의 게이트 뒤에서만 동작한다. */}
                  <TrafficRecorder />
                  {/* S22 — 쿠키 동의 배너 + 동의 게이트 GA4 (동의 전에는 스크립트
                      로드 자체가 없다). NEXT_PUBLIC_GA4_ID 미설정 시 GA4는 무동작. */}
                  <CookieConsentBanner />
                  <Ga4GtagLoader />
                  {/* 반응형 QA — viewport_group_change 계측 (그룹 경계 통과 시에만) */}
                  <ViewportGroupTracker />
                  {/* Vercel Web Analytics — 프로덕션(Vercel 배포)에서만 수집,
                      로컬에서는 아무것도 전송하지 않는다. */}
                  <Analytics />
                </UpgradePaywallProvider>
              </SoftSignupProvider>
            </MomentProvider>
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
