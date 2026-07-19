import type { Metadata } from "next";

import { getBusinessInfo } from "@/lib/brand/business-info";

export const metadata: Metadata = {
  title: "개인정보처리방침 — 우리동네이야기",
  description: "우리동네이야기 개인정보처리방침 전문",
};

const UPDATED = "2026년 6월 24일";

const Section = ({
  num,
  title,
  children,
}: {
  num: string;
  title: string;
  children: React.ReactNode;
}) => (
  <section className="mt-8 first:mt-0">
    <h2 className="text-base font-bold text-ink">
      {num}. {title}
    </h2>
    <div className="mt-2 space-y-2 text-sm leading-7 text-text-1">{children}</div>
  </section>
);

const Table = ({ headers, rows }: { headers: string[]; rows: string[][] }) => (
  <div className="mt-2 overflow-x-auto rounded-[14px] border border-line">
    <table className="w-full border-collapse text-xs">
      <thead>
        <tr className="bg-bg">
          {headers.map((h) => (
            <th
              key={h}
              className="border-b border-line px-3 py-2 text-left font-semibold text-text-1"
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, ri) => (
          <tr key={ri} className="border-b border-line last:border-0">
            {row.map((cell, ci) => (
              <td key={ci} className="px-3 py-2 text-text-2">
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export default function PrivacyPage() {
  const info = getBusinessInfo();
  return (
    <main className="mx-auto w-full max-w-3xl">
      <article className="card rise-in p-6 md:p-8">
        <div className="mb-6 border-b border-line pb-6">
          <h1 className="text-2xl font-extrabold text-ink">개인정보처리방침</h1>
          <p className="mt-1 text-sm text-text-3">시행일: {UPDATED}</p>
          <div className="mt-3 rounded-[14px] bg-primary-soft p-3 text-xs leading-relaxed text-primary">
            우리동네이야기(이하 &quot;회사&quot;)는 「개인정보보호법」 및 「정보통신망 이용촉진 및 정보보호 등에
            관한 법률」을 준수하며, 이용자의 개인정보를 안전하게 보호합니다. 본 방침은 회원가입,
            서비스 이용, 유료 결제 등을 통해 수집한 개인정보의 처리 목적·항목·보유기간 등을
            알려드리기 위해 작성되었습니다.
          </div>
        </div>

        <Section num="1" title="개인정보 수집 항목 및 목적">
          <p>회사는 다음과 같이 개인정보를 수집·이용합니다.</p>
          <Table
            headers={["구분", "수집 항목", "수집 목적", "보유기간"]}
            rows={[
              [
                "회원가입 (필수)",
                "이메일, 비밀번호(암호화 저장), 닉네임",
                "회원 식별, 서비스 제공, 불법 이용 방지",
                "회원 탈퇴 시 즉시 삭제 (단, 법령에 따른 보존 기간 적용)",
              ],
              [
                "소셜 로그인 (선택)",
                "소셜 프로필 ID, 이메일 (제공 범위는 각 플랫폼 설정에 따름)",
                "소셜 계정 연동, 회원 식별",
                "회원 탈퇴 시 즉시 삭제",
              ],
              [
                "유료 결제",
                "결제 수단 정보(카드번호 끝 4자리·마스킹), 주문번호, 결제금액",
                "결제 확인, 환불 처리, 부정 결제 방지",
                "전자상거래법에 따라 5년 보존",
              ],
              [
                "전문가 인증 (선택)",
                "자격증 번호, 소속 기관, 인증 서류 이미지",
                "전문가 회원 인증, 서비스 신뢰도 제고",
                "인증 철회 또는 회원 탈퇴 시 삭제",
              ],
              [
                "서비스 이용 기록",
                "접속 IP, 접속 일시, 브라우저 종류, 서비스 이용 기록, 쿠키",
                "서비스 개선, 부정 이용 탐지, 통계 분석",
                "1년 보존 후 파기",
              ],
              [
                "마케팅 (선택 동의 시)",
                "이메일",
                "서비스 이벤트·혜택 안내",
                "동의 철회 시 즉시 삭제",
              ],
              [
                "AI 임장노트 (동의 시)",
                "현장 사진, 음성 녹음, 임장 위치(GPS·구 단위), AI 요약·태그 결과",
                "임장 기록 자동 정리, 단지 비교, PDF·공유 리포트 생성",
                "회원 탈퇴 또는 삭제 요청 시 파기 (원본 음성 90일 후 자동 삭제 권장)",
              ],
            ]}
          />
          <p id="field-capture" className="mt-4 text-sm leading-relaxed text-text-1">
            <strong>임장 기록(음성·사진·위치)</strong>은 AI 임장노트 기능 이용 시{" "}
            <strong>업로드 전 별도 동의</strong> 후 수집됩니다. STT·이미지 분석 처리를 위해 AI
            API(OpenAI·Anthropic 등, 미국)로 전송될 수 있으며,{" "}
            <strong>AI 모델 학습용 2차 활용은 하지 않습니다.</strong> 원본 음성은 약 90일, 사진·요약은
            회원 유지 중 보관 후 탈퇴·삭제 요청 시 파기합니다. 신분증·제3자 얼굴 등 민감 정보는
            포함하지 않는 것을 원칙으로 합니다.
          </p>
        </Section>

        <Section num="1-2" title="공공·안전 데이터 표시 원칙">
          <p>
            치안·성범죄 등 민감한 공공 데이터가 원자료로 존재하더라도, 서비스 UI에는{" "}
            <strong>개인을 특정할 수 없는 행정구역 단위 집계 지표</strong>(예: 지역 안전 종합 지수)만
            표시합니다. 주소 단위·사건 단위 원자료는 소비자 화면에 노출하지 않습니다.
          </p>
          <p>
            공인중개사 등 전문직 정보는 공식 API·검증 출처·기관 협의를 우선하며, 약관·robots·협의 없는
            대규모 스크래핑을 기본 전제로 하지 않습니다.
          </p>
          <p className="mt-2 text-xs text-text-3">
            ※ 서비스 이용 중 자동으로 생성·수집되는 정보(쿠키, IP 등)는 별도 동의 없이 수집될 수
            있으며, 쿠키 수집을 원치 않으시면 브라우저 설정에서 거부하실 수 있습니다.
          </p>
        </Section>

        <Section num="2" title="개인정보 제3자 제공">
          <p>
            회사는 원칙적으로 이용자의 개인정보를 외부에 제공하지 않습니다. 단, 다음의 경우에는
            예외로 합니다.
          </p>
          <Table
            headers={["제공받는 자", "제공 목적", "제공 항목", "보유기간"]}
            rows={[
              [
                "토스페이먼츠(주)",
                "결제 처리 및 정산",
                "결제 관련 최소 정보",
                "결제 완료 후 5년(전자상거래법)",
              ],
              [
                "Stripe, Inc.",
                "해외카드·대체 결제 처리(선택)",
                "결제 관련 최소 정보",
                "결제 완료 후 5년(전자상거래법)",
              ],
              [
                "수사기관 등",
                "법령에 따른 수사·조사 협조",
                "수사기관 요청 항목",
                "해당 기관 보유 기간 따름",
              ],
            ]}
          />
          <p className="mt-2">
            이 외의 경우, 이용자의 사전 동의 없이 제3자에게 개인정보를 제공하지 않습니다.
          </p>
        </Section>

        <Section num="3" title="개인정보 처리 위탁">
          <p>회사는 원활한 서비스 제공을 위해 일부 업무를 외부에 위탁하고 있습니다.</p>
          <Table
            headers={["수탁 업체", "위탁 업무", "개인정보 보유기간"]}
            rows={[
              [
                "Supabase Inc.",
                "데이터베이스 호스팅 및 인증 관리",
                "위탁 계약 종료 시 즉시 파기",
              ],
              ["Vercel Inc.", "웹 서버 호스팅 및 배포", "위탁 계약 종료 시 즉시 파기"],
              [
                "구글 코리아(유) / Google LLC",
                "소셜 로그인 인증(선택)",
                "위탁 계약 종료 시 즉시 파기",
              ],
              [
                "OpenAI, L.L.C. / Anthropic PBC",
                "AI 임장노트·분석·챗봇(텍스트·음성·이미지 처리)",
                "처리 목적 달성 또는 회원 탈퇴·삭제 요청 시 파기",
              ],
              [
                "Stripe, Inc.",
                "해외카드·대체 결제 처리(선택)",
                "전자상거래법에 따른 보존 기간",
              ],
              ["토스페이먼츠(주)", "결제·정산 처리", "전자상거래법에 따른 보존 기간"],
            ]}
          />
          <p className="mt-2 text-xs leading-relaxed text-text-2">
            AI 처리를 위해 음성·사진·위치·텍스트가 미국 등 국외 서버로 전송될 수 있습니다. 전송
            항목·목적·보유기간은 수집 항목 표(1항)와 동일하며, 이용자는 AI 기능 이용 전 별도 동의
            화면에서 확인할 수 있습니다.
          </p>
          <p className="mt-2 text-xs text-text-3">
            위 수탁 업체들은 GDPR, SOC2 등 국제 보안 인증을 보유하고 있으며, 계약서에 따라 개인정보를
            안전하게 관리합니다.
          </p>
        </Section>

        <Section num="4" title="개인정보의 보유 및 파기">
          <p>① 회사는 개인정보 수집·이용 목적이 달성된 후에는 지체 없이 파기합니다.</p>
          <p>② 단, 관련 법령에 따라 보존해야 하는 정보는 아래 기간 동안 별도 보관합니다.</p>
          <Table
            headers={["보존 근거", "보존 항목", "보존 기간"]}
            rows={[
              ["전자상거래법", "계약·청약철회·대금결제·재화공급 기록", "5년"],
              ["전자상거래법", "소비자 불만·분쟁처리 기록", "3년"],
              ["통신비밀보호법", "로그인 기록(IP 등)", "3개월"],
              ["국세기본법", "세금계산서 등 세무 관련 기록", "5년"],
            ]}
          />
          <p>③ 전자적 파일 형태는 재생 불가능한 방법으로 영구 삭제하며, 서면 기록은 분쇄하여 파기합니다.</p>
        </Section>

        <Section num="5" title="이용자의 권리 및 행사 방법">
          <p>이용자(정보주체)는 회사에 대해 언제든지 다음 각 호의 개인정보 보호 관련 권리를 행사할 수 있습니다.</p>
          <ul className="ml-4 list-disc space-y-1">
            <li>개인정보 열람 요구</li>
            <li>오류 등의 정정 요구</li>
            <li>삭제 요구</li>
            <li>처리 정지 요구</li>
          </ul>
          <p>권리 행사는 서비스 내 「내 정보」 페이지 또는 개인정보보호책임자 이메일(아래 기재)로 서면·이메일로 요청하시면, 10일 이내에 처리 결과를 통보해 드립니다.</p>
          <p>만 14세 미만 아동의 경우 법정대리인이 권리를 행사할 수 있습니다.</p>
        </Section>

        <Section num="6" title="개인정보 자동 수집 장치 (쿠키)">
          <p>① 회사는 서비스 제공 및 이용 편의를 위해 쿠키(cookie)를 사용합니다.</p>
          <p>② 쿠키는 브라우저에 저장되는 소량의 텍스트 파일로, 로그인 상태 유지·설정 기억 등에 사용됩니다.</p>
          <p>③ 이용자는 브라우저 설정을 통해 쿠키 수집을 거부하거나 삭제할 수 있습니다. 다만, 쿠키 거부 시 로그인 등 일부 서비스 이용이 제한될 수 있습니다.</p>
          <p>④ 분석(Google Analytics 등)·광고(Google AdSense) 목적 쿠키는 서비스 하단 배너에서 목적별로 선택 동의할 수 있으며, 동의하지 않아도 필수 기능 이용에는 지장이 없습니다. 광고는 PRO 이상 멤버십에서 제거됩니다.</p>
        </Section>

        <Section num="7" title="개인정보 보안 조치">
          <p>회사는 개인정보보호법 제29조에 따라 다음과 같이 기술적·관리적 보호 조치를 취하고 있습니다.</p>
          <ul className="ml-4 list-disc space-y-1">
            <li>비밀번호 단방향 암호화(bcrypt, saltRounds 12) 저장</li>
            <li>데이터 전송 시 TLS/HTTPS 암호화</li>
            <li>데이터베이스 Row Level Security(RLS) 적용</li>
            <li>서비스 역할별 접근 권한 최소화(서비스 계정·관리자·일반 분리)</li>
            <li>접근 로그 기록 및 이상 징후 모니터링</li>
            <li>개인정보 취급 인원 최소화 및 주기적 교육</li>
          </ul>
        </Section>

        <Section num="8" title="개인정보보호책임자">
          <div className="space-y-1 rounded-[14px] border border-line bg-bg p-4 text-sm">
            <p>
              <strong>개인정보보호책임자</strong>: 미정 (오픈 시 기재)
            </p>
            <p>
              <strong>이메일</strong>: {info.privacyEmail}
            </p>
            <p>
              <strong>전화</strong>: 오픈 시 기재
            </p>
            <p className="mt-2 text-xs text-text-3">
              개인정보 침해에 대한 신고·상담은 아래 기관에 문의하실 수 있습니다.
            </p>
            <ul className="mt-1 space-y-0.5 text-xs text-text-2">
              <li>
                • 개인정보 침해 신고센터:{" "}
                <a
                  href="https://privacy.kisa.or.kr"
                  className="text-primary hover:underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  privacy.kisa.or.kr
                </a>{" "}
                (국번 없이 118)
              </li>
              <li>
                • 개인정보 분쟁조정위원회:{" "}
                <a
                  href="https://www.kopico.go.kr"
                  className="text-primary hover:underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  www.kopico.go.kr
                </a>{" "}
                (1833-6972)
              </li>
              <li>
                • 대검찰청 사이버범죄수사단:{" "}
                <a
                  href="https://www.spo.go.kr"
                  className="text-primary hover:underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  www.spo.go.kr
                </a>{" "}
                (02-3480-3573)
              </li>
              <li>
                • 경찰청 사이버안전국:{" "}
                <a
                  href="https://cyberbureau.police.go.kr"
                  className="text-primary hover:underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  cyberbureau.police.go.kr
                </a>{" "}
                (국번 없이 182)
              </li>
            </ul>
          </div>
        </Section>

        <Section num="9" title="개인정보처리방침 변경">
          <p>이 개인정보처리방침은 시행일로부터 적용되며, 변경 시 서비스 공지사항 및 가입 이메일을 통해 사전 고지합니다. 중요한 변경 사항(수집 항목 추가, 제3자 제공 범위 확대 등)은 최소 30일 전에 고지합니다.</p>
        </Section>

        <p className="mt-10 border-t border-line pt-4 text-xs text-text-3">
          본 개인정보처리방침은 {UPDATED}부터 시행됩니다.
        </p>
      </article>
    </main>
  );
}
