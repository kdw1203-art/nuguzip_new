import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/app/components/PageShell";
import { Icon } from "@/app/components/Icon";

/* ============================================================
   항목 F28 — 부동산 규제·의무 안내 (정보성 콘텐츠)
   세율·한도·지정 여부 등 구체 수치는 자주 바뀌므로 개념 설명 위주로 작성하고,
   최신 수치는 국세청·국토교통부·청약홈 등 관련 기관 확인을 반복 안내한다.
   자동 판정·수치를 지어내지 않으며 투자 판단 면책을 포함한다.
   ============================================================ */

export const metadata: Metadata = {
  title: "부동산 규제·의무 안내 | 누구집",
  description:
    "규제지역, 실거주 의무·전매제한, 대출 규제(LTV·DSR), 취득세·양도세·종부세, 청약 자격까지 부동산 규제와 의무의 핵심 개념을 쉽게 정리했습니다.",
};

type Point = { term: string; desc: string };
type Section = {
  icon: string;
  title: string;
  lead: string;
  points: Point[];
};

const SECTIONS: Section[] = [
  {
    icon: "map",
    title: "규제지역 — 투기과열지구·조정대상지역",
    lead: "정부(국토교통부)가 주택 가격이 급등하거나 투기 우려가 큰 곳을 지정해 대출·세제·청약·전매 등을 더 엄격하게 적용하는 제도입니다. 지정·해제는 시장 상황에 따라 수시로 바뀝니다.",
    points: [
      {
        term: "투기과열지구",
        desc: "규제 강도가 가장 높은 단계로, 대출 한도 축소·자금조달계획서 제출·전매제한 강화·청약 재당첨 제한 등이 함께 적용됩니다.",
      },
      {
        term: "조정대상지역",
        desc: "과열이 우려되는 지역에 지정되며, 대출·세제(다주택 중과 등)·청약 규제가 비규제지역보다 강화됩니다.",
      },
      {
        term: "확인 방법",
        desc: "특정 지역이 현재 규제지역인지, 어떤 규제가 적용되는지는 국토교통부 공고·청약홈 등에서 최신 지정 현황을 반드시 확인하세요.",
      },
    ],
  },
  {
    icon: "lock",
    title: "실거주 의무·전매제한 개념",
    lead: "분양받은 주택에는 일정 기간 팔 수 없거나(전매제한), 실제로 살아야 하는(실거주 의무) 조건이 붙을 수 있습니다. 위반하면 처벌·환수 대상이 될 수 있어 계약 전 반드시 확인해야 합니다.",
    points: [
      {
        term: "전매제한",
        desc: "분양권·입주권 등을 일정 기간 타인에게 되팔 수 없도록 제한하는 규정입니다. 지역·주택 유형·분양 방식에 따라 기간이 다릅니다.",
      },
      {
        term: "실거주 의무",
        desc: "분양가상한제 적용 주택 등 일부 주택은 입주 후 일정 기간 실제 거주해야 하는 의무가 부과될 수 있습니다.",
      },
      {
        term: "확인 방법",
        desc: "적용 여부와 기간은 입주자모집공고문과 청약홈·지자체 고시에서 확인하세요. 제도 변경이 잦은 영역입니다.",
      },
    ],
  },
  {
    icon: "wallet",
    title: "대출 규제 — LTV·DSR 개요",
    lead: "주택담보대출은 '집값 대비 얼마까지(LTV)'와 '소득 대비 갚을 능력이 되는가(DSR)'라는 두 축으로 한도가 정해집니다. 규제지역·보유 주택 수·소득에 따라 달라지고 자주 바뀝니다.",
    points: [
      {
        term: "LTV (주택담보인정비율)",
        desc: "주택 가격 대비 빌릴 수 있는 최대 대출 금액의 비율입니다. 집값의 몇 %까지 담보로 대출받을 수 있는지를 나타냅니다.",
      },
      {
        term: "DSR (총부채원리금상환비율)",
        desc: "연 소득 대비 보유한 모든 대출의 연간 원리금 상환액 비율입니다. 소득에 견줘 상환 부담이 과도한지를 봅니다.",
      },
      {
        term: "DTI (총부채상환비율)",
        desc: "주택담보대출 원리금과 기타 대출 이자를 소득과 비교하는 지표로, 지역·상품에 따라 함께 적용될 수 있습니다.",
      },
      {
        term: "확인 방법",
        desc: "구체적인 한도·우대 요건은 금융기관과 상담하고, 최신 규제 기준은 금융위원회·국토교통부 발표를 확인하세요.",
      },
    ],
  },
  {
    icon: "receipt",
    title: "취득세·양도세·종부세 개요",
    lead: "부동산에는 살 때(취득), 가지고 있을 때(보유), 팔 때(양도)마다 세금이 붙습니다. 세율·공제·기준은 세법 개정으로 자주 바뀌므로 개념만 잡고 최신 수치는 별도로 확인하세요.",
    points: [
      {
        term: "취득세",
        desc: "부동산을 취득(매수)할 때 내는 세금입니다. 주택 수·가격·지역에 따라 세율이 달라지며 다주택은 중과될 수 있습니다.",
      },
      {
        term: "양도소득세",
        desc: "부동산을 팔아 생긴 차익에 대해 내는 세금입니다. 보유·거주 기간과 주택 수에 따라 세율, 1세대 1주택 비과세, 장기보유특별공제 등이 달라집니다.",
      },
      {
        term: "종합부동산세",
        desc: "공시가격 합산액이 일정 기준을 넘는 부동산을 보유하면 매년 부과되는 보유세입니다. 1주택자와 다주택자의 공제·세율이 다릅니다.",
      },
      {
        term: "확인 방법",
        desc: "세율·공제·과세 기준은 국세청(홈택스)·지방자치단체에서 확인하고, 실제 신고·납부는 세무사 등 전문가 상담을 권합니다.",
      },
    ],
  },
  {
    icon: "ticket",
    title: "청약 자격·1주택 규제 개요",
    lead: "새 아파트 분양은 청약통장과 자격 요건을 갖춘 사람에게 우선권을 주는 청약 제도로 공급됩니다. 무주택 여부와 세대 구성이 자격에 큰 영향을 줍니다.",
    points: [
      {
        term: "청약통장·가점제",
        desc: "주택청약종합저축 가입 기간, 무주택 기간, 부양가족 수 등으로 가점을 매기는 가점제와, 추첨으로 뽑는 추첨제가 함께 운영됩니다.",
      },
      {
        term: "세대·무주택 요건",
        desc: "세대주 여부, 무주택 세대구성원 요건, 과거 당첨 이력에 따른 재당첨 제한 등이 자격에 영향을 줍니다.",
      },
      {
        term: "특별공급·1주택 규제",
        desc: "생애최초·신혼부부·다자녀 등 특별공급이 있으며, 기존 1주택자는 기존 주택 처분 조건 등 제약이 따를 수 있습니다.",
      },
      {
        term: "확인 방법",
        desc: "자격·가점·일정·규제 내용은 청약홈(한국부동산원)과 각 단지 입주자모집공고문에서 반드시 확인하세요.",
      },
    ],
  },
];

const SectionCard = ({ s }: { s: Section }) => (
  <section className="card rounded-2xl p-5 md:p-6">
    <div className="flex items-center gap-2.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-primary-soft text-primary">
        <Icon name={s.icon} size={18} />
      </span>
      <h2 className="text-[15px] font-extrabold leading-snug text-ink">
        {s.title}
      </h2>
    </div>
    <p className="mt-3 text-[13px] leading-[1.75] text-text-2">{s.lead}</p>
    <ul className="mt-3.5 flex flex-col gap-2.5">
      {s.points.map((p) => (
        <li key={p.term} className="border-l-2 border-line pl-3">
          <div className="text-[13px] font-bold text-text-1">{p.term}</div>
          <div className="mt-0.5 text-[12px] leading-[1.7] text-text-3">
            {p.desc}
          </div>
        </li>
      ))}
    </ul>
  </section>
);

export default function RegulationsGuidePage() {
  return (
    <PageShell
      breadcrumb="가이드 › 부동산 규제·의무 안내"
      title="부동산 규제·의무 안내"
    >
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-4">
        {/* 최신 수치 확인 안내 — 수치를 지어내지 않는다 */}
        <div className="rise-in flex items-start gap-3 rounded-2xl bg-primary-soft p-4">
          <Icon
            name="warning"
            size={18}
            className="mt-0.5 shrink-0 text-primary"
          />
          <p className="text-[13px] leading-[1.7] text-primary">
            세율·한도·규제지역 지정 여부 등 <b>구체적인 수치와 최신 여부는 수시로
            바뀝니다.</b> 국세청(홈택스)·국토교통부·청약홈(한국부동산원) 등 관련
            기관에서 반드시 직접 확인하세요. 이 페이지는 제도의 개념 이해를 돕는
            일반 정보이며 특정 수치를 제공하지 않습니다.
          </p>
        </div>

        {/* 개념 섹션 */}
        {SECTIONS.map((s, i) => (
          <div key={s.title} className={`rise-in-${Math.min(i + 1, 4)}`}>
            <SectionCard s={s} />
          </div>
        ))}

        {/* 투자 판단 면책 */}
        <div className="card rounded-2xl border-line p-5">
          <div className="flex items-center gap-2 text-[13px] font-extrabold text-ink">
            <Icon name="shield" size={16} className="text-text-3" />
            투자 판단 안내
          </div>
          <p className="mt-2 text-[12px] leading-[1.7] text-text-2">
            본 안내는 제도의 개념 이해를 돕기 위한 일반 정보이며, 특정 주택의
            매수·매도·청약을 권유하거나 투자 수익을 보장하지 않습니다. 규제·세제는
            개별 상황에 따라 적용이 달라지므로, 투자 판단과 그 결과에 대한 책임은
            본인에게 있습니다.
          </p>
        </div>

        {/* 관련 가이드 */}
        <Link
          href="/guides/contract"
          className="card-hover flex items-center justify-between rounded-2xl border border-line bg-surface px-5 py-4 no-underline"
        >
          <div>
            <div className="text-[13px] font-extrabold text-ink">
              계약 전 체크리스트 &amp; 특약 가이드
            </div>
            <div className="mt-0.5 text-[11px] text-text-2">
              단계별 확인사항, 표준계약서 핵심 조항과 특약 예시를 이어서 확인하세요.
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
