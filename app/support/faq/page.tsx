import Link from "next/link";
import { PageShell } from "@/app/components/PageShell";
import { buildPageMetadata } from "@/lib/seo/page-metadata";
import { breadcrumbJsonLd, faqJsonLd, jsonLdScript } from "@/lib/seo/jsonld";
import { supportFaqByCategory, supportFaqItems } from "@/lib/support/faq";

/* ============================================================
   N15 — 서비스 FAQ 허브 (/support/faq).

   왜 /support 안이 아니라 별도 URL 인가: /support 는 공지·1:1 문의·제휴 문의가
   섞인 운영 화면이고, 그 안의 FAQ 는 질문만 접혀 있고 답이 없는 목록이었다.
   "구독 해지하면 남은 기간은?" 같은 질문은 그 자체가 검색 질의라서, 답이 본문에
   실린 독립 URL 이 있어야 검색·AI 인용에 걸린다.

   답은 lib/support/faq.ts 한 곳에서 온다 — 화면과 FAQPage 구조화 데이터가 같은
   배열을 읽어야 "구조화 데이터에만 있고 화면엔 없는 답"이 생기지 않는다.
   ============================================================ */

export const metadata = buildPageMetadata({
  title: "자주 묻는 질문 — 데이터·임장노트·구독·AI",
  description:
    "내집나우 시세 데이터의 출처와 집계 기준, 임장노트 공개 범위와 사진 위치정보 처리, 구독 요금·해지·환불, AI 분석의 근거를 질문별로 답했습니다.",
  path: "/support/faq",
});

export default function SupportFaqPage() {
  const groups = supportFaqByCategory();
  const all = supportFaqItems();

  return (
    <PageShell breadcrumb="고객지원 › 자주 묻는 질문">
      {/* 화면에 보이는 답 그대로 FAQPage 로 낸다 — 숨겨진 FAQ 를 만들지 않는다. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript(faqJsonLd(all.map((i) => ({ q: i.q, a: i.a })))),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript(
            breadcrumbJsonLd([
              { name: "홈", url: "https://naezipnow.com/" },
              { name: "고객지원", url: "https://naezipnow.com/support" },
              { name: "자주 묻는 질문", url: "https://naezipnow.com/support/faq" },
            ]),
          ),
        }}
      />

      <div className="mx-auto max-w-[820px]">
        <h1 className="rise-in text-[24px] font-extrabold text-ink">자주 묻는 질문</h1>
        <p className="rise-in-1 mt-2 text-[14px] leading-[1.7] text-text-2">
          데이터가 어디서 오는지, 노트를 공개하면 무엇이 보이는지, 요금과 해지는
          어떻게 되는지를 질문별로 답했습니다. 아직 없는 기능은 없다고 적었습니다.
        </p>

        <nav className="rise-in-1 mt-4 flex flex-wrap gap-2">
          {groups.map((g) => (
            <a
              key={g.category}
              href={`#${encodeURIComponent(g.category)}`}
              className="rounded-full border border-line bg-surface px-3 py-1.5 text-[12px] font-bold text-text-1"
            >
              {g.category} {g.items.length}
            </a>
          ))}
        </nav>

        <div className="mt-6 flex flex-col gap-6">
          {groups.map((g, gi) => (
            <section
              key={g.category}
              id={encodeURIComponent(g.category)}
              className={`rise-in-${Math.min(gi + 2, 6)} scroll-mt-24`}
            >
              <h2 className="text-[16px] font-extrabold text-ink">{g.category}</h2>
              <dl className="mt-2 flex flex-col gap-2">
                {g.items.map((it) => (
                  <div key={it.id} id={it.id} className="card scroll-mt-24 rounded-2xl p-5">
                    <dt className="text-[14px] font-extrabold leading-[1.5] text-ink">
                      {it.q}
                    </dt>
                    <dd className="mt-2 text-[13px] leading-[1.8] text-text-1">
                      {it.a}
                      {it.href && (
                        <Link
                          href={it.href}
                          className="ml-1 whitespace-nowrap font-bold text-primary"
                        >
                          {it.hrefLabel ?? "자세히 보기"} ›
                        </Link>
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>

        <div className="mt-6 flex flex-col gap-2 rounded-[14px] bg-bg p-4 text-[12px] leading-[1.7] text-text-2">
          <span className="font-extrabold text-ink">여기에 없는 질문이라면</span>
          <span>
            고객지원의 1:1 문의로 남겨 주세요. 데이터 수치가 이상하다는 제보는 원천
            데이터와 대조해 확인하고, 실제로 고친 건은{" "}
            <Link href="/methodology#corrections" className="font-bold text-primary">
              정정 이력
            </Link>
            에 남깁니다.
          </span>
          <Link
            href="/support"
            className="mt-1 inline-block w-fit rounded-[10px] bg-primary px-4 py-2 text-[12px] font-bold text-white"
          >
            1:1 문의하기 ›
          </Link>
        </div>
      </div>
    </PageShell>
  );
}
