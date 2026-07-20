import Link from "next/link";
import { getBusinessInfo } from "@/lib/brand/business-info";

/* P0-3 공통 푸터 — 사업자·통신판매업 고지(전자상거래법) + 약관 링크를 모든 페이지·모바일에 노출.
   모바일에서는 하단 탭바와 겹치지 않게 pb-28 확보. */

const LEGAL_LINKS = [
  { label: "이용약관", href: "/legal/terms", bold: false },
  { label: "개인정보처리방침", href: "/legal/privacy", bold: true },
  { label: "위치기반서비스 약관", href: "/legal/location", bold: false },
  { label: "청소년보호", href: "/legal/youth", bold: false },
  { label: "법적 고지", href: "/legal", bold: false },
  { label: "고객센터", href: "/support", bold: false },
  { label: "구독 안내", href: "/subscription", bold: false },
] as const;

export function Footer() {
  const biz = getBusinessInfo();

  return (
    <footer className="mt-auto border-t border-line bg-surface px-5 pb-28 pt-6 md:pb-6">
      <div className="mx-auto flex max-w-[1240px] flex-col gap-2 text-xs leading-relaxed text-text-3">
        {/* 1행: 사업자 고지 */}
        <div>
          누구집 · 상호: {biz.legalName}({biz.domain}) · 대표:{" "}
          {biz.representative || "—"} · 사업자등록번호:{" "}
          {biz.registrationNumber || "—"}
        </div>
        <div>
          주소: {biz.address || "—"}
          {biz.mailOrderSalesNumber
            ? ` · 통신판매업 신고번호: ${biz.mailOrderSalesNumber}`
            : ""}{" "}
          ·{" "}
          <a
            href={`mailto:${biz.supportEmail}`}
            className="text-text-3 underline-offset-2 hover:underline"
          >
            문의 {biz.supportEmail}
          </a>
        </div>

        {/* 2행: 약관·고객센터 링크 */}
        <div className="flex flex-wrap gap-x-3 gap-y-1.5">
          {LEGAL_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={
                l.bold
                  ? "font-semibold text-text-2 underline-offset-2 hover:underline"
                  : "text-text-3 underline-offset-2 hover:underline"
              }
            >
              {l.label}
            </Link>
          ))}
        </div>

        {/* 3행: 면책 */}
        <div>
          시세·AI 분석 결과는 참고용 정보이며 투자 판단의 책임은 이용자 본인에게
          있습니다. 실거래가는 국토교통부 공개 데이터 기준입니다.
        </div>
      </div>
    </footer>
  );
}
