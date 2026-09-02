import type { MetadataRoute } from "next";
import { SITEMAP_PATHS } from "@/lib/seo/sitemap-slugs";

/**
 * 색인 정책 — 공개 라우트 allow, 개인 영역 disallow.
 *
 * ── G6 에서 넓힌 이유 ──────────────────────────────────────────
 * 기존 목록은 /admin·/my·/messages·/notifications 넷뿐이었다. 그 사이 개인 영역이
 * 늘었는데(/points 잔액·/invite 초대링크·/welcome 온보딩·/payment 결제결과·비밀번호
 * 재설정) robots 는 그대로였다. 색인돼도 로그인 없이는 내용이 안 보이지만, 검색결과에
 * "빈 로그인 페이지"만 잔뜩 뜨는 건 사이트 품질 신호를 깎는다.
 *
 * ── 일부러 막지 않은 것 ────────────────────────────────────────
 * - /login·/signup: 사이트맵에도 있는 정상 공개 페이지다. 캐시 정책상으로는
 *   "개인 취급"이지만(공유 캐시 금지), 색인은 막을 이유가 없다.
 * - /api/og/*: OG 카드 이미지 생성 엔드포인트. 카카오·페이스북 등 공유 크롤러가
 *   robots 를 따르므로 여기까지 막으면 공유 썸네일이 통째로 깨진다.
 *   그래서 /api 는 막되 /api/og/ 만 되살린다(더 긴 규칙 우선).
 * - /points/shop: 비로그인에게도 상품 목록을 보여주는 공개 페이지라 색인 대상이다.
 *   /points(잔액·내역)만 막고 /shop 은 예외로 연다.
 */

import { DEFAULT_DESKTOP_ORIGIN } from "@/lib/platform-shell";

const BASE_URL = DEFAULT_DESKTOP_ORIGIN; /* [947] 도메인 단일 소스 */

/** 단일 출처: lib/security/blocked-crawlers.ts (미들웨어 403 목록과 같은 표) */
import { BLOCKED_CRAWLERS } from "@/lib/security/blocked-crawlers";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/api/og/", "/points/shop"],
        disallow: [
          // 로그인해야 의미가 있는 개인 영역
          "/admin",
          "/my",
          "/messages",
          "/notifications",
          "/points",
          // 개인 토큰·1회성 흐름 — 색인될 이유가 없다
          "/invite",
          "/welcome",
          "/payment",
          "/reset-password",
          "/forgot-password",
          // noIndex 데모·시뮬레이션 (사이트맵에서도 제외)
          "/analysis/price",
          "/analysis/scenario",
          "/analysis/cycle",
          "/analysis/portfolio",
          "/analysis/switch",
          // 기계용 엔드포인트 (OG 이미지는 위 allow 로 예외)
          "/api",
          // bot-only waste paths (31.8% of RUM, no index value)
          "/notes/new",
          "/widget",
        ],
      },
      /* [#57, 2026-08-23 소유자 승인] AI 크롤러 개방 — llms.txt 로 "읽어가라"고
         해 놓고 robots 로 전면 차단하던 모순(WO-H)의 해소. AI 검색(ChatGPT·
         Claude·Perplexity)에서 인용되는 것이 GEO 전략의 목적이므로, 공개 콘텐츠는
         열고 개인 영역만 * 와 같은 기준으로 막는다.
         meta-externalagent 만 전면 차단 유지 — 검색 인용이 아니라 학습 전용
         크롤러인데 단독으로 RUM 27% 를 차지한 실측 낭비가 있어서다. */
      { userAgent: "meta-externalagent", disallow: "/" },
      /* [950 · 운영 필수 11] 트래픽을 보내지 않는 SEO 도구·스크레이퍼 크롤러 전면 차단.
         단지 페이지가 하루 6천 회 넘게 함수로 렌더되는데(ISR 미스), 이런 봇은 색인
         유입이 없다. 검색엔진(Google·Naver·Bing·Daum)과 AI 검색 봇은 위 규칙대로 연다.
         robots 를 무시하는 것(Bytespider 등)은 middleware.ts 가 엣지에서 403 으로 막는다. */
      ...BLOCKED_CRAWLERS.map((userAgent) => ({ userAgent, disallow: "/" })),
      ...["GPTBot", "OAI-SearchBot", "ClaudeBot", "CCBot", "PerplexityBot", "Google-Extended"].map(
        (userAgent) => ({
          userAgent,
          allow: ["/", "/api/og/"],
          disallow: ["/admin", "/my", "/messages", "/notifications", "/points", "/invite", "/welcome", "/payment", "/api"],
        }),
      ),
    ],
    /* N4 — 인덱스 + 자식 전부를 적는다.
       인덱스 하나만 적어도 규격상 충분하지만, 실제로는 사이트맵 인덱스 처리가
       크롤러마다 고르지 않다. 여러 줄로 적는 건 표준이 허용하는 형태이고 비용이
       0 이라, 인덱스를 못 펴는 크롤러도 자식을 직접 집어 가게 둔다. */
    sitemap: SITEMAP_PATHS.map((p) => `${BASE_URL}${p}`),
    host: BASE_URL,
  };
}
