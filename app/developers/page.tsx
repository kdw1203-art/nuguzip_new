import Link from "next/link";
import { PageShell } from "../components/PageShell";
import { buildPageMetadata } from "@/lib/seo/page-metadata";
import { DEFAULT_LIMIT, MAX_LIMIT, PUBLIC_API_LICENSE } from "@/lib/api/public-aggregates";
import { jsonLdScript } from "@/lib/seo/jsonld";

export const metadata = buildPageMetadata({
  title: "공개 집계 API — 누구집 실거래 집계를 JSON 으로",
  description:
    "누구집이 국토교통부 실거래 신고 자료로 만든 아파트 매매 월간 지역 집계를 인증 없이 JSON 으로 제공합니다. 엔드포인트·파라미터·인용 조건·한계를 공개합니다.",
  path: "/developers",
});

/* N20 — 공개 집계 JSON API 문서.
   이 페이지는 정적이다(데이터 페칭 없음). 수치는 적지 않고 규약만 적는다 —
   수치를 여기 적으면 갱신되지 않아 곧 거짓이 된다. 실제 값은 API 가 답한다.

   상수(MAX_LIMIT·DEFAULT_LIMIT·라이선스)는 API 구현과 같은 모듈에서 가져온다.
   문서와 구현이 따로 놀면 문서가 거짓말을 하기 때문이다. */

const BASE = "https://nuguzip.com/api/public/v1";

type Endpoint = {
  path: string;
  title: string;
  desc: string;
  params?: { name: string; desc: string }[];
  example: string;
};

const ENDPOINTS: Endpoint[] = [
  {
    path: "/api/public/v1",
    title: "API 목차",
    desc: "제공 중인 엔드포인트와 파라미터, 호출 한도를 JSON 으로 돌려줍니다. 이 문서를 읽지 않아도 여기서 나머지를 찾을 수 있습니다.",
    example: `curl ${BASE}`,
  },
  {
    path: "/api/public/v1/months",
    title: "집계가 존재하는 월 목록",
    desc: "월별로 집계된 지역 수와 총 거래 건수를 최신순으로 돌려줍니다. 어느 구간을 요청할 수 있는지 먼저 확인하는 자리입니다.",
    example: `curl ${BASE}/months`,
  },
  {
    path: "/api/public/v1/regions/monthly",
    title: "지역×월 집계",
    desc: "시군구 단위 월간 집계입니다. 거래 건수, 평균 거래가, 평당가, 전월 대비 변동률을 포함합니다.",
    params: [
      { name: "month", desc: `yyyymm 6자리. 생략하면 전체 월을 최신순으로 반환합니다.` },
      { name: "region", desc: "지역명 부분 일치. 예: region=강남" },
      { name: "limit", desc: `1~${MAX_LIMIT} (기본 ${DEFAULT_LIMIT})` },
      { name: "offset", desc: "0 이상. 응답의 total·hasMore 로 다음 페이지 여부를 판단합니다." },
    ],
    example: `curl "${BASE}/regions/monthly?month=202605&region=강남&limit=20"`,
  },
];

/* 응답 필드 — 이름과 뜻을 한 번만 정의하고 표로 렌더한다. */
const FIELDS: { name: string; desc: string }[] = [
  { name: "regionCode", desc: "법정동 코드 앞 5자리(시군구)" },
  { name: "regionName", desc: "국토교통부 신고 자료 표기 그대로의 지역명" },
  { name: "month", desc: "집계 기준월 (yyyymm)" },
  { name: "transactionCount", desc: "해당 월 신고된 매매 건수 (해제 신고분 제외)" },
  { name: "avgDealAmountKrw", desc: "평균 거래금액(원). 면적·층 가중 없는 단순 평균" },
  { name: "avgPricePerPyeongKrw", desc: "평당 평균가(원)" },
  { name: "trendDeltaPct", desc: "전월 대비 평균 거래가 변동률(%)" },
  { name: "updatedAt", desc: "이 행이 마지막으로 갱신된 시각(ISO 8601)" },
  {
    name: "provisional",
    desc: "true 이면 신고 지연으로 아직 값이 늘어날 수 있는 달(이번 달·직전 달)입니다",
  },
  { name: "license", desc: "출처·인용 조건. 모든 응답 본문에 함께 실립니다" },
];

const QA: { q: string; a: string }[] = [
  {
    q: "인증 키가 필요한가요?",
    a: "필요 없습니다. 인증 없이 GET 으로 호출할 수 있고 CORS 가 열려 있어 브라우저에서 바로 부를 수 있습니다. 대신 IP 당 분당 120회 제한이 있으며, 초과하면 429 를 반환합니다.",
  },
  {
    q: "데이터를 어디까지 공개하나요?",
    a: "국토교통부 실거래 신고 자료로 만든 아파트 매매(trade/apartment)의 시군구×월 집계만 공개합니다. 개별 실거래 행(단지·동·층·계약일 단위), 전월세 집계, 이용자가 작성한 임장노트·회원·모임 데이터는 API 에 포함되지 않습니다. 화면에 공개되지 않은 것을 API 로 먼저 열지 않는다는 원칙입니다.",
  },
  {
    q: "조회에 실패하면 어떤 응답이 오나요?",
    a: "빈 배열이 아니라 503 과 error.code=upstream_unavailable 이 옵니다. \"데이터가 없다\"와 \"조회가 실패했다\"는 다른 사실이고, 실패를 빈 값으로 돌려주면 받아 간 쪽이 \"그 달에 거래가 없었다\"고 잘못 인용하게 되기 때문입니다. 요청 자체가 잘못된 경우(월 형식 오류 등)는 400 과 함께 무엇이 왜 틀렸는지 적어 보냅니다.",
  },
  {
    q: "최근 달 거래 건수가 유난히 적은데 맞나요?",
    a: "실거래 신고 기한이 계약일로부터 30일이라 이번 달과 직전 달은 아직 채워지는 중입니다. 해당 행에는 provisional: true 가 붙습니다. 이 값으로 \"거래가 급감했다\"고 해석하면 안 됩니다.",
  },
  {
    q: "얼마나 자주 갱신되나요?",
    a: "수집 크론이 하루 두 번(한국시간 09:00·18:00 전후) 돌고 그 뒤 집계를 갱신합니다. 응답은 CDN 에서 최대 1시간 캐시되며, 각 행의 updatedAt 으로 실제 갱신 시각을 확인할 수 있습니다.",
  },
  {
    q: "상업적으로 써도 되나요?",
    a: "출처를 표기하면 상업적 이용을 포함해 자유롭게 쓸 수 있습니다. 원자료는 국토교통부 공개 자료이고, 누구집은 그 위의 집계를 제공합니다. 표기 예: \"누구집(nuguzip.com) 집계, 국토교통부 실거래 기반, 2026년 5월 기준\". 다만 집계 방식의 한계(단순 평균·신고 지연)를 함께 밝혀 주시기를 권합니다.",
  },
  {
    q: "엔드포인트가 바뀔 수도 있나요?",
    a: "경로에 v1 이 들어 있습니다. 필드를 추가하는 변경은 v1 안에서 하지만, 기존 필드의 이름·의미를 바꾸거나 없애는 변경은 v2 로 분리합니다. 중단이 필요하면 이 페이지에 먼저 공지합니다.",
  },
];

function jsonLd() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebAPI",
        name: "누구집 공개 집계 API",
        description:
          "국토교통부 실거래 신고 자료로 만든 아파트 매매 월간 지역 집계를 인증 없이 제공하는 JSON API",
        documentation: "https://nuguzip.com/developers",
        url: BASE,
        provider: { "@type": "Organization", name: "누구집", url: "https://nuguzip.com" },
        termsOfService: "https://nuguzip.com/legal/terms",
      },
      {
        "@type": "FAQPage",
        mainEntity: QA.map((x) => ({
          "@type": "Question",
          name: x.q,
          acceptedAnswer: { "@type": "Answer", text: x.a },
        })),
      },
    ],
  };
}

export default function DevelopersPage() {
  return (
    <PageShell breadcrumb="공개 집계 API">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd()) }}
      />
      <div className="mx-auto max-w-[760px]">
        <h1 className="rise-in text-[24px] font-extrabold text-ink">공개 집계 API</h1>
        <p className="rise-in-1 mt-2 text-[14px] leading-[1.7] text-text-2">
          누구집(nuguzip.com)은 국토교통부 실거래 신고 자료로 만든 아파트 매매 월간 지역
          집계를 인증 없이 JSON 으로 제공합니다. 사이트 화면에 이미 공개된 수치와 같은
          값이며, 출처를 표기하면 누구나 쓸 수 있습니다.
        </p>

        <section className="rise-in-2 card mt-6 rounded-[18px] p-6">
          <h2 className="text-[16px] font-extrabold text-ink">시작하기</h2>
          <p className="mt-2 text-[13px] leading-[1.75] text-text-1">
            키 발급도 등록도 없습니다. 아래 한 줄이면 최신 월의 집계가 나옵니다.
          </p>
          <pre className="mt-3 overflow-x-auto rounded-[12px] bg-bg p-3 text-[12px] leading-[1.6] text-text-1">
            <code>{`curl "${BASE}/regions/monthly?limit=5"`}</code>
          </pre>
          <p className="mt-2 text-[12px] leading-[1.7] text-text-3">
            기본 주소: <code className="text-text-2">{BASE}</code> · 응답은 UTF-8 JSON ·
            IP 당 분당 120회
          </p>
        </section>

        <section className="rise-in-3 mt-6">
          <h2 className="text-[16px] font-extrabold text-ink">엔드포인트</h2>
          <div className="mt-3 flex flex-col gap-4">
            {ENDPOINTS.map((e) => (
              <div key={e.path} className="card rounded-[18px] p-6">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-[6px] bg-primary/10 px-2 py-0.5 text-[11px] font-extrabold text-primary">
                    GET
                  </span>
                  <code className="text-[13px] font-bold text-ink">{e.path}</code>
                </div>
                <p className="mt-1 text-[13px] font-bold text-ink">{e.title}</p>
                <p className="mt-1 text-[13px] leading-[1.75] text-text-1">{e.desc}</p>
                {e.params ? (
                  <ul className="mt-3 flex flex-col gap-1">
                    {e.params.map((p) => (
                      <li key={p.name} className="text-[12px] leading-[1.7] text-text-2">
                        <code className="font-bold text-ink">{p.name}</code> — {p.desc}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <pre className="mt-3 overflow-x-auto rounded-[12px] bg-bg p-3 text-[12px] leading-[1.6] text-text-1">
                  <code>{e.example}</code>
                </pre>
              </div>
            ))}
          </div>
        </section>

        <section className="card mt-6 rounded-[18px] p-6">
          <h2 className="text-[16px] font-extrabold text-ink">응답 필드</h2>
          <ul className="mt-3 flex flex-col gap-1">
            {FIELDS.map((f) => (
              <li key={f.name} className="text-[12px] leading-[1.75] text-text-2">
                <code className="font-bold text-ink">{f.name}</code> — {f.desc}
              </li>
            ))}
          </ul>
        </section>

        <section className="card mt-6 rounded-[18px] p-6">
          <h2 className="text-[16px] font-extrabold text-ink">상태 코드</h2>
          <ul className="mt-3 flex flex-col gap-1 text-[12px] leading-[1.75] text-text-2">
            <li>
              <code className="font-bold text-ink">200</code> — 정상. 조건에 맞는 행이 하나도
              없으면 rows 가 빈 배열이며, 이는 “그 조건의 데이터가 없다”는 사실입니다.
            </li>
            <li>
              <code className="font-bold text-ink">400</code> — 요청이 잘못됐습니다. 무엇이 왜
              틀렸는지 error.message 와 error.hint 에 적습니다.
            </li>
            <li>
              <code className="font-bold text-ink">429</code> — 호출 한도 초과. Retry-After 를
              참고해 다시 시도해 주세요.
            </li>
            <li>
              <code className="font-bold text-ink">503</code> — 저희가 조회에 실패했습니다.
              데이터가 없다는 뜻이 <b>아닙니다</b>. 잠시 후 다시 호출하면 성공할 수 있습니다.
            </li>
          </ul>
        </section>

        <section className="card mt-6 rounded-[18px] p-6">
          <h2 className="text-[16px] font-extrabold text-ink">인용 조건</h2>
          <p className="mt-2 text-[13px] leading-[1.75] text-text-1">
            출처를 표기하면 상업적 이용을 포함해 자유롭게 쓸 수 있습니다. 같은 내용이 모든
            응답의 <code>license</code> 필드에도 실려 있어, 문서를 보지 않고 API 만 쓴 경우에도
            출처가 함께 이동합니다.
          </p>
          <div className="mt-3 rounded-[12px] bg-bg p-3 text-[12px] leading-[1.7] text-text-1">
            누구집(nuguzip.com) 집계, {PUBLIC_API_LICENSE.sources[0].name} 자료 기반, ○○○○년
            ○월 기준
          </div>
          <p className="mt-3 text-[12px] leading-[1.7] text-text-3">
            집계 방식과 한계는{" "}
            <Link href="/methodology" className="font-bold text-primary">
              데이터 방법론
            </Link>
            에 적혀 있습니다. 평균은 면적·층을 가중하지 않은 단순 평균이며, 최근 1~2개월
            수치는 신고 지연으로 계속 늘어납니다 — 인용하실 때 함께 밝혀 주세요.
          </p>
        </section>

        <section className="card mt-6 rounded-[18px] p-6">
          <h2 className="text-[16px] font-extrabold text-ink">자주 묻는 질문</h2>
          <div className="mt-3 flex flex-col gap-4">
            {QA.map((x) => (
              <div key={x.q}>
                <h3 className="text-[13px] font-extrabold text-ink">{x.q}</h3>
                <p className="mt-1 text-[13px] leading-[1.75] text-text-1">{x.a}</p>
              </div>
            ))}
          </div>
        </section>

        <div className="mt-6 rounded-[14px] bg-bg p-4 text-[11px] leading-[1.7] text-text-3">
          제공 범위·한도는 서비스 사정에 따라 바뀔 수 있으며, 바뀌면 이 페이지를 먼저
          갱신합니다. 데이터 오류 제보와 이용 문의는{" "}
          <Link href="/support" className="font-bold text-primary">
            고객센터
          </Link>
          로 부탁드립니다.
        </div>
      </div>
    </PageShell>
  );
}
