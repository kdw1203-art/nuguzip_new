import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/app/components/PageShell";
import { seoAlternates } from "@/lib/seo/alternates";

/* [945 · 실사용50 #33] 데이터 출처·갱신 주기·한계 — 한 장짜리 신뢰 문서.
   화면 곳곳의 각주("국토부 신고 기준" 등)를 한 페이지로 모은다.
   갱신 주기는 실제 파이프라인(etl.yml·크론) 기준으로 적는다 — 여기 적힌
   주기와 코드가 어긋나면 코드가 아니라 이 페이지를 고칠 일이 먼저인지 본다.
   계산 공식은 /methodology 가 원천이다(중복 서술 금지 — 링크로 넘긴다). */

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "데이터 출처와 한계 | 내집나우",
  description:
    "내집나우가 사용하는 데이터의 원천(국토교통부·한국부동산원·KB·온비드·청약홈 등), 갱신 주기, 알려진 한계, AI 생성·추정 콘텐츠 라벨 정책을 공개합니다.",
  alternates: seoAlternates("/data-sources"),
};

type SourceRow = {
  name: string;
  origin: string;
  cadence: string;
  used: string;
  limits: string;
};

const SOURCES: SourceRow[] = [
  {
    name: "아파트 실거래 (매매·전월세)",
    origin: "국토교통부 실거래가 공개시스템 (공공데이터포털)",
    cadence: "매일 수집",
    used: "지도 시세, 단지 실거래 추이, 신고가 소식, 관심단지 알림",
    limits:
      "신고는 계약 후 30일 이내라 최신 계약이 늦게 보일 수 있음. 해제(취소) 신고분은 집계에서 제외. 호가가 아니라 신고가만 실음.",
  },
  {
    name: "시세 지수",
    origin: "한국부동산원 주간·월간 지수, KB 시세",
    cadence: "매일 확인 (발표는 기관 일정 — 주간·월간)",
    used: "지역 페이지 지수 추이, 홈 시장 브리핑, 주간 시황 글",
    limits: "표본 기반 상대지수 — 개별 단지 가격이 아님. 두 기관 값은 조사 방식 차이로 다를 수 있음.",
  },
  {
    name: "공매 물건",
    origin: "온비드 (한국자산관리공사)",
    cadence: "매일 동기화 (수도권·5대 광역시)",
    used: "지도 공매 레이어, 공매 목록",
    limits: "진행 상태·최저가는 회차에 따라 변동 — 입찰 전 온비드 원문 확인 필수. 권리분석은 제공하지 않음.",
  },
  {
    name: "분양·입주 예정",
    origin: "청약홈 분양공고",
    cadence: "매일 수집",
    used: "청약 캘린더, 지역 입주 예정 물량, 동네 브리핑",
    limits: "입주 시기는 공고 기준 예정 — 실제 입주는 지연될 수 있음.",
  },
  {
    name: "정비사업 (재개발·재건축)",
    origin: "서울 열린데이터광장",
    cadence: "주기 확인 (원천 갱신이 비정기)",
    used: "지도·지역의 정비사업 표시",
    limits: "서울만 제공. 단계 표기는 고시 반영 시차가 있음.",
  },
  {
    name: "부동산 뉴스",
    origin: "언론사 공개 기사 (출처·원문 링크 명기)",
    cadence: "매일 08:00 수집",
    used: "동네 뉴스, 뉴스 요약(AI), 주간 다이제스트",
    limits: "요약은 AI 생성물 — 원문이 항상 우선. 전문은 싣지 않고 링크로 안내.",
  },
  {
    name: "학교·지하철 위치",
    origin: "공공데이터포털 (활용신청 승인 대기 중)",
    cadence: "승인 후 주기 동기화 예정",
    used: "지도 학교·지하철 레이어",
    limits: "승인 전에는 레이어가 '준비 중'으로 표시됨 — 없는 데이터를 그리지 않음.",
  },
  {
    name: "거시 지표 (금리 등)",
    origin: "한국은행 ECOS, KOSIS",
    cadence: "매일 확인 (발표는 기관 일정)",
    used: "AI 분석 컨텍스트, 경제지표 알림",
    limits: "발표 지연·개정치 반영 시차 존재.",
  },
  {
    name: "시장 온도",
    origin: "내집나우 자체 산출 (실거래·지수·거래량 합성)",
    cadence: "주 1회 스냅샷",
    used: "지도 온도 레이어, 지역 카드",
    limits: "자체 지표 — 공식 통계가 아니며 산출식은 방법론 페이지에 공개.",
  },
  {
    name: "임장노트·동네 글",
    origin: "사용자 작성 (사람)",
    cadence: "실시간",
    used: "임장노트, 동네이야기, 단지 Q&A",
    limits: "개인 경험·의견 — 사실 검증 대상이 아님. 자동 발행 글은 아래 라벨 정책대로 구분 표시.",
  },
];

const AI_POLICY: Array<{ label: string; rule: string }> = [
  {
    label: "“AI 생성” 배지",
    rule: "노트 요약·뉴스 요약 등 LLM이 만든 문장에는 AI 생성 표시를 붙입니다. 규칙 기반 요약은 별도로 구분합니다.",
  },
  {
    label: "“AI 추정 (현장 확인 전)” 라벨",
    rule: "AI가 제안한 체크 점수·만족도에는 추정 라벨과 산출 근거 한 줄이 반드시 함께 보입니다. 근거를 서술하지 못한 점수는 서버가 버립니다.",
  },
  {
    label: "봇 명의 자동 글",
    rule: "주간 시황·동네 데이터 브리핑 등 자동 발행 글은 자동 집계 계정 명의로만 올라가며(is_automated), 사람 글로 위장하지 않습니다. 가짜 이웃 글·가짜 후기는 만들지 않습니다.",
  },
  {
    label: "숫자에는 출처·시점",
    rule: "AI가 언급하는 수치는 수집된 실데이터 컨텍스트 안의 값만 허용하고, 출처와 기준 시점을 함께 표기합니다. 컨텍스트에 없는 수치를 지어내는 것은 차단 대상 결함으로 다룹니다.",
  },
  {
    label: "투자 권유 금지",
    rule: "모든 AI 출력에는 참고용 고지가 붙고, 매수·매도 권유 문장은 생성 단계에서 금지됩니다. 투자 판단의 책임은 이용자 본인에게 있습니다.",
  },
];

export default function DataSourcesPage() {
  return (
    <PageShell breadcrumb="데이터 출처">
      <div className="mx-auto w-full max-w-[760px]">
        <h1 className="rise-in text-[24px] font-extrabold leading-[1.3] text-ink">
          이 숫자, 어디서 왔나요
        </h1>
        <p className="rise-in-1 mt-2 t-body leading-[1.75] text-text-2">
          내집나우의 모든 수치는 아래 원천에서 자동 수집됩니다. 각 원천의 갱신 주기와
          <b className="text-ink"> 알려진 한계</b>까지 함께 적습니다 — 한계를 모르는 숫자는
          틀린 숫자보다 위험하기 때문입니다. 계산 공식이 궁금하면{" "}
          <Link href="/methodology" className="font-bold text-primary">
            데이터 방법론
          </Link>
          을 보세요.
        </p>

        <div className="rise-in-2 mt-6 flex flex-col gap-3">
          {SOURCES.map((s) => (
            <section key={s.name} className="rounded-2xl border border-line bg-surface p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <h2 className="t-body font-extrabold text-ink">{s.name}</h2>
                <span className="t-caption font-bold text-primary">{s.cadence}</span>
              </div>
              <p className="mt-1 t-sub text-text-2">
                <span className="font-bold text-text-1">원천</span> {s.origin}
              </p>
              <p className="mt-0.5 t-sub text-text-2">
                <span className="font-bold text-text-1">쓰이는 곳</span> {s.used}
              </p>
              <p className="mt-1.5 t-sub leading-[1.65] text-text-3">
                <span className="font-bold">한계</span> — {s.limits}
              </p>
            </section>
          ))}
        </div>

        <section className="mt-8">
          <h2 className="text-[19px] font-extrabold text-ink">AI 콘텐츠 라벨 정책</h2>
          <p className="mt-1.5 t-body leading-[1.7] text-text-2">
            내집나우는 AI가 만든 것과 사람이 쓴 것, 실측과 추정을 화면에서 구분합니다.
            이 정책은 코드 게이트로 강제됩니다 — 라벨 없는 AI 수치는 배포 단계에서 막힙니다.
          </p>
          <div className="mt-3 flex flex-col gap-2">
            {AI_POLICY.map((p) => (
              <div key={p.label} className="rounded-2xl border border-line bg-surface px-4 py-3">
                <div className="t-body font-extrabold text-ink">{p.label}</div>
                <p className="mt-1 t-sub leading-[1.65] text-text-2">{p.rule}</p>
              </div>
            ))}
          </div>
        </section>

        <p className="mt-8 t-caption leading-[1.7] text-text-3">
          갱신 주기는 수집 파이프라인 기준이며, 원천 기관의 발표 일정에 따라 실제 최신
          시점은 다를 수 있습니다. 파이프라인이 멈추면 내부 신선도 감시가 경보를
          울리고, 각 화면은 마지막 갱신 시점을 함께 표기합니다. 문의:{" "}
          <Link href="/support" className="font-bold text-primary">
            고객센터
          </Link>
        </p>
      </div>
    </PageShell>
  );
}
