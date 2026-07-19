import type { Metadata } from "next";
import { getBusinessInfo } from "@/lib/brand/business-info";

export const metadata: Metadata = {
  title: "위치기반서비스 이용약관 | 우리동네이야기",
  description: "위치정보 이용 목적, 수집 항목, 보유 기간, 권리 행사 방법 안내",
};

export default function LocationLegalPage() {
  const info = getBusinessInfo();
  return (
    <main className="mx-auto w-full max-w-3xl">
      <article className="card rise-in p-6">
        <h1 className="text-2xl font-bold text-ink">위치기반서비스 이용약관</h1>
        <p className="mt-2 text-xs text-text-3">시행일: 2026년 4월 23일</p>

        <section className="mt-6 space-y-2 text-sm leading-7 text-text-1">
          <h2 className="text-base font-semibold text-ink">1. 목적</h2>
          <p>
            본 약관은 우리동네이야기(이하 회사)가 제공하는 위치기반서비스와 관련하여
            회사와 이용자의 권리, 의무 및 책임사항을 규정합니다.
          </p>
        </section>

        <section className="mt-6 space-y-2 text-sm leading-7 text-text-1">
          <h2 className="text-base font-semibold text-ink">2. 서비스 내용</h2>
          <ul className="ml-4 list-disc space-y-1">
            <li>사용자 현재 위치 기반 지역 추천</li>
            <li>지도 중심 주변 매물/커뮤니티/임장 정보 제공</li>
            <li>지역 기반 알림 및 콘텐츠 맞춤 노출</li>
          </ul>
        </section>

        <section className="mt-6 space-y-2 text-sm leading-7 text-text-1">
          <h2 className="text-base font-semibold text-ink">3. 수집 항목 및 보유 기간</h2>
          <p>
            회사는 위치기반 기능 제공을 위해 단말기 위치정보(위도/경도)를 처리할 수 있습니다.
            위치정보는 요청 시점에만 사용하며, 별도 저장이 필요한 경우 최대 30일 이내 보관 후 파기합니다.
          </p>
        </section>

        <section className="mt-6 space-y-2 text-sm leading-7 text-text-1">
          <h2 className="text-base font-semibold text-ink">4. 이용자 권리</h2>
          <p>
            이용자는 언제든지 브라우저 또는 기기 설정에서 위치 권한을 철회할 수 있으며, 위치정보
            활용에 대한 동의를 거부할 수 있습니다. 다만 일부 맞춤 기능은 제한될 수 있습니다.
          </p>
        </section>

        <section className="mt-6 rounded-[14px] bg-bg p-4 text-xs leading-relaxed text-text-2">
          <p className="font-semibold text-text-1">문의</p>
          <p className="mt-1">고객지원: {info.supportEmail}</p>
          <p>개인정보/위치정보: {info.privacyEmail}</p>
        </section>
      </article>
    </main>
  );
}
