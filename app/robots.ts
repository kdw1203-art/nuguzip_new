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

const BASE_URL = "https://nuguzip.com";

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
        ],
      },
    ],
    /* N4 — 인덱스 + 자식 전부를 적는다.
       인덱스 하나만 적어도 규격상 충분하지만, 실제로는 사이트맵 인덱스 처리가
       크롤러마다 고르지 않다. 여러 줄로 적는 건 표준이 허용하는 형태이고 비용이
       0 이라, 인덱스를 못 펴는 크롤러도 자식을 직접 집어 가게 둔다. */
    sitemap: SITEMAP_PATHS.map((p) => `${BASE_URL}${p}`),
    host: BASE_URL,
  };
}
