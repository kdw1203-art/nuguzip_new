import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/app/components/PageShell";
import { GUIDES, LEGACY_GUIDES } from "@/lib/guides/catalog";
import { seoAlternates } from "@/lib/seo/alternates";

/* [945 · 실사용50 #25] 가이드 허브 — 카탈로그 10편 + 기존 2편(계약·규제). */

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "부동산 실전 가이드 — 임장·시세·전세·청약 | 내집나우",
  description:
    "임장 체크리스트, 전세가율 보는 법, 실거래가 해석, 전세 안전 점검, 청약 일정까지 — 검색할 필요 없이 순서대로 따라 하는 실전 가이드 모음.",
  alternates: seoAlternates("/guides"),
};

const CATEGORY_ORDER = ["임장", "시세 읽기", "전세", "청약·분양", "경매·공매"] as const;

export default function GuidesIndexPage() {
  const byCategory = CATEGORY_ORDER.map((cat) => ({
    cat,
    items: GUIDES.filter((g) => g.category === cat),
  })).filter((x) => x.items.length > 0);

  return (
    <PageShell breadcrumb="가이드">
      <div className="mx-auto w-full max-w-[720px]">
        <h1 className="rise-in text-[24px] font-extrabold leading-[1.3] text-ink">
          부동산 실전 가이드
        </h1>
        <p className="rise-in-1 mt-2 t-body leading-[1.7] text-text-2">
          임장 준비부터 계약 안전 점검까지 — 개념은 짧게, 순서는 구체적으로. 각 가이드
          끝에서 지도·계산기·노트로 바로 이어집니다.
        </p>

        {byCategory.map(({ cat, items }) => (
          <section key={cat} className="mt-7">
            <h2 className="t-body font-extrabold text-text-2">{cat}</h2>
            <div className="mt-2 flex flex-col gap-2">
              {items.map((g) => (
                <Link
                  key={g.slug}
                  href={`/guides/${g.slug}`}
                  className="rounded-2xl border border-line bg-surface px-4 py-3.5 no-underline transition hover:border-primary/40"
                >
                  <span className="t-body font-extrabold text-ink">{g.title}</span>
                  <span className="mt-1 block t-sub leading-[1.6] text-text-2">
                    {g.description}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ))}

        <section className="mt-7">
          <h2 className="t-body font-extrabold text-text-2">계약·규제</h2>
          <div className="mt-2 flex flex-col gap-2">
            {LEGACY_GUIDES.map((g) => (
              <Link
                key={g.slug}
                href={`/guides/${g.slug}`}
                className="rounded-2xl border border-line bg-surface px-4 py-3.5 no-underline transition hover:border-primary/40"
              >
                <span className="t-body font-extrabold text-ink">{g.title}</span>
                <span className="mt-1 block t-sub leading-[1.6] text-text-2">{g.description}</span>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </PageShell>
  );
}
