import type { Metadata } from "next";
import Link from "next/link";
import { getBusinessInfo } from "@/lib/brand/business-info";

export const metadata: Metadata = {
  title: "청소년 보호정책 | 우리동네이야기",
  description: "청소년 유해정보 차단 및 신고 처리 기준 안내",
};

export default function YouthPolicyPage() {
  const info = getBusinessInfo();
  return (
    <main className="mx-auto w-full max-w-3xl">
      <article className="card rise-in p-6">
        <h1 className="text-2xl font-bold text-ink">청소년 보호정책</h1>
        <p className="mt-2 text-xs text-text-3">시행일: 2026년 4월 23일</p>

        <p className="mt-4 rounded-[14px] border border-line bg-bg p-3 text-sm text-text-1">
          커뮤니티 글·댓글 운영 규칙은{" "}
          <Link href="/legal/community" className="font-semibold text-primary hover:underline">
            커뮤니티 운영정책
          </Link>
          에서 별도로 다룹니다.
        </p>

        <section className="mt-6 space-y-2 text-sm leading-7 text-text-1">
          <h2 className="text-base font-semibold text-ink">1. 기본 원칙</h2>
          <p>
            회사는 청소년이 유해정보로부터 안전하게 서비스를 이용할 수 있도록 관련 법령을 준수하고
            모니터링 및 신고 처리 절차를 운영합니다.
          </p>
        </section>

        <section className="mt-6 space-y-2 text-sm leading-7 text-text-1">
          <h2 className="text-base font-semibold text-ink">2. 유해정보 관리 조치</h2>
          <ul className="ml-4 list-disc space-y-1">
            <li>음란, 폭력, 범죄 조장, 불법 광고 콘텐츠 탐지 및 차단</li>
            <li>신고 접수 시 우선 심사 후 임시 블라인드 처리</li>
            <li>재발 사용자의 단계별 제재(경고, 정지, 영구 제한)</li>
          </ul>
        </section>

        <section className="mt-6 space-y-2 text-sm leading-7 text-text-1">
          <h2 className="text-base font-semibold text-ink">3. 신고 및 처리</h2>
          <p>
            청소년 유해 게시물은 고객지원 채널로 신고할 수 있으며, 접수 후 영업일 기준 최대 3일 내
            1차 검토 결과를 회신합니다.
          </p>
        </section>

        <section className="mt-6 rounded-[14px] bg-bg p-4 text-xs leading-relaxed text-text-2">
          <p className="font-semibold text-text-1">청소년 보호 책임 문의</p>
          <p className="mt-1">신고 접수: {info.supportEmail}</p>
          <p>정책 문의: {info.privacyEmail}</p>
        </section>
      </article>
    </main>
  );
}
