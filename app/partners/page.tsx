import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "../components/PageShell";
import { PartnerForm } from "./PartnerForm";

/* ============================================================
   중개사 제휴 안내 — /partners
   혜택 안내 + 제휴 신청 폼 → partnership_inquiries 저장 (POST /api/partners).
   ============================================================ */

export const metadata: Metadata = {
  title: "중개사 제휴 안내 · 누구집",
  description:
    "개업공인중개사를 위한 누구집 제휴 프로그램 — 매물 노출, 전문가 프로필, 상담 연결까지.",
};

const BENEFITS = [
  {
    title: "매물 노출",
    desc: "보유 매물을 실매물 목록에 등록하고 단지 실거래가 페이지와 연결해 노출해요.",
  },
  {
    title: "전문가 프로필",
    desc: "중개사무소·대표 소개와 전문 분야를 담은 프로필로 신뢰를 쌓을 수 있어요.",
  },
  {
    title: "상담 연결",
    desc: "단지·지역을 탐색하던 이웃의 상담 요청을 제휴 중개사에게 연결해 드려요.",
  },
];

export default function PartnersPage() {
  return (
    <PageShell breadcrumb="홈 › 중개사 제휴">
      <div className="mb-6 max-w-[720px]">
        <h1 className="rise-in text-[24px] font-extrabold leading-[1.35] text-ink">
          동네 매물, 누구집에서 더 많은 이웃에게
        </h1>
        <p className="mt-2 text-[14px] leading-[1.7] text-text-2">
          누구집은 국토부 실거래가 데이터를 보는 이웃들이 모이는 곳이에요. 제휴
          중개사무소가 되면 실거래가를 확인하던 이웃에게 보유 매물을 바로 보여줄 수
          있어요. 중개 행위는 제휴 중개사가 직접 수행하고, 누구집은 광고 매체로서
          매물 정보를 게재합니다.
        </p>
      </div>

      <div className="rise-in-1 mb-8 grid grid-cols-1 gap-3 md:grid-cols-3">
        {BENEFITS.map((b) => (
          <div key={b.title} className="card card-pad-sm">
            <div className="text-[15px] font-extrabold text-ink">{b.title}</div>
            <p className="mt-1.5 text-[13px] leading-[1.7] text-text-2">{b.desc}</p>
          </div>
        ))}
      </div>

      <div className="rise-in-1 max-w-[640px]">
        <h2 className="mb-3 text-[17px] font-extrabold text-ink">제휴 신청</h2>
        <PartnerForm />
      </div>

      <div className="mt-8 max-w-[720px] rounded-xl bg-[rgba(0,0,0,.03)] px-4 py-3 text-[11px] leading-[1.7] text-text-3">
        제휴는 개업공인중개사(중개사무소 등록번호 보유)에 한해 가능합니다. 신청
        내용은 검토 목적으로만 사용하며,{" "}
        <Link href="/legal/privacy" className="underline">
          개인정보처리방침
        </Link>
        에 따라 처리됩니다.
      </div>
    </PageShell>
  );
}
