import type { Metadata } from "next";

type RegionSeoInput = {
  city?: string;
  district?: string;
  title?: string;
  description?: string;
};

/** 지역·단지 롱테일 SEO — 얇은 자동생성 페이지 억제용 최소 품질 기준 */
export function buildRegionMetadata(input: RegionSeoInput): Metadata {
  const place = [input.city, input.district].filter(Boolean).join(" ").trim() || "우리동네";
  const title = input.title ?? `${place} 임장·동네 이야기 | 우리동네이야기`;
  const description =
    input.description ??
    `${place} 아파트 임장 후기, 시세 흐름, 생활 정보를 실제 방문자 기록과 AI 요약으로 확인하세요.`;
  const canonicalPath = input.district
    ? `/explore?city=${encodeURIComponent(input.city ?? "")}&district=${encodeURIComponent(input.district)}`
    : "/explore";

  return {
    title,
    description,
    alternates: { canonical: canonicalPath },
    openGraph: {
      title,
      description,
      type: "website",
    },
    robots: {
      index: Boolean(input.district && input.description && input.description.length >= 80),
      follow: true,
    },
  };
}

export function isThinAutoPage(bodyLength: number, hasUserContent: boolean): boolean {
  return bodyLength < 120 && !hasUserContent;
}
