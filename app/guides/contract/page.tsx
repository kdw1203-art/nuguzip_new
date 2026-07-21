import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/app/components/PageShell";
import { Icon } from "@/app/components/Icon";

/* ============================================================
   항목 F30 — 계약 전 체크리스트 & 표준계약·특약 가이드 (정보성 콘텐츠)
   단계별 확인사항 / 표준계약서 핵심 조항 / 자주 쓰는 특약 예시 /
   등기부·건축물대장 확인 포인트. 실제 계약은 공인중개사·법무사 검토 권고.
   ============================================================ */

export const metadata: Metadata = {
  title: "계약 전 체크리스트 & 표준계약·특약 가이드 | 누구집",
  description:
    "가계약부터 잔금·입주까지 단계별 확인사항, 임대차·매매 표준계약서 핵심 조항, 자주 쓰는 특약 예시, 등기부·건축물대장 확인 포인트를 정리한 계약 가이드입니다.",
};

/* ── 계약 단계 (가계약 → 계약 → 중도금 → 잔금 → 입주) ── */
const STAGES: { name: string; desc: string }[] = [
  {
    name: "가계약",
    desc: "매물을 잡기 위해 소액을 먼저 거는 단계예요. 걸기 전에 등기부·시세·조건을 확인하고, 가계약금 반환 조건(계약 불성립 시)을 문자·계약서로 명확히 남기세요.",
  },
  {
    name: "계약 (본계약)",
    desc: "표준계약서를 작성하고 보통 매매대금·보증금의 10% 안팎을 계약금으로 지급해요. 소유자 신분증과 등기부상 소유자 일치를 확인하고 특약을 빠짐없이 적으세요.",
  },
  {
    name: "중도금",
    desc: "중도금을 지급하면 이행에 착수한 것으로 보아 일방적 계약 해제가 어려워져요. 자금 계획과 대출 실행 일정을 미리 점검하세요.",
  },
  {
    name: "잔금",
    desc: "잔금일에 등기부를 다시 열람해 근저당 등 권리변동을 확인하고, 소유권 이전 등기를 접수해요. 관리비·공과금 정산도 이때 마무리해요.",
  },
  {
    name: "입주",
    desc: "임차인은 전입신고와 확정일자를 바로 받아 대항력·우선변제권을 확보하세요. 시설·하자를 점검하고 열쇠·설비를 인수해요.",
  },
];

/* ── 표준계약서 핵심 조항 ── */
type Clause = { term: string; desc: string };
const LEASE_CLAUSES: Clause[] = [
  {
    term: "보증금·차임(월세)",
    desc: "보증금·월 차임 금액과 지급일, 연체 시 처리 방식을 명확히 적습니다.",
  },
  {
    term: "계약 기간·갱신",
    desc: "임대차 기간과 함께 계약갱신요구권·묵시적 갱신 관련 사항을 확인합니다.",
  },
  {
    term: "관리비·수선 의무",
    desc: "관리비 포함 범위와 수리·수선 책임을 임대인·임차인 중 누가 부담하는지 정합니다.",
  },
  {
    term: "특약사항",
    desc: "표준 조항으로 담기 어려운 개별 약속(수리·말소·협조 등)을 명시합니다.",
  },
];
const SALE_CLAUSES: Clause[] = [
  {
    term: "매매대금·지급 일정",
    desc: "계약금·중도금·잔금의 금액과 각 지급일을 구체적으로 정합니다.",
  },
  {
    term: "소유권 이전·인도 시기",
    desc: "잔금과 동시에 소유권 이전 등기·부동산 인도가 이뤄지는 시점을 정합니다.",
  },
  {
    term: "비용 부담·하자담보책임",
    desc: "등기·세금 등 비용 부담 주체와, 인도 후 하자에 대한 책임 범위를 정합니다.",
  },
  {
    term: "위약금·해제",
    desc: "계약 해제 사유와 위약금(계약금 배액·포기 등) 처리를 명확히 합니다.",
  },
];

/* ── 자주 쓰는 특약 예시 ── */
const SPECIAL_TERMS: { title: string; example: string }[] = [
  {
    title: "근저당 말소 조건",
    example:
      "“잔금일까지 등기부상 근저당권 등 선순위 채권을 전액 상환·말소하며, 이행되지 않을 경우 매수인(임차인)은 계약을 해제할 수 있고 손해를 배상한다.”",
  },
  {
    title: "누수·하자 수리 책임",
    example:
      "“인도일 기준 이미 존재하던 누수·하자는 매도인(임대인)이 책임지고 수리하며, 인도 후 일정 기간 내 발견된 하자에 대해서도 협의하여 처리한다.”",
  },
  {
    title: "전입신고·확정일자 협조",
    example:
      "“임대인은 임차인의 전입신고·확정일자 및 전세보증금 반환보증 가입에 협조하고, 임대차 기간 중 임차인의 대항력을 해치는 담보 설정을 하지 않는다.”",
  },
  {
    title: "미납 관리비·공과금 정산",
    example:
      "“잔금일(인도일) 현재까지 발생한 미납 관리비·공과금은 매도인(임대인)이 부담하고 정산한다.”",
  },
  {
    title: "세금 완납 확인",
    example:
      "“임대인(매도인)은 계약 시 국세·지방세 완납 사실을 증명서로 제시한다.”",
  },
];

/* ── 등기부·건축물대장 확인 포인트 ── */
const DOC_CHECKS: { icon: string; title: string; lead: string; points: string[] }[] = [
  {
    icon: "file-text",
    title: "등기부등본 (등기사항전부증명서)",
    lead: "부동산의 소유관계와 권리 상태를 보여주는 가장 중요한 서류예요. 세 부분으로 나눠 살펴보세요.",
    points: [
      "표제부 — 부동산의 소재지·면적·구조 등 기본 표시가 계약서와 일치하는지 확인",
      "갑구 — 소유자, 가압류·가처분·경매 개시 등 소유권 관련 사항. 소유자와 계약 상대방이 같은지 대조",
      "을구 — 근저당권·전세권 등 담보. 선순위 채권 규모가 보증금·매매가에 비해 과도하지 않은지 확인",
    ],
  },
  {
    icon: "building",
    title: "건축물대장",
    lead: "건물의 실제 면적·용도·구조와 위법 여부를 확인하는 서류예요. 등기부만으로는 알기 어려운 정보가 담겨요.",
    points: [
      "위반건축물 표기 — 불법 증축·용도 변경으로 '위반건축물'로 적혀 있는지 확인",
      "면적·용도·층수 — 실제 사용 현황과 광고·계약 내용이 일치하는지 대조",
      "무허가·미등기 여부 — 대장에 없는 부분이 있는지 확인",
    ],
  },
];

const StepDiagram = () => (
  <section className="rise-in card rounded-2xl p-5 md:p-6">
    <div className="flex items-center gap-2.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-primary-soft text-primary">
        <Icon name="footprints" size={18} />
      </span>
      <h2 className="text-[15px] font-extrabold text-ink">
        계약 단계별 확인사항
      </h2>
    </div>
    <ol className="mt-4 flex flex-col gap-0">
      {STAGES.map((s, i) => (
        <li key={s.name} className="flex gap-3">
          <div className="flex flex-col items-center">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-extrabold text-primary">
              {i + 1}
            </span>
            {i < STAGES.length - 1 && (
              <span className="w-px flex-1 bg-[#dfe5ef]" aria-hidden="true" />
            )}
          </div>
          <div className={i < STAGES.length - 1 ? "pb-4" : ""}>
            <div className="text-[13px] font-extrabold text-ink">{s.name}</div>
            <div className="mt-0.5 text-[12px] leading-[1.7] text-text-2">
              {s.desc}
            </div>
          </div>
        </li>
      ))}
    </ol>
  </section>
);

const ClauseColumn = ({
  label,
  clauses,
}: {
  label: string;
  clauses: Clause[];
}) => (
  <div className="flex flex-col gap-2.5">
    <div className="inline-flex w-fit items-center rounded-full bg-primary-soft px-3 py-1 text-[11px] font-bold text-primary">
      {label}
    </div>
    {clauses.map((c) => (
      <div key={c.term} className="border-l-2 border-line pl-3">
        <div className="text-[13px] font-bold text-text-1">{c.term}</div>
        <div className="mt-0.5 text-[12px] leading-[1.7] text-text-3">
          {c.desc}
        </div>
      </div>
    ))}
  </div>
);

export default function ContractGuidePage() {
  return (
    <PageShell
      breadcrumb="가이드 › 계약 전 체크리스트 & 특약 가이드"
      title="계약 전 체크리스트 & 표준계약·특약 가이드"
    >
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-4">
        {/* 전문가 확인 권고 안내 */}
        <div className="rise-in flex items-start gap-3 rounded-2xl bg-primary-soft p-4">
          <Icon name="shield" size={18} className="mt-0.5 shrink-0 text-primary" />
          <p className="text-[13px] leading-[1.7] text-primary">
            아래 내용은 계약을 준비할 때 살펴볼 <b>일반적인 확인 포인트</b>예요.
            실제 계약서 작성과 특약 문구는 개별 사안에 따라 달라지므로, 서명 전
            반드시 <b>공인중개사·법무사</b>의 검토를 받으세요.
          </p>
        </div>

        {/* 1. 계약 단계별 확인사항 */}
        <StepDiagram />

        {/* 2. 표준계약서 핵심 조항 */}
        <section className="rise-in-1 card rounded-2xl p-5 md:p-6">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-primary-soft text-primary">
              <Icon name="file-text" size={18} />
            </span>
            <h2 className="text-[15px] font-extrabold text-ink">
              표준계약서 핵심 조항
            </h2>
          </div>
          <p className="mt-3 text-[13px] leading-[1.75] text-text-2">
            국토교통부 표준임대차·표준매매 계약서를 기준으로, 당사자 인적사항과
            목적물 표시(등기부와 일치)를 먼저 확인한 뒤 아래 핵심 조항을
            점검하세요.
          </p>
          <div className="mt-4 grid gap-5 sm:grid-cols-2">
            <ClauseColumn label="임대차 계약" clauses={LEASE_CLAUSES} />
            <ClauseColumn label="매매 계약" clauses={SALE_CLAUSES} />
          </div>
        </section>

        {/* 3. 자주 쓰는 특약 예시 */}
        <section className="rise-in-2 card rounded-2xl p-5 md:p-6">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-primary-soft text-primary">
              <Icon name="handshake" size={18} />
            </span>
            <h2 className="text-[15px] font-extrabold text-ink">
              자주 쓰는 특약 예시
            </h2>
          </div>
          <p className="mt-3 text-[13px] leading-[1.75] text-text-2">
            특약은 표준 조항으로 담기 어려운 개별 약속을 적는 부분이에요. 아래는
            참고용 예시 표현이며, 실제 문구는 상황에 맞게 전문가와 다듬으세요.
          </p>
          <div className="mt-4 flex flex-col gap-3">
            {SPECIAL_TERMS.map((t) => (
              <div
                key={t.title}
                className="rounded-[12px] border border-line bg-bg p-3.5"
              >
                <div className="flex items-center gap-1.5 text-[13px] font-bold text-ink">
                  <Icon name="check" size={14} className="text-primary" />
                  {t.title}
                </div>
                <p className="mt-1.5 text-[12px] leading-[1.7] text-text-2">
                  {t.example}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* 4. 등기부·건축물대장 확인 포인트 */}
        <section className="rise-in-3 card rounded-2xl p-5 md:p-6">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-primary-soft text-primary">
              <Icon name="search" size={18} />
            </span>
            <h2 className="text-[15px] font-extrabold text-ink">
              등기부·건축물대장 확인 포인트
            </h2>
          </div>
          <div className="mt-4 flex flex-col gap-4">
            {DOC_CHECKS.map((d) => (
              <div key={d.title}>
                <div className="flex items-center gap-2 text-[13px] font-extrabold text-ink">
                  <Icon name={d.icon} size={16} className="text-text-3" />
                  {d.title}
                </div>
                <p className="mt-1.5 text-[12px] leading-[1.7] text-text-2">
                  {d.lead}
                </p>
                <ul className="mt-2 flex flex-col gap-1.5">
                  {d.points.map((p) => (
                    <li
                      key={p}
                      className="flex gap-2 text-[12px] leading-[1.7] text-text-3"
                    >
                      <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-primary" />
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="mt-4 rounded-[10px] bg-[rgba(29,79,216,.06)] px-3 py-2 text-[11px] leading-[1.7] text-[#5b74b8]">
            등기부등본은 인터넷등기소(iros.go.kr), 건축물대장은 정부24(gov.kr)에서
            열람할 수 있어요. 계약~잔금 사이 권리가 바뀔 수 있으니 <b>잔금 직전에
            다시 한 번</b> 열람하세요.
          </p>
        </section>

        {/* 관련 가이드 */}
        <Link
          href="/guides/regulations"
          className="card-hover flex items-center justify-between rounded-2xl border border-line bg-surface px-5 py-4 no-underline"
        >
          <div>
            <div className="text-[13px] font-extrabold text-ink">
              부동산 규제·의무 안내
            </div>
            <div className="mt-0.5 text-[11px] text-text-2">
              규제지역·대출·세금·청약 등 계약 전 알아둘 제도 개념을 함께 확인하세요.
            </div>
          </div>
          <span className="shrink-0 rounded-[10px] bg-primary-soft px-3.5 py-2 text-xs font-bold text-primary">
            가이드 보기 ›
          </span>
        </Link>

        {/* 공통 면책 */}
        <p className="px-1 pb-2 text-[11px] leading-[1.7] text-text-3">
          본 안내는 일반 정보이며 법률·세무 자문이 아닙니다. 실제 거래·신고·세금은
          공인중개사·법무사·세무사 등 전문가와 관련 기관 확인이 필요합니다.
        </p>
      </div>
    </PageShell>
  );
}
