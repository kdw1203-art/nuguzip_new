import Link from "next/link";
import { PageShell } from "../../components/PageShell";
import { AIPanel } from "../../components/AIPanel";

/* 시안 6p(전문가 상담 데스크탑) + 8n(전문가 프로필 상세) + 9o(프로필 확장) */

const EXPERT_FILTERS = ["중개사", "세무사", "감정평가사"];

const EXPERTS = [
  {
    name: "김OO 공인중개사",
    region: "안양 관양동 · 경력 12년",
    tags: ["재건축", "1기 신도시"],
    rating: "★ 4.9 (128)",
    response: "응답 평균 2시간",
    reports: "리포트 8",
  },
  {
    name: "이OO 세무사",
    region: "서울 전역 · 경력 9년",
    tags: ["취득세", "양도세 절세"],
    rating: "★ 4.8 (86)",
    response: "응답 평균 4시간",
    reports: "리포트 3",
  },
];

const STATS = [
  { label: "상담 완료", value: "342건", accent: false },
  { label: "재상담률", value: "38%", accent: true },
  { label: "커뮤니티 답변", value: "1,204개", accent: false },
  { label: "채택률", value: "61%", accent: true },
  { label: "리포트 누적 판매", value: "847부", accent: false },
];

const ANSWERS = [
  {
    q: "Q. 공작 재건축 추진위 실체가 있나요?",
    adopted: true,
    a: "A. 예비추진위 단계입니다. 동의율 30%대로 아직 초기…",
  },
  {
    q: "Q. 관양동 급매 협상 여지 어느 정도?",
    adopted: false,
    a: "A. 최근 3건 기준 호가 대비 1.5~2.5% 선에서 타결…",
  },
  {
    q: "Q. 도로변 동 소음, 창호 교체로 해결되나요?",
    adopted: true,
    a: "A. 302동 기준 2중 창호로 5dB가량 낮아지지만 발코니…",
  },
];

const CAREERS = [
  { label: "공인중개사 (제11-XXXX호)", check: "서류 확인 ✓", verified: true },
  { label: "관양부동산 대표 (2014~)", check: "사업자 확인 ✓", verified: true },
  {
    label: "OO은행 부동산금융부 (2009–2014)",
    check: "자기 기재",
    verified: false,
  },
  { label: "동안구 중개사협회 이사", check: "자기 기재", verified: false },
];

export default function TownExpertsPage() {
  return (
    <PageShell breadcrumb="동네이야기 › 전문가">
      {/* ---------- 6p 전문가 목록 ---------- */}
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="rise-in text-[26px] font-extrabold text-ink">
            검증된 전문가
          </h1>
          <p className="mt-1.5 text-sm text-text-2">
            자격 검증 완료 · 내 임장노트를 첨부해 바로 질문하세요
          </p>
        </div>
        <div className="flex gap-1.5 text-[13px]">
          {EXPERT_FILTERS.map((f, i) => (
            <span
              key={f}
              className={`chip px-3.5 py-2 ${
                i === 0
                  ? "chip-active"
                  : "bg-[rgba(255,255,255,.7)] text-text-2"
              }`}
            >
              {f}
            </span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {EXPERTS.map((e, i) => (
          <div
            key={e.name}
            className={`card card-hover rise-in-${i + 1} flex flex-col gap-3 rounded-[20px] p-[22px]`}
          >
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-full bg-gradient-to-br from-[#e2e8f2] to-[#eef2f8]" />
              <div className="flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-[15px] font-extrabold text-ink">
                    {e.name}
                  </span>
                  <span className="rounded-[5px] bg-[#edf2fe] px-[7px] py-px text-[10px] font-extrabold text-primary">
                    인증
                  </span>
                </div>
                <div className="text-xs text-text-3">{e.region}</div>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {e.tags.map((t) => (
                <span
                  key={t}
                  className="rounded-full bg-[#f2f4f8] px-2.5 py-1 text-[11px] text-text-2"
                >
                  {t}
                </span>
              ))}
            </div>
            <div className="flex justify-between text-xs text-text-3">
              <span>{e.rating}</span>
              <span>{e.response}</span>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                className="btn-primary flex-1 rounded-xl p-[11px] text-[13px]"
              >
                상담 신청
              </button>
              <Link
                href="/town/market"
                className="btn-secondary flex-1 rounded-xl p-[11px] text-center text-[13px]"
              >
                {e.reports}
              </Link>
            </div>
          </div>
        ))}

        {/* 전문가 등록 CTA */}
        <div className="rise-in-3 flex flex-col items-center justify-center gap-2.5 rounded-[20px] border-[1.5px] border-dashed border-[#a9bde8] bg-[rgba(29,79,216,.06)] p-[22px] text-center">
          <div className="text-[15px] font-extrabold text-primary">
            전문가이신가요?
          </div>
          <p className="text-[13px] leading-[1.6] text-[#5b74b8]">
            자격 인증 후 상담·리포트로
            <br />
            수익을 만들 수 있어요
          </p>
          <button
            type="button"
            className="btn-primary btn-cta rounded-xl px-[22px] py-[11px] text-[13px]"
          >
            전문가 등록
          </button>
        </div>
      </div>

      {/* ---------- 8n 프로필 상세 ---------- */}
      <div className="mt-8 mb-3 flex items-center justify-between">
        <div className="text-[13px] text-text-3">전문가 › 김OO 공인중개사</div>
        <div className="flex gap-2 text-[13px]">
          <Link
            href="/messages"
            className="rounded-[10px] bg-[rgba(255,255,255,.7)] px-3.5 py-2 font-semibold text-text-2"
          >
            쪽지
          </Link>
          <button
            type="button"
            className="btn-primary btn-cta rounded-[10px] px-4 py-2"
          >
            상담 신청
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-[340px_1fr]">
        <div className="flex flex-col gap-4">
          <div className="rise-in card flex flex-col items-center gap-3.5 rounded-[20px] p-6 text-center">
            <div className="h-[76px] w-[76px] rounded-full bg-gradient-to-br from-[#e2e8f2] to-[#eef2f8]" />
            <div>
              <div className="flex items-center justify-center gap-1.5">
                <span className="text-lg font-extrabold text-ink">김OO</span>
                <span className="rounded-[5px] bg-[#edf2fe] px-2 py-px text-[10px] font-extrabold text-primary">
                  인증 중개사
                </span>
              </div>
              <div className="mt-1 text-xs text-text-3">
                관양부동산 대표 · 경력 12년
              </div>
            </div>
            <div className="flex w-full gap-2">
              {[
                { v: "4.9", l: "평점 128", accent: false },
                { v: "342", l: "상담 완료", accent: false },
                { v: "2h", l: "평균 응답", accent: true },
              ].map((s) => (
                <div key={s.l} className="flex-1 rounded-xl bg-bg p-2.5">
                  <div
                    className={`text-[15px] font-extrabold ${
                      s.accent ? "text-primary" : "text-ink"
                    }`}
                  >
                    {s.v}
                  </div>
                  <div className="text-[10px] text-text-3">{s.l}</div>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap justify-center gap-1.5">
              {["재건축", "1기 신도시", "갈아타기"].map((t) => (
                <span
                  key={t}
                  className="rounded-full bg-[#f2f4f8] px-2.5 py-1 text-[11px] text-text-2"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>

          <div className="rise-in-1 card flex flex-col gap-2 rounded-[18px] p-[18px]">
            <div className="text-[13px] font-extrabold text-ink">인증 정보</div>
            <div className="flex justify-between text-xs">
              <span className="text-text-2">공인중개사 자격</span>
              <span className="font-bold text-primary">
                ✓ 확인 (제11-XXXX호)
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-text-2">사업자 등록</span>
              <span className="font-bold text-primary">✓ 확인</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-text-2">활동 지역</span>
              <span className="font-bold text-text-1">안양 동안구</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="rise-in-1 card flex flex-col gap-2.5 rounded-[20px] p-[22px]">
            <div className="text-[15px] font-extrabold text-ink">상담 상품</div>
            <div className="flex items-center justify-between rounded-[14px] bg-bg px-4 py-3.5">
              <div>
                <div className="text-sm font-bold text-ink">
                  임장노트 리뷰 상담 (30분 통화)
                </div>
                <div className="mt-0.5 text-[11px] text-text-3">
                  노트 첨부 시 사전 검토 포함
                </div>
              </div>
              <span className="text-[15px] font-extrabold text-ink">
                30,000원
              </span>
            </div>
            <div className="flex items-center justify-between rounded-[14px] bg-bg px-4 py-3.5">
              <div>
                <div className="text-sm font-bold text-ink">
                  동행 임장 (2시간)
                </div>
                <div className="mt-0.5 text-[11px] text-text-3">
                  관양동 한정 · 주말 가능
                </div>
              </div>
              <span className="text-[15px] font-extrabold text-ink">
                100,000원
              </span>
            </div>
          </div>

          <div className="rise-in-2 card flex flex-col gap-2.5 rounded-[20px] p-[22px]">
            <div className="flex items-baseline justify-between">
              <div className="text-[15px] font-extrabold text-ink">
                발행 리포트 8
              </div>
              <Link
                href="/town/market"
                className="text-xs font-semibold text-primary"
              >
                전체
              </Link>
            </div>
            <div className="flex justify-between border-b border-[#f0f3f8] py-[9px] text-[13px]">
              <span className="font-bold text-ink">관양동 재건축 흐름 분석</span>
              <span className="font-extrabold text-text-1">
                9,900원 · 214구매
              </span>
            </div>
            <div className="flex justify-between py-[9px] text-[13px]">
              <span className="font-bold text-ink">
                평촌 학원가 아파트 실전 가이드
              </span>
              <span className="font-extrabold text-text-1">
                7,900원 · 156구매
              </span>
            </div>
          </div>

          <div className="rise-in-3 card flex flex-col gap-2.5 rounded-[20px] p-[22px]">
            <div className="text-[15px] font-extrabold text-ink">최근 후기</div>
            <div className="rounded-xl bg-bg px-3.5 py-3 text-[13px] leading-[1.6] text-text-1">
              ★5.0 “노트 첨부하고 상담받으니 30분이 알찼어요. 협상 포인트 3개를
              콕 집어주심.” <span className="text-text-3">— 첫집준비중 · 7.14</span>
            </div>
          </div>
        </div>
      </div>

      {/* ---------- 9o 프로필 확장: 활동 통계 · 답변 이력 · 경력 검증 ---------- */}
      <div className="mt-8 mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="text-[13px] text-text-3">
          전문가 › 김OO 공인중개사 › 활동
        </div>
        <div className="flex gap-1.5 text-xs">
          {["활동 통계", "답변 이력", "경력·자격"].map((t, i) => (
            <span
              key={t}
              className={`chip px-3.5 py-[7px] ${
                i === 0
                  ? "chip-active"
                  : "bg-[rgba(255,255,255,.7)] text-text-2"
              }`}
            >
              {t}
            </span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {STATS.map((s) => (
          <div key={s.label} className="card rounded-[14px] p-4">
            <div className="text-[11px] text-text-3">{s.label}</div>
            <div
              className={`mt-[3px] text-xl font-extrabold ${
                s.accent ? "text-primary" : "text-ink"
              }`}
            >
              {s.value}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3.5 grid grid-cols-1 gap-3.5 md:grid-cols-2">
        <div className="card flex flex-col gap-2.5 rounded-[18px] p-5">
          <div className="text-sm font-extrabold text-ink">최근 답변 이력</div>
          {ANSWERS.map((a, i) => (
            <div
              key={a.q}
              className={`flex flex-col gap-1 py-[9px] ${
                i < ANSWERS.length - 1 ? "border-b border-[#f0f3f8]" : ""
              }`}
            >
              <div className="text-xs text-text-3">
                {a.q}{" "}
                {a.adopted && (
                  <span className="rounded bg-[#edf2fe] px-1.5 py-px text-[10px] font-extrabold text-primary">
                    채택
                  </span>
                )}
              </div>
              <div className="text-xs leading-[1.5] text-text-1">{a.a}</div>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-3.5">
          <div className="card flex flex-col gap-2 rounded-[18px] p-5">
            <div className="text-sm font-extrabold text-ink">
              경력 · 자격{" "}
              <span className="rounded bg-[#edf2fe] px-[7px] py-[2px] text-[10px] font-extrabold text-primary">
                플랫폼 검증
              </span>
            </div>
            {CAREERS.map((c, i) => (
              <div
                key={c.label}
                className={`flex justify-between py-[7px] text-xs ${
                  i < CAREERS.length - 1 ? "border-b border-[#f0f3f8]" : ""
                }`}
              >
                <span className="text-text-2">{c.label}</span>
                <span
                  className={`font-bold ${
                    c.verified ? "text-primary" : "text-text-3"
                  }`}
                >
                  {c.check}
                </span>
              </div>
            ))}
          </div>

          <AIPanel title="활동 지표 요약 (AI)">
            응답 속도 상위 5% · 재건축 분야 채택률 1위(동안구) · 부정 후기
            0.8%. 신뢰 지표가 꾸준히 상승 중인 전문가입니다.
          </AIPanel>
        </div>
      </div>
    </PageShell>
  );
}
