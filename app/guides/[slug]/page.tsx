import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "@/app/components/PageShell";
import { GUIDES, GUIDE_BY_SLUG } from "@/lib/guides/catalog";
import { breadcrumbJsonLd, faqJsonLd, jsonLdScript } from "@/lib/seo/jsonld";
import { seoAlternates } from "@/lib/seo/alternates";

/* [945 · 실사용50 #25] 검색 유입용 가이드 — 카탈로그(lib/guides/catalog.ts) 렌더러.
   전 편이 정적(순수 상수)이라 dynamicParams=false 로 빌드에 굳힌다.
   각 편의 도구 링크가 이 글의 존재 이유다 — 글에서 끝나면 유입이 이탈이다. */

export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return GUIDES.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const guide = GUIDE_BY_SLUG.get(slug);
  if (!guide) return { title: "가이드 | 내집나우" };
  return {
    title: `${guide.title} | 내집나우`,
    description: guide.metaDescription,
    alternates: seoAlternates(`/guides/${guide.slug}`),
    openGraph: {
      title: guide.title,
      description: guide.metaDescription,
      siteName: "내집나우",
      locale: "ko_KR",
      type: "article",
    },
  };
}

export default async function GuidePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const guide = GUIDE_BY_SLUG.get(slug);
  if (!guide) notFound();

  const related = guide.related
    .map((s) => GUIDE_BY_SLUG.get(s))
    .filter((g): g is NonNullable<typeof g> => Boolean(g));

  const breadcrumb = breadcrumbJsonLd([
    { name: "홈", url: "/" },
    { name: "가이드", url: "/guides" },
    { name: guide.title },
  ]);

  return (
    <PageShell breadcrumb="가이드">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(breadcrumb) }}
      />
      {guide.faq.length > 0 && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdScript(faqJsonLd(guide.faq)) }}
        />
      )}

      <div className="mx-auto w-full max-w-[720px]">
        <p className="rise-in t-caption font-bold text-primary">{guide.category} 가이드</p>
        <h1 className="rise-in mt-1 text-[24px] font-extrabold leading-[1.3] text-ink">
          {guide.title}
        </h1>
        <p className="rise-in-1 mt-3 t-body leading-[1.75] text-text-2">{guide.intro}</p>

        {/* 목차 — 섹션 3개 이상일 때만 */}
        {guide.sections.length >= 3 && (
          <nav
            aria-label="목차"
            className="rise-in-2 mt-5 rounded-2xl border border-line bg-surface px-4 py-3"
          >
            <div className="t-caption font-extrabold text-text-3">이 글의 순서</div>
            <ol className="mt-1.5 flex flex-col gap-1">
              {guide.sections.map((s, i) => (
                <li key={s.heading} className="t-sub text-text-1">
                  <span className="font-extrabold text-primary">{i + 1}.</span> {s.heading}
                </li>
              ))}
            </ol>
          </nav>
        )}

        {guide.sections.map((section) => (
          <section key={section.heading} className="mt-7">
            <h2 className="text-[19px] font-extrabold text-ink">{section.heading}</h2>
            <div className="mt-2.5 flex flex-col gap-3">
              {section.body.map((p) => (
                <p key={p.slice(0, 24)} className="t-body leading-[1.8] text-text-1">
                  {p}
                </p>
              ))}
            </div>
          </section>
        ))}

        {/* 도구 연결 — 이 가이드의 다음 행동 */}
        <section className="mt-8 rounded-2xl border border-primary/25 bg-primary-soft/50 p-4">
          <h2 className="t-body font-extrabold text-ink">읽었다면, 바로 해보기</h2>
          <div className="mt-2.5 flex flex-col gap-2">
            {guide.tools.map((t) => (
              <Link
                key={t.href}
                href={t.href}
                className="flex flex-col rounded-xl bg-surface px-3.5 py-2.5 no-underline shadow-sm"
              >
                <span className="t-body font-extrabold text-primary">{t.label} ›</span>
                <span className="mt-0.5 t-caption text-text-2">{t.why}</span>
              </Link>
            ))}
          </div>
        </section>

        {guide.faq.length > 0 && (
          <section className="mt-8">
            <h2 className="text-[19px] font-extrabold text-ink">자주 묻는 질문</h2>
            <div className="mt-2.5 flex flex-col gap-3">
              {guide.faq.map((f) => (
                <div key={f.q} className="rounded-2xl border border-line bg-surface px-4 py-3.5">
                  <div className="t-body font-extrabold text-ink">Q. {f.q}</div>
                  <p className="mt-1.5 t-body leading-[1.7] text-text-2">{f.a}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {related.length > 0 && (
          <section className="mt-8">
            <h2 className="t-body font-extrabold text-text-2">함께 보면 좋은 가이드</h2>
            <div className="mt-2 flex flex-col gap-1.5">
              {related.map((r) => (
                <Link
                  key={r.slug}
                  href={`/guides/${r.slug}`}
                  className="rounded-xl border border-line bg-surface px-3.5 py-2.5 no-underline"
                >
                  <span className="t-body font-bold text-ink">{r.title}</span>
                  <span className="mt-0.5 block t-caption text-text-3">{r.description}</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        <p className="mt-8 t-caption leading-[1.7] text-text-3">
          이 가이드는 일반적인 절차·개념 안내이며 특정 매물·투자에 대한 권유가 아닙니다.
          계약·세무 등 개별 사안은 공인중개사·법무사·세무사 등 전문가와 확인하세요.
        </p>
      </div>
    </PageShell>
  );
}
