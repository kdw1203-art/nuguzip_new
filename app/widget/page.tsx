import Link from "next/link";
import { PageShell } from "@/app/components/PageShell";
import { buildPageMetadata } from "@/lib/seo/page-metadata";
import { breadcrumbJsonLd, faqJsonLd, jsonLdScript } from "@/lib/seo/jsonld";
import { WidgetBuilder } from "./WidgetBuilder";
import { OfficeLeadForm } from "./OfficeLeadForm";

/* ============================================================
   N17 — 시세 위젯 배포 안내 (/widget).

   위젯 자체(app/embed/complex/[id])는 이미 있었는데, 그 존재를 아는 사람이
   아무도 없었다. 안내 페이지가 없으니 아무도 붙여넣지 않고, 아무도 붙여넣지
   않으니 위젯에 박아 둔 출처 링크가 백링크로 돌아오지 않는다.

   왜 /embed 하위가 아닌가: app/embed/layout.tsx 는 사이트 크롬을 벗기고
   noindex 를 건다(위젯이 검색에 잡히면 안 되니 맞는 설정이다). 안내 페이지는
   반대로 색인돼야 하므로 그 레이아웃 밖인 /widget 에 둔다.
   ============================================================ */

export const metadata = buildPageMetadata({
  title: "실거래 시세 위젯 — 블로그·카페에 붙여넣기",
  description:
    "내집나우 단지 실거래 시세를 블로그·카페에 iframe 한 줄로 붙여넣는 방법. 국토교통부 실거래 신고 자료를 그대로 보여 주며, 시세가 갱신되면 붙여넣은 위젯도 함께 갱신됩니다.",
  path: "/widget",
});

const FAQ = [
  {
    q: "위젯에 나오는 시세는 어떤 데이터인가요?",
    a: "국토교통부 실거래가 공개시스템에 신고된 거래를 집계한 값입니다. 매물 호가가 아니라 실제 신고된 계약 금액이며, 위젯에는 최근 월 실거래 평균과 전월 대비 변동률이 표시됩니다. 신고 기한이 계약일로부터 30일이라 최근 1~2개월 값은 잠정치입니다.",
  },
  {
    q: "한 번 붙여넣으면 시세가 자동으로 갱신되나요?",
    a: "네. 위젯은 이미지가 아니라 내집나우 페이지를 불러오는 iframe 이라, 실거래가 새로 집계되면 이미 붙여넣은 글의 숫자도 함께 바뀝니다. 글을 다시 수정할 필요가 없습니다.",
  },
  {
    q: "데이터를 불러오지 못하면 어떻게 되나요?",
    a: "숫자를 지어내지 않고 '시세를 불러오지 못했어요' 카드가 대신 표시됩니다. 남의 글 안에서 확인되지 않은 가격이 내집나우 이름을 달고 노출되는 일이 없도록 한 처리입니다.",
  },
  {
    q: "사용료가 있나요? 출처 표기를 지워도 되나요?",
    a: "무료이며 별도 신청 절차도 없습니다. 다만 위젯 안의 내집나우 표기와 '국토교통부 실거래가 기준' 문구는 데이터 출처를 밝히는 부분이니 지우지 말고 그대로 두어 주세요.",
  },
];

export default function WidgetPage() {
  return (
    <PageShell breadcrumb="실거래 시세 위젯">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(faqJsonLd(FAQ)) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript(
            breadcrumbJsonLd([
              { name: "홈", url: "https://naezipnow.com/" },
              { name: "실거래 시세 위젯", url: "https://naezipnow.com/widget" },
            ]),
          ),
        }}
      />

      <div className="mx-auto max-w-[820px]">
        <h1 className="rise-in text-[24px] font-extrabold text-ink">실거래 시세 위젯</h1>
        <p className="rise-in-1 mt-2 text-[14px] leading-[1.7] text-text-2">
          단지의 최근 실거래 시세를 블로그·카페 글에 한 줄로 붙여넣을 수 있습니다.
          국토교통부 실거래 신고 자료를 그대로 보여 주고, 시세가 갱신되면 이미 붙여넣은
          위젯도 같이 갱신됩니다.
        </p>

        <div className="rise-in-1 mt-4">
          <WidgetBuilder />
        </div>

        <section className="rise-in-2 mt-6">
          <h2 className="text-[16px] font-extrabold text-ink">단지 주소는 어디서 찾나요?</h2>
          <p className="mt-2 text-[13px] leading-[1.8] text-text-1">
            단지 브라우즈에서 구를 고르면 단지 목록이 나옵니다. 원하는 단지를 눌러
            단지 페이지로 들어간 뒤, 브라우저 주소창의 주소를 그대로 복사해 위에
            붙여넣으면 됩니다.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href="/complex/browse"
              className="rounded-[10px] bg-primary px-4 py-2 text-[13px] font-bold text-white"
            >
              단지 찾아보기 ›
            </Link>
            <Link
              href="/map"
              className="rounded-[10px] border border-line bg-surface px-4 py-2 text-[13px] font-bold text-text-1"
            >
              지도에서 찾기 ›
            </Link>
          </div>
        </section>

        {/* [#144] 중개사 사무소 B2B 리드 — 첫 B2B 퍼널 (백엔드는 /api/support 재사용) */}
        <section className="rise-in-2 mt-6">
          <h2 className="text-[16px] font-extrabold text-ink">공인중개사 사무소인가요?</h2>
          <p className="mt-2 text-[13px] leading-[1.8] text-text-1">
            사무소 홈페이지·블로그에 담당 단지 시세를 상시 노출하고 싶다면 문의를
            남겨 주세요. 활용 방법을 직접 안내드리고, 사무소에서 필요한 위젯 구성이
            있으면 만들 때 참고합니다.
          </p>
          <div className="mt-3">
            <OfficeLeadForm />
          </div>
        </section>

        <section className="rise-in-3 mt-6">
          <h2 className="text-[16px] font-extrabold text-ink">자주 묻는 질문</h2>
          <dl className="mt-2 flex flex-col gap-2">
            {FAQ.map((f) => (
              <div key={f.q} className="card rounded-2xl p-5">
                <dt className="text-[14px] font-extrabold leading-[1.5] text-ink">{f.q}</dt>
                <dd className="mt-2 text-[13px] leading-[1.8] text-text-1">{f.a}</dd>
              </div>
            ))}
          </dl>
        </section>

        <div className="mt-6 rounded-[14px] bg-bg p-4 text-[11px] leading-[1.7] text-text-3">
          위젯의 숫자는 신고된 실거래의 단순 평균이며 면적·층을 가중하지 않습니다. 집계
          방식과 잠정치 처리 기준은{" "}
          <Link href="/methodology" className="font-bold text-primary">
            데이터 방법론
          </Link>
          에, 서비스 전반의 질문은{" "}
          <Link href="/support/faq" className="font-bold text-primary">
            자주 묻는 질문
          </Link>
          에 정리해 두었습니다.
        </div>
      </div>
    </PageShell>
  );
}
