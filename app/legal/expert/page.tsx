import Link from "next/link";
import {
  EXPERT_FRAUD_RULES,
  EXPERT_LEGAL_DISCLOSURES,
  EXPERT_POST_APPROVAL,
  EXPERT_VERIFICATION_PIPELINE,
} from "@/lib/experts/verification-policy";
import { EXPERT_VERIFICATION_SOURCES } from "@/lib/experts/verification-sources";
import { buildPageMetadata } from "@/lib/seo/page-metadata";

export const metadata = buildPageMetadata({
  title: "전문가 운영정책",
  description:
    "전문가 인증 절차, 사기 방지, 환불·오프플랫폼 결제 금지, 플랫폼 책임 범위를 안내합니다.",
  path: "/legal/expert",
});

const H2 = ({ children }: { children: React.ReactNode }) => (
  <h2 className="mt-8 text-lg font-bold text-ink">{children}</h2>
);

export default function ExpertLegalPolicyPage() {
  return (
    <main className="mx-auto w-full max-w-3xl">
      <article className="card rise-in p-6 md:p-8 text-sm leading-7 text-text-1">
        <h1 className="text-2xl font-extrabold text-ink">전문가 운영정책</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-text-2">
          우리동네이야기(내집나우 운영사) 전문가 프로그램은 <strong>자격·소속·서류를 검증한 전문가</strong>만
          상담·리포트 서비스를 제공하도록 설계되어 있습니다. 본 정책은 이용약관·
          <Link href="/legal/privacy" className="text-primary hover:underline">
            개인정보처리방침
          </Link>
          과 함께 적용됩니다.
        </p>

        <H2>1. 인증 절차</H2>
        <p className="mt-2">접수 후 아래 단계를 거쳐 인증 배지가 부여됩니다.</p>
        <div className="mt-2 overflow-x-auto rounded-[14px] border border-line">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-bg text-left">
                <th className="border-b border-line px-3 py-2 font-semibold text-text-1">단계</th>
                <th className="border-b border-line px-3 py-2 font-semibold text-text-1">내용</th>
              </tr>
            </thead>
            <tbody>
              {EXPERT_VERIFICATION_PIPELINE.map((s) => (
                <tr key={s.id} className="border-b border-line last:border-0">
                  <td className="px-3 py-2 font-medium text-text-1">
                    {s.step}. {s.label}
                  </td>
                  <td className="px-3 py-2 text-text-2">{s.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2">
          사후 관리: 응답률·리뷰·분쟁·신고를 모니터링하며,{" "}
          {EXPERT_POST_APPROVAL.revalidationIntervalDays}일마다 공식 출처 재검증을
          권장합니다.
        </p>

        <H2>2. 공식 출처 검증</H2>
        <p className="mt-2">운영팀은 아래 협회·공식 디렉터리에서 등록 상태를 대조합니다.</p>
        <ul className="ml-4 mt-2 list-disc space-y-2">
          {EXPERT_VERIFICATION_SOURCES.map((s) => (
            <li key={s.verificationUrl + s.label}>
              <strong>{s.label}</strong> ({s.authority}) —{" "}
              <a
                href={s.verificationUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="break-all text-primary hover:underline"
              >
                {s.verificationUrl}
              </a>
              <br />
              <span className="text-xs text-text-2">{s.searchHint}</span>
            </li>
          ))}
        </ul>

        <H2>3. 사기·어뷰징 방지</H2>
        <ul className="ml-4 mt-2 list-disc space-y-1">
          {EXPERT_FRAUD_RULES.map((r) => (
            <li key={r.id}>
              <strong>{r.label}</strong> — {r.description}
            </li>
          ))}
        </ul>

        <H2>4. 오프플랫폼 결제·연락처 교환 금지</H2>
        <p className="mt-2">
          전문가와 이용자는 <strong>플랫폼 내 상담·결제·정산</strong>을 이용해야 합니다.
          채팅·상담 본문에 전화번호, 계좌번호, 외부 메신저, 개인 송금 유도 표현이
          포함되면 자동 탐지·경고·제한될 수 있습니다.
        </p>

        <H2>5. 광고 표시·플랫폼 책임 범위</H2>
        <ul className="ml-4 mt-2 list-disc space-y-1">
          <li>
            유료 노출·제휴·스폰서 콘텐츠는 「광고」 또는 「제휴」로 명확히 표시합니다.
          </li>
          <li>
            플랫폼은 전문가와 이용자를 <strong>연결·중개</strong>하며, 개별 법률·세무·
            중개 행위의 결과에 대해 전문가 본인이 책임을 집니다.
          </li>
          <li>
            인증 배지는 제출 서류·공식 출처 대조 시점의 상태를 나타내며, 이후 자격
            정지·말소 시 배지가 회수될 수 있습니다.
          </li>
        </ul>

        <H2>5-1. 후기·평점</H2>
        <ul className="ml-4 mt-2 list-disc space-y-1">
          <li>
            후기는 <strong>답변이 완료된 상담의 의뢰자</strong>만, 상담 1건당 1회 남길 수
            있습니다(별점 1~5 · 300자 이하). 전문가 본인·제3자·대리 작성은 불가합니다.
          </li>
          <li>
            평점은 공개 후기의 단순 평균이며, 후기가 없는 전문가는 &quot;평가 없음&quot;으로
            표시합니다(0점으로 표시하지 않습니다).
          </li>
          <li>
            전화번호·계좌번호·외부 결제 안내가 포함된 후기는 저장되지 않으며, 허위·비방
            후기는 신고 검토 후 비공개 처리될 수 있습니다. 후기 작성자는 닉네임 앞 글자만
            공개됩니다.
          </li>
          <li>
            응답률은 최근 {90}일 안에 접수된 상담 중 답변한 비율이며, 의뢰자가 마감한
            상담은 분모에서 제외합니다. 응답률 {EXPERT_POST_APPROVAL.responseRateMinPercent}% 미만,
            미답변 상담 {EXPERT_POST_APPROVAL.openConsultSlaHours}시간 초과가 반복되면 노출 순위가
            내려가거나 검토 큐에 편입됩니다.
          </li>
        </ul>

        <H2>5-2. 견적 요청·제안</H2>
        <ul className="ml-4 mt-2 list-disc space-y-1">
          <li>
            견적 요청은 세무/절세·금융/대출·임장 동행·인테리어 분야의 정보 상담 요청이며
            중개 의뢰가 아닙니다. 요청은 계정당 시간당 3회로 제한됩니다.
          </li>
          <li>
            제안은 <strong>인증 전문가</strong>만 요청당 1건 보낼 수 있고, 의뢰자의 상담함에
            전문가 표시명·프로필 링크와 함께 저장됩니다. 제안 본문도 4항의 자동 탐지를 거칩니다.
          </li>
        </ul>

        <H2>6. 환불·분쟁</H2>
        <p className="mt-2">
          상담·리포트 환불은 이용약관 및 결제 시 고지된 규정을 따릅니다. 분쟁 접수
          후 영업일 기준 처리하며, 환불·신고가{" "}
          {EXPERT_POST_APPROVAL.refundReviewThreshold}건 이상 누적되면 자동 검토
          큐에 편입됩니다.
        </p>

        <H2>7. 개인정보</H2>
        <p className="mt-2">
          전문가 인증 과정에서 수집하는 자격증 번호, 소속 기관, 인증 서류 이미지 등은{" "}
          <Link href="/legal/privacy" className="text-primary hover:underline">
            개인정보처리방침
          </Link>
          「전문가 인증」 항목에 따릅니다. 인증 철회·탈퇴 시 관련 서류는 지체 없이 파기합니다.
        </p>

        <H2>8. 법무 고지 체크리스트</H2>
        <ul className="ml-4 mt-2 list-disc space-y-1">
          {EXPERT_LEGAL_DISCLOSURES.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>

        <p className="mt-8 border-t border-line pt-4 text-sm text-text-3">
          시행일: 2026년 6월 19일 · 개정: 2026년 9월 3일(후기·견적 제안 조항 신설) · 문의:{" "}
          <Link href="/support" className="text-primary hover:underline">
            고객센터
          </Link>
        </p>
      </article>
    </main>
  );
}
