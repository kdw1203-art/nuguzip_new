import type { Metadata } from "next";
import { DEFAULT_DESKTOP_ORIGIN } from "@/lib/platform-shell";

export const SITE_NAME = "우리동네이야기";

export const SITE_DEFAULT = {
  title: "우리동네이야기 | 살고 싶은 동네 이야기",
  description:
    "지도·시세·임장노트·AI 분석·동네 커뮤니티를 한 곳에서. 살고 싶은 곳을 기록하고 비교하세요.",
} as const;

type PageMetaInput = {
  /** 페이지 고유 제목. `| 우리동네이야기` 는 자동 부착(이미 포함 시 생략). */
  title: string;
  description: string;
  path?: string;
  noIndex?: boolean;
};

/** 공개 페이지 title/description/OG/Twitter 일관 생성 */
export function buildPageMetadata(input: PageMetaInput): Metadata {
  const title = input.title.includes(SITE_NAME)
    ? input.title
    : `${input.title} | ${SITE_NAME}`;

  const origin = DEFAULT_DESKTOP_ORIGIN.replace(/\/$/, "");
  const canonical = input.path ? `${origin}${input.path.startsWith("/") ? input.path : `/${input.path}`}` : undefined;

  return {
    title,
    description: input.description,
    ...(canonical ? { alternates: { canonical } } : {}),
    openGraph: {
      siteName: SITE_NAME,
      title,
      description: input.description,
      type: "website",
      locale: "ko_KR",
      ...(canonical ? { url: canonical } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: input.description,
    },
    ...(input.noIndex
      ? { robots: { index: false, follow: false } }
      : {}),
  };
}
