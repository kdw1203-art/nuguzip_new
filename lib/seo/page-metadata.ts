import type { Metadata } from "next";
import { seoAlternates } from "@/lib/seo/alternates";

/**
 * 검색·SNS 에 노출되는 **브랜드명**. 법인/서비스 등록명과 다르다.
 *
 * 원래 여기가 "우리동네이야기" 였는데, 같은 사이트의 og:siteName 이 두 값으로
 * 갈려 있었다 — app/layout.tsx 는 "내집나우", 이 헬퍼를 쓰는 페이지는
 * "우리동네이야기". 같은 속성에 두 값이 나가면 검색엔진 입장에서 브랜드 신호가
 * 쪼개진다. 도메인(nuguzip.com) · manifest(short_name "내집나우") ·
 * apple-mobile-web-app-title · 루트 레이아웃이 모두 "내집나우" 이므로 이쪽으로 맞췄다.
 *
 * 약관·개인정보처리방침 본문과 결제 항목명에 쓰이는 **등록 서비스명**은 그대로
 * "우리동네이야기" 이고, 그 값의 단일 출처는 lib/brand/business-info.ts 의
 * getBusinessInfo().serviceName 이다. 여기에 상수로 한 벌 더 두지 않는다 —
 * 애초에 이 버그가 같은 문자열을 두 곳에 적어서 난 것이라, 법적 표기까지
 * 두 벌로 만들면 같은 실수를 반복하게 된다.
 */
export const SITE_NAME = "내집나우";

export const SITE_DEFAULT = {
  /* 브랜드 포지션(전략 정본 §6) — 루트 레이아웃 타이틀과 같은 문장을 쓴다 */
  title: "내집나우 | 시세는 누구나 봅니다, 현장은 가 본 사람만 압니다",
  description:
    "지도·시세·임장노트·동네 커뮤니티를 한 곳에서. 살고 싶은 곳을 기록하고 비교하세요.",
} as const;

type PageMetaInput = {
  /** 페이지 고유 제목. `| 내집나우`(SITE_NAME)은 자동 부착 — 이미 포함 시 생략. */
  title: string;
  description: string;
  path?: string;
  noIndex?: boolean;
  /** [개선 #4] 동적 공유 카드(/api/og) — 지정하면 기본 정적 카드 대신 제목이
      박힌 카드를 만든다. badge 는 카드 우상단 칩(예: "계산기"). */
  og?: { badge?: string; sub?: string };
};

/** 공개 페이지 title/description/OG/Twitter 일관 생성 */
export function buildPageMetadata(input: PageMetaInput): Metadata {
  const title = input.title.includes(SITE_NAME)
    ? input.title
    : `${input.title} | ${SITE_NAME}`;

  // G6: canonical 뿐 아니라 hreflang(ko-KR·x-default)까지 한 곳에서 만든다.
  const alternates = input.path ? seoAlternates(input.path) : undefined;
  const canonical = alternates?.canonical as string | undefined;

  /* [개선 #4] og 옵션이 있으면 제목이 박힌 동적 카드(/api/og), 없으면 기본 정적 카드 */
  const ogImage = input.og
    ? `/api/og?${new URLSearchParams({
        title: input.title,
        ...(input.og.sub ? { sub: input.og.sub } : {}),
        ...(input.og.badge ? { badge: input.og.badge } : {}),
      }).toString()}`
    : "/og-image";

  return {
    title,
    description: input.description,
    ...(alternates ? { alternates } : {}),
    openGraph: {
      siteName: SITE_NAME,
      title,
      description: input.description,
      type: "website",
      locale: "ko_KR",
      ...(canonical ? { url: canonical } : {}),
      // S4 — 기본 공유 카드. 단지·노트 등 전용 카드가 있는 페이지는 개별 metadata 로 덮어쓴다.
      images: [{ url: ogImage, width: 1200, height: 630, alt: SITE_NAME }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: input.description,
      images: [ogImage],
    },
    ...(input.noIndex
      ? { robots: { index: false, follow: false } }
      : {}),
  };
}
