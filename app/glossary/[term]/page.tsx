import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "../../components/PageShell";
import {
  GLOSSARY_TERMS,
  findGlossaryTerm,
  type GlossaryTerm,
} from "@/lib/seo/glossary-terms";
import { breadcrumbJsonLd, jsonLdScript } from "@/lib/seo/jsonld";
import { seoAlternates } from "@/lib/seo/alternates";

/* ============================================================
   N14 — 용어 개별 페이지 (/glossary/{slug}).

   왜 개별 URL 인가: "전세가율 뜻", "전용면적이란" 같은 정의형 질의는 검색량이
   낮고 종류가 많은 전형적 롱테일이다. 이런 건 한 페이지 안의 앵커(#jeonse-ratio)
   로는 수확되지 않는다 — 검색 결과에서 앵커는 독립 문서로 취급되지 않고,
   AI 인용에서도 "그 페이지의 일부"로 뭉뚱그려진다. URL 단위로 쪼개야 각 정의가
   제목·설명·구조화 데이터를 자기 것으로 갖는다.

   전부 빌드 시 생성한다(dynamicParams = false). 용어 목록은 코드 상수라서
   런타임에 늘어날 일이 없고, 정적으로 굳혀 두면 없는 슬러그가 404 로 떨어진다 —
   사이트맵에 없는 URL 이 200 으로 응답하는 상황(얇은 페이지 양산)을 원천 차단한다.
   ============================================================ */

export const dynamicParams = false;

export function generateStaticParams(): Array<{ term: string }> {
  return GLOSSARY_TERMS.map((t) => ({ term: t.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ term: string }>;
}): Promise<Metadata> {
  const { term: slug } = await params;
  const t = findGlossaryTerm(slug);
  if (!t) {
    return { title: "부동산 용어사전 | 내집나우", robots: { index: false, follow: false } };
  }
  const title = `${t.term} 뜻 — 부동산 용어사전 | 내집나우`;
  const path = `/glossary/${t.slug}`;
  return {
    title,
    description: t.short,
    alternates: seoAlternates(path),
    openGraph: {
      title,
      description: t.short,
      url: `https://naezipnow.com${path}`,
      type: "article",
      siteName: "내집나우",
      locale: "ko_KR",
      images: [{ url: "/og-image", width: 1200, height: 630, alt: t.term }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: t.short,
      images: ["/og-image"],
    },
  };
}

/** DefinedTerm — 허브의 DefinedTermSet 에 소속시켜 둘을 한 묶음으로 인식시킨다. */
function definedTermJsonLd(t: GlossaryTerm) {
  return {
    "@context": "https://schema.org",
    "@type": "DefinedTerm",
    "@id": `https://naezipnow.com/glossary/${t.slug}`,
    name: t.term,
    description: t.def,
    termCode: t.slug,
    inDefinedTermSet: {
      "@type": "DefinedTermSet",
      "@id": "https://naezipnow.com/glossary",
      name: "내집나우 부동산 용어사전",
    },
    inLanguage: "ko-KR",
    url: `https://naezipnow.com/glossary/${t.slug}`,
  };
}

export default async function GlossaryTermPage({
  params,
}: {
  params: Promise<{ term: string }>;
}) {
  const { term: slug } = await params;
  const t = findGlossaryTerm(slug);
  if (!t) notFound();

  const related = (t.related ?? [])
    .map((s) => findGlossaryTerm(s))
    .filter((x): x is GlossaryTerm => x !== null);

  // 같은 분류의 다른 용어 — 관련 용어와 겹치지 않게, 최대 6개.
  const excluded = new Set([t.slug, ...related.map((r) => r.slug)]);
  const siblings = GLOSSARY_TERMS.filter(
    (x) => x.category === t.category && !excluded.has(x.slug),
  ).slice(0, 6);

  return (
    <PageShell breadcrumb={`부동산 용어사전 · ${t.category}`}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(definedTermJsonLd(t)) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript(
            breadcrumbJsonLd([
              { name: "홈", url: "https://naezipnow.com/" },
              { name: "부동산 용어사전", url: "https://naezipnow.com/glossary" },
              { name: t.term, url: `https://naezipnow.com/glossary/${t.slug}` },
            ]),
          ),
        }}
      />

      <div className="mx-auto max-w-[720px]">
        <nav className="rise-in text-[12px] text-text-3">
          <Link href="/glossary" className="font-bold text-primary">
            부동산 용어사전
          </Link>
          <span className="mx-1">›</span>
          <span>{t.category}</span>
        </nav>

        <h1 className="rise-in mt-2 text-[24px] font-extrabold leading-[1.3] text-ink">
          {t.term}
        </h1>

        {/* 발췌 대비 — 첫 문단만 떼어 가도 무엇에 대한 설명인지 문단 안에서 완결된다. */}
        <article className="rise-in-1 mt-4 card rounded-[18px] p-6">
          <p className="text-[15px] leading-[1.85] text-text-1">{t.def}</p>
          {t.extra && (
            <p className="mt-3 text-[13px] leading-[1.8] text-text-2">{t.extra}</p>
          )}
          {t.href && (
            <Link
              href={t.href}
              className="mt-4 inline-block rounded-[10px] bg-primary px-4 py-2 text-[13px] font-bold text-white"
            >
              {t.hrefLabel ?? "내집나우에서 보기"} ›
            </Link>
          )}
        </article>

        {related.length > 0 && (
          <section className="rise-in-2 mt-5">
            <h2 className="text-[13px] font-extrabold text-ink">함께 보면 좋은 용어</h2>
            <div className="mt-2 flex flex-col gap-2">
              {related.map((r) => (
                <Link
                  key={r.slug}
                  href={`/glossary/${r.slug}`}
                  className="card rounded-[14px] p-4"
                >
                  <div className="text-[13px] font-extrabold text-ink">{r.term}</div>
                  <div className="mt-1 text-[12px] leading-[1.6] text-text-2">{r.short}</div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {siblings.length > 0 && (
          <section className="rise-in-3 mt-5">
            <h2 className="text-[13px] font-extrabold text-ink">{t.category} 용어</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              {siblings.map((s) => (
                <Link
                  key={s.slug}
                  href={`/glossary/${s.slug}`}
                  className="rounded-full border border-line bg-surface px-3 py-1.5 text-[12px] font-bold text-text-1"
                >
                  {s.term}
                </Link>
              ))}
            </div>
          </section>
        )}

        <div className="mt-6 rounded-[14px] bg-bg p-4 text-[12px] leading-[1.7] text-text-3">
          용어 풀이는 일반적인 이해를 돕기 위한 것입니다. 대출 한도·세율·규제 지역
          지정처럼 제도에 따라 달라지는 수치는 시점마다 바뀌므로, 실제 적용 기준은
          금융기관·관할 관청에서 확인하세요. 내집나우가 시세를 집계하는 방식은{" "}
          <Link href="/methodology" className="font-bold text-primary">
            데이터 방법론
          </Link>
          에 적어 두었습니다.
        </div>
      </div>
    </PageShell>
  );
}
