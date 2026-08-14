import type { Metadata } from "next";
import { PageShell } from "@/app/components/PageShell";
import { BillingEnrollClient } from "./BillingEnrollClient";
import { ComplianceNotice } from "@/app/components/ComplianceNotice";

export const metadata: Metadata = {
  title: "자동결제 등록 | 누구집",
  // 개인 결제 설정 화면 — 색인 대상이 아니다
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * 자동결제(빌링) 카드 등록 — 토스 빌링 결제창 연동.
 *
 * 단건 결제(/subscription/checkout)와 별도 화면인 이유: 빌링은 추가 전자계약이
 * 필요한 별도 상품이고(빌링 문서), 심사에 고지한 단건 상품 구성·문구를 건드리지
 * 않은 채 병행 경로로만 열어야 하기 때문이다. 전자계약 승인 전에는 서버가 503 을
 * 주고 이 화면은 "준비 중"을 사실대로 보여 준다.
 */
export default function BillingEnrollPage() {
  return (
    <PageShell breadcrumb="구독 · 자동결제" title="자동결제 등록">
      <BillingEnrollClient />
      <div className="mt-4"><ComplianceNotice variant="payment" /></div>
    </PageShell>
  );
}
