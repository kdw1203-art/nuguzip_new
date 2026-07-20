import type { Metadata } from "next";
import type { ReactNode } from "react";

import { BusinessDisclosureBlock } from "../BusinessDisclosureBlock";

export const metadata: Metadata = {
  title: "이용약관 — 우리동네이야기",
  description: "우리동네이야기 서비스 이용약관 전문",
};

const UPDATED = "2025년 6월 1일";

const Section = ({
  num,
  title,
  id,
  children,
}: {
  num: string;
  title: string;
  id?: string;
  children: ReactNode;
}) => (
  <section id={id} className="mt-8 scroll-mt-24 first:mt-0">
    <h2 className="text-base font-bold text-ink">
      제{num}조 ({title})
    </h2>
    <div className="mt-2 space-y-2 text-sm leading-7 text-text-1">{children}</div>
  </section>
);

const TERMS_VERSIONS = [
  {
    version: "1.2",
    effectiveDate: "2025-06-01",
    summary: "AI·유료 플랜·투자 면책 조항 정비.",
  },
  {
    version: "1.1",
    effectiveDate: "2024-12-01",
    summary: "커뮤니티·전문가 서비스 범위 확장.",
  },
  {
    version: "1.0",
    effectiveDate: "2024-06-01",
    summary: "최초 공개 약관.",
  },
];

export default function TermsPage() {
  return (
    <main className="mx-auto w-full max-w-3xl">
      <article className="card rise-in p-6 md:p-8">
        <div className="mb-6 border-b border-line pb-6">
          <h1 className="text-2xl font-extrabold text-ink">이용약관</h1>
          <p className="mt-1 text-sm text-text-3">시행일: {UPDATED}</p>
          <div className="mt-3 rounded-[14px] bg-primary-soft p-3 text-xs leading-relaxed text-primary">
            본 약관은 우리동네이야기(이하 &quot;회사&quot;)가 제공하는 서비스의 이용 조건 및 절차, 회사와
            이용자의 권리·의무 및 책임에 관한 사항을 규정합니다.
          </div>
        </div>

        <div className="mb-8">
          <h2 className="text-sm font-bold text-ink">약관 개정 이력</h2>
          <ul className="mt-2 space-y-1.5 rounded-[14px] border border-line bg-bg p-3 text-xs text-text-2">
            {TERMS_VERSIONS.map((v) => (
              <li key={v.version} className="flex flex-wrap gap-x-2">
                <span className="font-semibold text-text-1">v{v.version}</span>
                <span className="text-text-3">{v.effectiveDate}</span>
                <span>{v.summary}</span>
              </li>
            ))}
          </ul>
        </div>

        <Section num="1" title="목적">
          <p>
            이 약관은 우리동네이야기(이하 &quot;회사&quot;)가 운영하는 웹사이트 및 모바일 서비스
            (이하 &quot;서비스&quot;)의 이용과 관련하여 회사와 이용자(이하 &quot;회원&quot;) 간의 권리·의무 및
            책임 사항, 기타 필요한 사항을 규정함을 목적으로 합니다.
          </p>
        </Section>

        <Section num="2" title="약관의 효력 및 변경">
          <p>① 이 약관은 서비스 화면에 게시하거나 기타 방법으로 회원에게 공지함으로써 효력이 발생합니다.</p>
          <p>② 회사는 「전자상거래 등에서의 소비자보호에 관한 법률」, 「약관의 규제에 관한 법률」, 「정보통신망 이용촉진 및 정보보호 등에 관한 법률」 등 관련 법령을 위배하지 않는 범위에서 이 약관을 개정할 수 있습니다.</p>
          <p>③ 회사가 약관을 개정할 경우에는 적용 일자 및 개정 내용을 명시하여 서비스 내 공지사항에 개정 적용 일자 7일(회원에게 불리한 변경은 30일) 이전부터 공지합니다.</p>
          <p>④ 회원이 개정 약관의 적용에 동의하지 않는 경우, 회원 탈퇴를 통해 서비스 이용 계약을 해지할 수 있습니다.</p>
        </Section>

        <Section num="3" title="약관 외 준칙">
          <p>이 약관에서 정하지 아니한 사항과 이 약관의 해석에 관하여는 대한민국 관련 법령 및 회사가 정한 서비스 운영 정책·공지사항을 따릅니다.</p>
        </Section>

        <Section num="4" title="서비스의 제공 및 변경">
          <p>① 회사는 다음과 같은 서비스를 제공합니다.</p>
          <ul className="ml-4 list-disc space-y-1">
            <li>부동산 커뮤니티 게시판(정보 공유, 질의응답 등)</li>
            <li>전문가(공인중개사, 감정평가사 등) 매칭 및 상담 연결</li>
            <li>부동산 임장 모임 개설 및 참여</li>
            <li>부동산 정보 마켓(리포트, 자료 거래)</li>
            <li>AI 기반 부동산 투자 분석 도구</li>
            <li>지도 기반 단지·정비사업 정보 조회</li>
            <li>유료 구독 플랜(Pro·Expert) 제공</li>
            <li>기타 회사가 추가 개발하거나 제휴를 통해 제공하는 서비스</li>
          </ul>
          <p>② 회사는 서비스 내용을 변경하거나 중단할 수 있으며, 그 경우 공지사항 또는 이메일 등을 통해 사전 고지합니다.</p>
          <p>③ 서비스 내 AI 분석·투자 의견은 참고 정보일 뿐 법적·투자 자문이 아니며, 투자 결과에 대한 책임은 이용자 본인에게 있습니다.</p>
        </Section>

        <Section num="5" title="회원가입">
          <p>① 회원가입은 이용자가 약관에 동의하고 회사가 정한 가입 양식에 필수 정보를 입력한 후 회사가 이를 승낙함으로써 성립됩니다.</p>
          <p>② 회사는 다음 각 호에 해당하는 경우 가입 신청을 거절하거나 추후 이용 계약을 해지할 수 있습니다.</p>
          <ul className="ml-4 list-disc space-y-1">
            <li>실명이 아니거나 타인의 명의를 이용한 경우</li>
            <li>허위 정보를 기재하거나 회사가 요구하는 정보를 제공하지 않은 경우</li>
            <li>만 14세 미만인 경우</li>
            <li>이전에 서비스 이용 약관 위반 등의 사유로 자격을 상실한 경우</li>
            <li>기타 회사 운영 정책에 반하는 경우</li>
          </ul>
          <p>③ 회원 가입 계약의 성립 시기는 회사의 가입 완료 안내가 회원에게 도달한 시점으로 합니다.</p>
        </Section>

        <Section num="6" title="회원의 의무">
          <p>① 회원은 다음 행위를 하여서는 아니 됩니다.</p>
          <ul className="ml-4 list-disc space-y-1">
            <li>타인의 개인정보(이메일, 연락처, 주민등록번호 등) 수집·도용</li>
            <li>부동산 투자·구매 판단에 영향을 미치는 허위·과장·오해 유발 정보 게시</li>
            <li>타인을 비방·명예훼손하거나 사생활을 침해하는 게시물 작성</li>
            <li>음란물, 폭력적 콘텐츠, 혐오 표현 등 불법 콘텐츠 게시</li>
            <li>스팸·광고·홍보성 게시글 반복 게시(회사 허가 광고 제외)</li>
            <li>서비스 운영을 방해하는 해킹·크롤링·과부하 유발 행위</li>
            <li>지식재산권·저작권을 침해하는 콘텐츠 게시</li>
            <li>회사의 서면 동의 없는 서비스 상업적 이용·재판매</li>
            <li>관련 법령을 위반하는 모든 행위</li>
          </ul>
          <p>② 회원의 아이디와 비밀번호 관리 책임은 회원 본인에게 있으며, 부정 사용 시 즉시 회사에 신고하여야 합니다.</p>
        </Section>

        <Section num="7" title="회사의 의무">
          <p>① 회사는 관련 법령 및 이 약관이 금지하거나 미풍양속에 반하는 행위를 하지 않으며, 지속적으로 서비스를 제공하기 위해 최선을 다합니다.</p>
          <p>② 회사는 이용자 개인정보를 「개인정보처리방침」에 따라 안전하게 관리하며, 동의 없이 제3자에게 제공하지 않습니다.</p>
          <p>③ 회사는 서비스 이용 관련 회원의 의견·불만을 수렴하여 신속히 처리하기 위해 노력합니다.</p>
        </Section>

        {/* P2-8: /subscription "환불 규정 안내" 링크의 앵커 (#refund) — 청약철회·환불 조항 */}
        <Section num="8" title="유료 서비스 및 결제" id="refund">
          <p>① 유료 서비스(PRO·EXPERT 플랜 등)를 이용하려면 회사가 정한 요금을 납부하여야 합니다.</p>
          <p>② 요금 및 결제 방식, 구독 갱신 주기는 서비스 내 요금제 페이지에서 확인할 수 있습니다.</p>
          <p>③ 구독 요금 결제 후 7일 이내에 한해 전자상거래법에 따른 청약철회(환불)가 가능합니다. 단, 디지털 콘텐츠를 이미 소비(다운로드 또는 열람)한 경우에는 청약철회가 제한될 수 있습니다.</p>
          <p>④ 구독 플랜은 다음 결제일 1일 전까지 취소하지 않으면 자동으로 갱신됩니다.</p>
          <p>⑤ 결제 대행 서비스는 토스페이먼츠(주) 등을 이용하며, 결제 관련 세부 사항은 각 결제 대행사의 이용약관을 따릅니다.</p>
        </Section>

        <Section num="9" title="게시물의 관리">
          <p>① 회원이 서비스에 게시한 게시물의 저작권은 해당 게시물 작성자에게 있습니다. 단, 회사는 서비스 운영·홍보 목적으로 게시물을 활용할 수 있으며, 이 경우 출처 표기 및 원저작자의 권리를 존중합니다.</p>
          <p>② 회사는 다음 각 호에 해당하는 게시물을 사전 통보 없이 삭제하거나 노출을 제한할 수 있습니다.</p>
          <ul className="ml-4 list-disc space-y-1">
            <li>타인의 저작권·초상권·개인정보를 침해하는 게시물</li>
            <li>허위 사실·명예훼손·혐오 표현 등 위법 소지가 있는 게시물</li>
            <li>스팸·불법 광고·도박·사기 등 범죄 관련 게시물</li>
            <li>음란물, 청소년 유해 매체물</li>
            <li>기타 관련 법령 위반 게시물</li>
          </ul>
          <p>③ 회원은 자신의 게시물에 대한 관리 책임을 지며, 문제 게시물에 대한 타인의 신고 접수 시 회사는 처리 결과를 통보합니다.</p>
        </Section>

        <Section num="10" title="이용 제한 및 계약 해지">
          <p>① 회사는 회원이 이 약관의 의무를 위반하거나 서비스 정상 운영을 방해하는 경우, 경고·일시 정지·영구 이용 제한 등의 조치를 취할 수 있습니다.</p>
          <p>② 회원은 언제든지 서비스 내 회원탈퇴 기능을 통해 이용 계약을 해지할 수 있습니다.</p>
          <p>③ 탈퇴 시 회원 정보 및 게시물은 「개인정보처리방침」에 따라 처리됩니다. 단, 법령에 따라 일정 기간 보존이 필요한 정보는 해당 기간 동안 별도 보관됩니다.</p>
          <p>④ 구독 중인 유료 플랜이 있는 경우 탈퇴 전 구독을 먼저 해지하여야 하며, 잔여 구독 기간에 대한 환불은 제8조에 따릅니다.</p>
        </Section>

        <Section num="11" title="손해배상 및 면책">
          <p>① 회사는 천재지변·전쟁·테러·서버 해킹 등 불가항력적 사유, 통신장애, 제3자의 서비스 중단 등으로 인해 서비스를 제공하지 못한 경우 책임을 지지 않습니다.</p>
          <p>② 회사는 회원이 서비스에 게재한 정보·자료·사실의 신뢰성·정확성에 대해 책임을 지지 않습니다.</p>
          <p>③ 회사는 회원 간 또는 회원과 제3자 사이에 서비스를 매개로 발생한 분쟁에 대해 개입 의무가 없으며, 이로 인한 손해를 배상할 책임이 없습니다.</p>
          <p>④ 서비스 내 AI 분석 결과, 투자 정보 등을 이용한 투자 판단에 따른 손실에 대해 회사는 책임을 지지 않습니다.</p>
          <p>⑤ 회원이 본 약관 위반으로 회사에 손해를 입힌 경우, 해당 회원은 회사에 발생한 손해를 배상하여야 합니다.</p>
        </Section>

        <Section num="12" title="분쟁 해결 및 재판 관할">
          <p>① 서비스 이용에 관하여 회사와 회원 사이에 발생한 분쟁은 상호 협의를 통해 해결합니다.</p>
          <p>② 분쟁이 해결되지 않는 경우, 소비자분쟁조정위원회 또는 개인정보분쟁조정위원회에 조정을 신청할 수 있습니다.</p>
          <p>③ 이 약관에 관한 소송의 관할 법원은 회사의 본사 소재지를 관할하는 법원으로 합니다.</p>
          <p>④ 이 약관은 대한민국 법령에 의거하여 해석됩니다.</p>
        </Section>

        <Section num="13" title="기타">
          <p>① 이 약관과 관련한 문의는 아래 연락처로 하시기 바랍니다.</p>
          <div className="mt-2">
            <BusinessDisclosureBlock />
          </div>
        </Section>

        <p className="mt-10 border-t border-line pt-4 text-xs text-text-3">
          부칙 — 이 약관은 {UPDATED}부터 시행합니다.
        </p>
      </article>
    </main>
  );
}
