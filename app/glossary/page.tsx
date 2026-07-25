import Link from "next/link";
import { PageShell } from "../components/PageShell";
import { jsonLdScript } from "@/lib/seo/jsonld";
import { buildPageMetadata } from "@/lib/seo/page-metadata";

export const metadata = buildPageMetadata({
  title: "부동산 용어사전 — 실거래·시세 용어 풀이",
  description:
    "전세가율, 평당가, 실거래가, 해제거래, DSR, LTV 등 부동산 시세·거래 용어를 한 문단으로 풀이합니다.",
  path: "/glossary",
});

/* S14 — 정의형 용어사전.
   각 정의는 "발췌해도 완결되는 한 문단"(G12)으로 쓴다 — 검색·AI 인용 대비.
   누구집 화면에서 실제로 쓰는 용어만 싣고, 누구집 고유 지표(시장 온도)는
   방법론 페이지의 정의를 원문으로 링크한다. */

const TERMS: { id: string; term: string; def: string; href?: string; hrefLabel?: string }[] = [
  {
    id: "silgeorae",
    term: "실거래가",
    def: "실제로 체결돼 국토교통부에 신고된 계약의 거래 금액입니다. 부동산 포털에 올라오는 매물 호가(부르는 값)와 달리, 신고 기한(계약 후 30일) 안에 신고된 실제 계약만 집계됩니다. 누구집의 모든 시세는 실거래가 기준입니다.",
    href: "/tx",
    hrefLabel: "지역별 실거래 보기",
  },
  {
    id: "hoga",
    term: "호가",
    def: "매도인이 부르는 희망 가격입니다. 실제 계약 금액이 아니므로 실거래가와 차이가 날 수 있으며, 시장이 꺾일 때는 호가와 실거래가의 간격이 커지는 경향이 있습니다.",
  },
  {
    id: "haeje",
    term: "해제거래 (계약 해제)",
    def: "체결 신고 후 취소된 계약입니다. 해제거래를 시세 평균에 포함하면 단지 평균가가 크게 왜곡될 수 있어, 누구집은 해제 신고분을 시세 집계에서 제외합니다.",
    href: "/methodology#cancelled",
    hrefLabel: "누구집의 해제거래 처리 방식",
  },
  {
    id: "jeonse-ratio",
    term: "전세가율",
    def: "매매가 대비 전세가의 비율(%)입니다. 예를 들어 매매가 10억 아파트의 전세가 6억이면 전세가율은 60%입니다. 전세가율이 높을수록 매매가와 전세가의 차이(갭)가 작다는 뜻입니다.",
  },
  {
    id: "pyeongdanga",
    term: "평당가 (3.3㎡당 가격)",
    def: "거래 금액을 전용면적의 평수(1평 = 3.3058㎡)로 나눈 값입니다. 면적이 다른 아파트끼리 가격 수준을 비교할 때 씁니다. 같은 단지라도 소형 평형의 평당가가 대형보다 높게 나오는 것이 일반적입니다.",
  },
  {
    id: "jeonyong",
    term: "전용면적",
    def: "현관 안쪽, 세대가 독점 사용하는 면적입니다. 계단·복도 등을 포함한 공급면적과 다르며, 실거래 신고와 누구집의 면적대 구분은 전용면적 기준입니다. 흔히 말하는 '84㎡(국민평형)'가 전용면적 표기입니다.",
  },
  {
    id: "ltv",
    term: "LTV (주택담보대출비율)",
    def: "주택 가격 대비 대출 금액의 비율입니다. 예를 들어 10억 주택에 4억을 대출받으면 LTV 40%입니다. 규제 지역·주택 수에 따라 한도가 달라집니다.",
    href: "/analysis/scenario",
    hrefLabel: "내 조건으로 시뮬레이션",
  },
  {
    id: "dsr",
    term: "DSR (총부채원리금상환비율)",
    def: "연 소득 대비 모든 대출의 연간 원리금 상환액 비율입니다. 소득 7,000만원에 연 원리금 상환이 2,100만원이면 DSR 30%입니다. 대출 한도를 정하는 핵심 규제 지표입니다.",
    href: "/analysis/scenario",
    hrefLabel: "내 조건으로 시뮬레이션",
  },
  {
    id: "wonligeum",
    term: "원리금균등상환",
    def: "대출 기간 내내 매달 같은 금액(원금+이자)을 갚는 방식입니다. 초기에는 상환액 중 이자 비중이 크고, 갈수록 원금 비중이 커집니다. 누구집 시나리오 계산기는 30년 원리금균등을 기본으로 합니다.",
  },
  {
    id: "gap",
    term: "갭투자",
    def: "전세 보증금을 끼고 매매가와 전세가의 차액(갭)만 들여 주택을 사는 방식입니다. 전세가율이 높을수록 필요한 자기 자금이 줄지만, 전세가 하락 시 보증금 반환 부담이 커지는 위험이 있습니다.",
  },
  {
    id: "imjang",
    term: "임장",
    def: "매수·임차를 검토하는 집과 동네를 직접 방문해 확인하는 일입니다. 시세표에 나오지 않는 소음·채광·경사·생활 동선을 확인하는 과정으로, 누구집은 임장 기록(임장노트)을 판단 근거로 쌓는 것을 돕는 서비스입니다.",
    href: "/notes/new",
    hrefLabel: "임장노트 쓰기",
  },
  {
    id: "index",
    term: "매매가격지수",
    def: "특정 시점을 기준(100)으로 지역 주택 매매가격의 상대적 변화를 나타낸 지수입니다. 개별 단지가 아닌 지역 전체의 가격 흐름을 볼 때 씁니다.",
    href: "/analysis/timing",
    hrefLabel: "지역 지수 추세 보기",
  },
  {
    id: "temperature",
    term: "시장 온도 (누구집 고유 지표)",
    def: "누구집이 지역 시장의 가격·거래 활동을 0~100으로 요약한 합성 지표입니다. 50이 중립이며, 매매가격지수 모멘텀과 실거래 거래량 추이 두 실측치에서만 계산합니다. 매수·매도 추천이 아니라 시장 상태의 서술입니다.",
    href: "/methodology#temperature",
    hrefLabel: "계산 공식 보기",
  },
];

function definedTermSetJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "DefinedTermSet",
    "@id": "https://nuguzip.com/glossary",
    name: "누구집 부동산 용어사전",
    inLanguage: "ko-KR",
    hasDefinedTerm: TERMS.map((t) => ({
      "@type": "DefinedTerm",
      "@id": `https://nuguzip.com/glossary#${t.id}`,
      name: t.term,
      description: t.def,
    })),
  };
}

export default function GlossaryPage() {
  return (
    <PageShell breadcrumb="부동산 용어사전">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(definedTermSetJsonLd()) }}
      />
      <div className="mx-auto max-w-[760px]">
        <h1 className="rise-in text-[24px] font-extrabold text-ink">부동산 용어사전</h1>
        <p className="rise-in-1 mt-2 text-[14px] leading-[1.7] text-text-2">
          누구집 화면에 나오는 시세·거래 용어를 한 문단씩 풀이했습니다. 각 용어는
          관련 화면으로 바로 이어집니다.
        </p>

        <div className="mt-6 flex flex-col gap-4">
          {TERMS.map((t, i) => (
            <section
              key={t.id}
              id={t.id}
              className={`rise-in-${Math.min(i + 2, 6)} card rounded-[18px] p-6`}
            >
              <h2 className="text-[16px] font-extrabold text-ink">{t.term}</h2>
              <p className="mt-2 text-[13px] leading-[1.75] text-text-1">{t.def}</p>
              {t.href && (
                <Link href={t.href} className="mt-2 inline-block text-[12px] font-bold text-primary">
                  {t.hrefLabel} ›
                </Link>
              )}
            </section>
          ))}
        </div>

        <div className="mt-6 rounded-[14px] bg-bg p-4 text-[11px] leading-[1.7] text-text-3">
          용어 풀이는 일반적인 이해를 돕기 위한 것으로, 대출 한도·규제 등 제도 관련
          내용은 시점에 따라 달라질 수 있습니다. 시세 집계 방식은{" "}
          <Link href="/methodology" className="font-bold text-primary">
            데이터 방법론
          </Link>
          을 참고하세요.
        </div>
      </div>
    </PageShell>
  );
}
