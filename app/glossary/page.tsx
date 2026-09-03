import Link from "next/link";
import { PageShell } from "../components/PageShell";
import { jsonLdScript } from "@/lib/seo/jsonld";
import { buildPageMetadata } from "@/lib/seo/page-metadata";
import { GLOSSARY_TERMS, glossaryTermsByCategory } from "@/lib/seo/glossary-terms";
import { GlossarySearch } from "./GlossarySearch";

export const metadata = buildPageMetadata({
  title: "부동산 용어사전 — 실거래·시세·대출·경매 용어 풀이",
  description:
    "실거래가, 전세가율, 평당가, 전용면적, LTV, DSR, 대항력, 우선변제권 등 부동산 거래에 필요한 용어를 한 문단씩 풀이합니다. 용어마다 개별 페이지가 있습니다.",
  path: "/glossary",
});

/* S14 → N14 — 정의형 용어사전 허브.

   여기는 이제 '목록'이다. 정의 본문의 주 무대는 /glossary/{slug} 개별 페이지로
   옮겼다(정의형 롱테일은 URL 단위로 수확된다). 허브는 분류별 색인 + 요약을 주고,
   DefinedTermSet 이 개별 DefinedTerm 페이지들을 하나로 묶는 역할을 한다.

   용어 데이터는 lib/seo/glossary-terms.ts 한 곳에만 있다 — 허브와 개별 페이지가
   각자 배열을 들고 있으면 반드시 어긋난다. */

function definedTermSetJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "DefinedTermSet",
    "@id": "https://naezipnow.com/glossary",
    name: "내집나우 부동산 용어사전",
    description:
      "부동산 실거래·시세·임대차·대출·세금·청약·경매 용어를 한 문단 정의로 정리한 사전입니다.",
    inLanguage: "ko-KR",
    url: "https://naezipnow.com/glossary",
    hasDefinedTerm: GLOSSARY_TERMS.map((t) => ({
      "@type": "DefinedTerm",
      "@id": `https://naezipnow.com/glossary/${t.slug}`,
      name: t.term,
      description: t.def,
      termCode: t.slug,
      url: `https://naezipnow.com/glossary/${t.slug}`,
    })),
  };
}

export default function GlossaryPage() {
  const groups = glossaryTermsByCategory();

  return (
    <PageShell breadcrumb="부동산 용어사전">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(definedTermSetJsonLd()) }}
      />
      <div className="mx-auto max-w-[820px]">
        <h1 className="rise-in text-[24px] font-extrabold text-ink">부동산 용어사전</h1>
        <p className="rise-in-1 mt-2 text-[13px] leading-[1.7] text-text-2">
          내집나우 화면과 부동산 거래에서 만나는 용어 {GLOSSARY_TERMS.length}개를 분류별로
          정리했습니다. 용어를 누르면 정의와 관련 용어를 함께 볼 수 있습니다.
        </p>

        {/* 제안 웹6 — 검색 + 분류 바로가기 + 목록 (클라이언트 필터, 데이터는
            서버 단일 출처 그대로 직렬화해 넘긴다) */}
        <GlossarySearch
          groups={groups.map((g) => ({
            category: g.category,
            terms: g.terms.map((t) => ({ slug: t.slug, term: t.term, short: t.short })),
          }))}
        />

        <div className="mt-6 rounded-[14px] bg-bg p-4 text-[12px] leading-[1.7] text-text-3">
          용어 풀이는 일반적인 이해를 돕기 위한 것으로, 대출 한도·세율·규제 지역 지정 등
          제도 관련 수치는 시점에 따라 달라집니다. 그래서 정의에 특정 수치를 적어 두지
          않았습니다. 시세 집계 방식은{" "}
          <Link href="/methodology" className="font-bold text-primary">
            데이터 방법론
          </Link>
          을 참고하세요.
        </div>
      </div>
    </PageShell>
  );
}
