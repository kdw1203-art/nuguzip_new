import Link from "next/link";
import { PageShell } from "../components/PageShell";
import { buildPageMetadata } from "@/lib/seo/page-metadata";
import { breadcrumbJsonLd, jsonLdScript } from "@/lib/seo/jsonld";

export const metadata = buildPageMetadata({
  title: "누구집 소개 — 운영 원칙",
  description:
    "누구집은 임장 기록을 부동산 판단 근거로 만드는 서비스입니다. 사실 우선 원칙과 데이터 처리 방식을 공개합니다.",
  path: "/about",
});

/* G22 — 소개·운영 원칙 페이지.
   브랜드 서사가 아니라 실제로 지키고 있는 원칙만 적는다 — 각 문장은
   서비스 어딘가에서 확인 가능한 동작이다(방법론 페이지가 그 증거다). */

const PRINCIPLES: { title: string; body: string }[] = [
  {
    title: "사실이 최우선입니다",
    body: "모든 시세는 국토교통부에 신고된 실거래만 집계하고, 수치에는 기준 시점을 붙입니다. 매물 호가·추정치를 시세라고 부르지 않습니다.",
  },
  {
    title: "없는 데이터는 없다고 말합니다",
    body: "실거래가 없는 단지에 추정 시세를 만들지 않고, 데이터가 부족하면 화면에 그대로 '아직 없다'고 적습니다. AI 기능도 조회된 데이터에서만 답하며, 어떤 데이터를 읽었는지 답변과 함께 보여줍니다.",
  },
  {
    title: "계산 방식을 공개합니다",
    body: "해제거래 제외, 신고 지연 처리, 시장 온도 공식 등 집계 방식 전부를 데이터 방법론 페이지에 공개합니다. 방식이 바뀌면 문서를 갱신합니다.",
  },
  {
    title: "판단은 사용자의 것입니다",
    body: "누구집은 매수·매도를 추천하지 않습니다. 데이터와 본인의 임장 기록을 나란히 두고, 판단의 근거를 쌓는 것을 돕습니다.",
  },
];

export default function AboutPage() {
  const crumbs = breadcrumbJsonLd([
    { name: "홈", url: "/" },
    { name: "소개", url: "/about" },
  ]);
  return (
    <PageShell breadcrumb="소개">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(crumbs) }}
      />
      <div className="mx-auto max-w-[720px]">
        <h1 className="rise-in text-[24px] font-extrabold text-ink">
          누구집 — 임장 기록이 판단 근거가 됩니다
        </h1>
        <p className="rise-in-1 mt-2 text-[14px] leading-[1.7] text-text-2">
          누구집(nuguzip.com)은 집을 보러 다니는 기록(임장노트)을 국토교통부 실거래
          데이터와 나란히 놓고, 부동산 판단의 근거를 쌓도록 돕는 서비스입니다.
        </p>

        <div className="mt-6 flex flex-col gap-4">
          {PRINCIPLES.map((p, i) => (
            <section key={p.title} className={`rise-in-${Math.min(i + 2, 6)} card rounded-[18px] p-6`}>
              <h2 className="text-[16px] font-extrabold text-ink">{p.title}</h2>
              <p className="mt-2 text-[13px] leading-[1.75] text-text-1">{p.body}</p>
            </section>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap gap-2 text-[12px]">
          <Link href="/methodology" className="chip chip-soft px-3.5 py-2 no-underline">
            데이터 방법론 ›
          </Link>
          <Link href="/glossary" className="chip chip-soft px-3.5 py-2 no-underline">
            용어사전 ›
          </Link>
          <Link href="/reports" className="chip chip-soft px-3.5 py-2 no-underline">
            월간 실거래 리포트 ›
          </Link>
          <Link href="/support" className="chip chip-soft px-3.5 py-2 no-underline">
            고객센터 ›
          </Link>
        </div>
      </div>
    </PageShell>
  );
}
