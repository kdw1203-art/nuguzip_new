import type { Metadata } from "next";
import { getBusinessInfo } from "@/lib/brand/business-info";

export const metadata: Metadata = {
  title: "개인정보 열람·정정·삭제 요청 | 우리동네이야기",
  description: "개인정보 처리 요청 절차 및 처리 기한 안내",
};

const REQUEST_TYPES = [
  "개인정보 열람 요청",
  "개인정보 정정 요청",
  "개인정보 삭제 요청",
  "개인정보 처리 정지 요청",
];

export default function PrivacyRequestPage() {
  const info = getBusinessInfo();
  return (
    <main className="mx-auto w-full max-w-3xl">
      <article className="card rise-in p-6">
        <h1 className="text-2xl font-bold text-ink">개인정보 열람·정정·삭제 요청</h1>
        <p className="mt-2 text-sm leading-relaxed text-text-2">
          정보주체는 개인정보보호법에 따라 본인의 개인정보 처리에 대해 아래 요청을 할 수 있습니다.
        </p>

        <section className="mt-6">
          <h2 className="text-base font-semibold text-ink">요청 가능한 항목</h2>
          <ul className="ml-4 mt-2 list-disc space-y-1 text-sm text-text-1">
            {REQUEST_TYPES.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <section className="mt-6 space-y-2 text-sm leading-7 text-text-1">
          <h2 className="text-base font-semibold text-ink">요청 방법</h2>
          <ol className="ml-4 list-decimal space-y-1">
            <li>이메일 제목에 요청 유형을 기재합니다. (예: 개인정보 열람 요청)</li>
            <li>회원 이메일, 성명/닉네임, 요청 사유를 함께 전달합니다.</li>
            <li>본인 확인을 위해 추가 정보 또는 인증을 요청할 수 있습니다.</li>
          </ol>
        </section>

        <section className="mt-6 space-y-2 text-sm leading-7 text-text-1">
          <h2 className="text-base font-semibold text-ink">처리 기한</h2>
          <p>
            원칙적으로 접수일로부터 10일 이내 결과를 회신합니다. 법령상 보존 의무가 있는 데이터는
            즉시 삭제가 제한될 수 있으며, 해당 사유를 안내합니다.
          </p>
        </section>

        <section className="mt-6 rounded-[14px] bg-bg p-4 text-xs leading-relaxed text-text-2">
          <p className="font-semibold text-text-1">요청 접수 이메일</p>
          <p className="mt-1">{info.privacyEmail}</p>
          <p>고객지원: {info.supportEmail}</p>
        </section>
      </article>
    </main>
  );
}
