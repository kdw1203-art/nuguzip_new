import type { Metadata } from "next";
import Link from "next/link";
import { getBusinessInfo } from "@/lib/brand/business-info";

export const metadata: Metadata = {
  title: "법적 고지 | 누구집",
  description: "이용약관, 개인정보처리방침, 위치/청소년 정책과 개인정보 열람 안내",
};

const ITEMS = [
  {
    href: "/legal/terms",
    title: "이용약관",
    desc: "서비스 이용 조건, 권리·의무, 책임 범위를 확인합니다.",
  },
  {
    href: "/legal/privacy",
    title: "개인정보처리방침",
    desc: "개인정보 수집·이용·보관·파기와 이용자 권리를 안내합니다.",
  },
  {
    href: "/legal/expert",
    title: "전문가 운영정책",
    desc: "인증 절차, 사기 방지, 환불·오프플랫폼 결제 금지, 책임 범위를 안내합니다.",
  },
  {
    href: "/legal/community",
    title: "커뮤니티 운영정책",
    desc: "커뮤니티 이용 규칙, 금지 행위, 신고·제재 절차를 안내합니다.",
  },
  {
    href: "/legal/fees",
    title: "거래·수수료 안내",
    desc: "구매자·판매자·전문가 인증 수수료와 정산 기준을 안내합니다.",
  },
  {
    href: "/legal/location",
    title: "위치기반서비스 이용약관",
    desc: "위치정보 사용 범위, 제공 목적, 보관 기간을 안내합니다.",
  },
  {
    href: "/legal/youth",
    title: "청소년 보호정책",
    desc: "유해정보 대응, 신고 및 조치 절차를 안내합니다.",
  },
  {
    href: "/legal/privacy-request",
    title: "개인정보 열람·정정·삭제 요청",
    desc: "요청 방법, 처리 기한, 본인 확인 절차를 안내합니다.",
  },
];

export default function LegalHubPage() {
  const info = getBusinessInfo();
  return (
    <main className="mx-auto w-full max-w-3xl">
      <header className="card rise-in p-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">
          Legal Center
        </p>
        <h1 className="mt-2 text-2xl font-bold text-ink">법적 고지</h1>
        <p className="mt-2 text-sm leading-relaxed text-text-2">
          약관 및 정책은 서비스 운영 상황에 맞춰 업데이트될 수 있으며, 중요한 변경 사항은
          공지 또는 이메일로 사전 안내합니다.
        </p>
      </header>

      <section className="mt-6 space-y-3">
        {ITEMS.map((item) => (
          <Link key={item.href} href={item.href} className="card card-hover block p-5">
            <p className="text-sm font-semibold text-ink">{item.title}</p>
            <p className="mt-1 text-xs leading-relaxed text-text-2">{item.desc}</p>
          </Link>
        ))}
      </section>

      <section className="mt-6 rounded-[14px] border border-line bg-bg p-4 text-xs leading-relaxed text-text-2">
        <p className="font-semibold text-text-1">문의</p>
        <p className="mt-1">일반 문의: {info.supportEmail}</p>
        <p>개인정보 문의: {info.privacyEmail}</p>
      </section>
    </main>
  );
}
