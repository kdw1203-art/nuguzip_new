import Link from "next/link";
import { PageShell } from "../components/PageShell";
import { buildPageMetadata } from "@/lib/seo/page-metadata";
import { jsonLdScript } from "@/lib/seo/jsonld";

export const metadata = buildPageMetadata({
  title: "데이터 방법론 — 누구집 시세는 이렇게 계산합니다",
  description:
    "국토교통부 실거래 기반 시세 집계 방식, 해제거래 제외, 신고 지연 처리, 시장 온도 지표의 계산 공식을 공개합니다.",
  path: "/methodology",
});

/* G18·G9 — 데이터 방법론 공개 페이지.
   새로 만든 규칙이 아니라, 이미 코드가 하고 있는 처리를 문서화한 것이다.
   각 항목의 출처는 레포 커밋·모듈에 있다(해제거래 제외 #150, 시장 온도 timing 페이지).
   이 페이지는 정적(데이터 페칭 없음) — 구체적 수치는 시점에 묶이므로 적지 않고,
   방식만 적는다. 수치는 각 화면이 기준월과 함께 보여 준다. */

const SECTIONS: { id: string; q: string; a: string[] }[] = [
  {
    id: "source",
    q: "시세 데이터는 어디서 오나요?",
    a: [
      "국토교통부 실거래가 공개시스템(공공데이터포털)의 아파트 매매·전월세 신고 자료를 사용합니다. 부동산 포털의 호가나 추정치가 아니라, 실제로 신고된 계약만 집계합니다.",
      "전국 시군구를 주기적으로 순회하며 수집하고, 모든 화면의 수치에는 기준월을 함께 표기합니다.",
    ],
  },
  {
    id: "cancelled",
    q: "해제(취소)된 거래는 어떻게 처리하나요?",
    a: [
      "계약 후 해제 신고된 거래는 시세 평균에서 제외합니다. 해제분을 섞으면 단지 평균가가 실제와 크게 달라질 수 있기 때문입니다 — 실측 검증에서 해제거래를 포함하면 일부 단지의 평균가가 20% 이상 왜곡되는 것을 확인하고 전면 제외로 정했습니다.",
      "해제됐다는 사실 자체도 데이터이므로 원본 기록은 보존하되, \"이 단지가 얼마에 거래됐나\"를 답하는 화면에는 넣지 않습니다.",
    ],
  },
  {
    id: "lag",
    q: "최근 달 거래량이 적어 보이는 이유는?",
    a: [
      "실거래 신고 기한은 계약 후 30일입니다. 따라서 이번 달과 직전 달 수치는 아직 신고되지 않은 계약만큼 실제보다 적게 집계되며, 시간이 지나면서 채워집니다.",
      "거래량 차트에서는 이번 달을 다른 색으로 구분하고, 추세 계산(시장 온도)에서는 신고가 완결되지 않은 달을 제외합니다.",
    ],
  },
  {
    id: "average",
    q: "\"평균 매매가\"는 어떻게 계산하나요?",
    a: [
      "지역 평균은 해당 시군구의 기간 내 실거래를 단순 평균한 값입니다. 면적·타입을 구분하지 않은 평균이므로, 같은 지역이라도 어떤 평형이 많이 거래됐는지에 따라 체감과 다를 수 있습니다.",
      "그래서 단지 화면에서는 면적대별 시세를 따로 보여 주며, 평균과 함께 거래 건수를 항상 표기합니다 — 3건짜리 평균과 300건짜리 평균은 신뢰도가 다르기 때문입니다.",
    ],
  },
  {
    id: "temperature",
    q: "\"시장 온도\"는 무엇인가요?",
    a: [
      "누구집 고유 지표로, 지역 시장의 가격·거래 활동을 0~100으로 요약합니다. 50이 중립입니다.",
      "계산: 50점 기준에 ① 매매가격지수 모멘텀(최근 3개월 평균 변동률, 월 ±1%를 ±25점으로 환산)과 ② 거래량 추이(신고 완결월 기준 최근 구간 대비 직전 구간 증감, ±50%를 ±25점으로 환산)를 더합니다. 거래량 완결월이 4개 미만이면 지수 모멘텀만 반영하며, 화면에 그 사실을 표시합니다.",
      "시장 온도는 매수·매도 추천이 아니라 시장 상태의 서술이며, 계산에 쓰인 실측 입력값을 항상 함께 보여 줍니다.",
    ],
  },
  {
    id: "missing",
    q: "데이터가 없는 곳은 어떻게 보여 주나요?",
    a: [
      "없는 데이터는 비워 둡니다. 실거래가 없는 단지에 추정 시세를 만들지 않고, 좌표가 확인되지 않은 지역을 지도에 임의로 찍지 않으며, 데이터가 부족하면 화면에 \"아직 없다\"고 적습니다.",
      "AI 기능(에이전트·요약)도 같은 원칙을 따릅니다 — 답변의 모든 수치는 DB 조회 결과에서만 인용하고, 조회한 데이터 목록을 답변과 함께 표시합니다.",
    ],
  },
];

/* 웹11 — 방법론 최근 변경 이력. "바뀌면 이 페이지를 갱신합니다"라는 하단 약속을
   실제 목록으로 이행한다. 실제로 일어난 변경만, 커밋 날짜 그대로 적는다
   (각 항목의 출처 커밋: #150 해제거래, 5ecb5d2 온도 아카이브, 208abe8 집계 복구,
   a9f530e 면적대 표). 여기 새 항목을 추가할 때도 같은 규칙 — 배포된 변경만. */
const CHANGELOG: { date: string; text: string }[] = [
  {
    date: "2026-08-03",
    text: "면적대별 시세표에 기준 기간(첫 계약월~마지막 계약월)과 표본 건수를 명기 — 석 달치 평균과 삼 년치 평균이 같은 얼굴을 하지 않도록.",
  },
  {
    date: "2026-08-02",
    text: "시세 집계 자동 갱신 작업의 스키마 오류를 복구 — 중단됐던 지역·단지 집계 갱신이 재개됨.",
  },
  {
    date: "2026-07-26",
    text: "시장 온도를 매주 아카이브로 저장 시작 — 현재 값만이 아니라 시점별 추세를 확인할 수 있게 됨.",
  },
  {
    date: "2026-07-25",
    text: "해제(취소) 신고된 실거래 402건을 시세 집계에서 전면 제외 — 일부 단지 평균가가 20% 이상 왜곡되던 문제를 정정.",
  },
];

/* FAQPage JSON-LD — 위 본문과 같은 내용(내용 불일치 금지: 같은 배열에서 생성) */
function faqJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: SECTIONS.map((s) => ({
      "@type": "Question",
      name: s.q,
      acceptedAnswer: { "@type": "Answer", text: s.a.join(" ") },
    })),
  };
}

export default function MethodologyPage() {
  return (
    <PageShell breadcrumb="데이터 방법론">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(faqJsonLd()) }}
      />
      <div className="mx-auto max-w-[760px]">
        <h1 className="rise-in text-[24px] font-extrabold text-ink">
          누구집 시세는 이렇게 계산합니다
        </h1>
        {/* G12 — 정의형 첫 문단: 이 페이지가 무엇인지 완결 문장으로 */}
        <p className="rise-in-1 mt-2 text-[14px] leading-[1.7] text-text-2">
          이 페이지는 누구집(nuguzip.com)이 국토교통부 실거래 데이터를 수집·집계해
          시세와 지표를 만드는 방식을 공개한 문서입니다. 새로 만든 규칙이 아니라,
          서비스가 실제로 동작하는 방식을 그대로 적었습니다.
        </p>

        <div className="mt-6 flex flex-col gap-4">
          {SECTIONS.map((s, i) => (
            <section
              key={s.id}
              id={s.id}
              className={`rise-in-${Math.min(i + 2, 6)} card rounded-[18px] p-6`}
            >
              <h2 className="text-[16px] font-extrabold text-ink">{s.q}</h2>
              {s.a.map((p, j) => (
                <p key={j} className="mt-2 text-[13px] leading-[1.75] text-text-1">
                  {p}
                </p>
              ))}
            </section>
          ))}
        </div>

        {/* 웹11 — 방법론 최근 변경. CHANGELOG 배열(실제 배포된 변경만) 렌더 */}
        <section id="changelog" className="card mt-6 rounded-[18px] p-6">
          <h2 className="text-[16px] font-extrabold text-ink">최근 변경</h2>
          <p className="mt-2 text-[13px] leading-[1.75] text-text-2">
            집계 방식이 바뀌면 이 목록에 날짜와 함께 남깁니다.
          </p>
          <ul className="mt-3 flex flex-col gap-2.5">
            {CHANGELOG.map((c) => (
              <li key={`${c.date}-${c.text.slice(0, 8)}`} className="flex gap-3 text-[13px] leading-[1.7]">
                <span className="shrink-0 font-bold tabular-nums text-text-3">{c.date}</span>
                <span className="text-text-1">{c.text}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* G21 — 정정 이력. 데이터·집계 오류를 고치면 여기 남긴다.
            아직 0건이라고 정직하게 적는 것부터가 이 제도의 시작이다. */}
        <section id="corrections" className="card mt-6 rounded-[18px] p-6">
          <h2 className="text-[16px] font-extrabold text-ink">정정 이력</h2>
          <p className="mt-2 text-[13px] leading-[1.75] text-text-1">
            공개된 수치·집계에서 오류를 발견해 정정하면 날짜와 내용을 이 목록에
            남깁니다. 이 페이지 공개(2026년 7월) 이후 기록된 정정은 아직 없습니다.
            오류 제보는 고객센터로 부탁드립니다.
          </p>
        </section>

        <div className="mt-6 rounded-[14px] bg-bg p-4 text-[11px] leading-[1.7] text-text-3">
          본 문서의 방식은 서비스 개선에 따라 바뀔 수 있으며, 바뀌면 이 페이지를
          갱신합니다. 시세·분석 결과는 참고용 정보이며 투자 판단의 책임은 이용자
          본인에게 있습니다. 문의:{" "}
          <Link href="/support" className="font-bold text-primary">
            고객센터
          </Link>
        </div>
      </div>
    </PageShell>
  );
}
