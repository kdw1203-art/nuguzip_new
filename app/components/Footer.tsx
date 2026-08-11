import Link from "next/link";
import { getBusinessInfo } from "@/lib/brand/business-info";
import { CookieSettingsLink } from "@/components/consent/cookie-settings-link";
import { NO_PROFIT_GUARANTEE_TEXT } from "@/app/components/ComplianceNotice";

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
  /* S20 — 신뢰·데이터 페이지 내부 링크 (전 페이지 크롤 경로 확보) */
  { label: "소개", href: "/about", bold: false },
  { label: "데이터 방법론", href: "/methodology", bold: false },
  { label: "용어사전", href: "/glossary", bold: false },
  { label: "월간 리포트", href: "/reports", bold: false },
  /* N20 — 공개 집계 API 문서. 링크가 없으면 크롤러도 사람도 도달하지 못한다. */
  { label: "공개 API", href: "/developers", bold: false },
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
          {/* 신고번호가 아직 없으면 "—" 대신 진행 상태를 적는다(소유자 확인:
              정부24 신고 진행 중). 번호가 env 로 들어오면 자동으로 번호 표기로
              바뀐다 — 문구가 낡은 채 남을 수 없는 구조다. */}
          {biz.mailOrderSalesNumber
            ? ` · 통신판매업 신고번호: ${biz.mailOrderSalesNumber}`
            : " · 통신판매업 신고번호: 신고 진행 중"}
          {" · 대표전화: "}
          {/* 유선번호는 토스페이먼츠 상점 심사 필수 항목이다. 번호가 있으면
              바로 걸 수 있게 tel: 로 건다 — 적어만 두면 모바일에서 쓸모가 적다. */}
          {biz.phone ? (
            <a
              href={`tel:${biz.phone.replace(/[^0-9+]/g, "")}`}
              className="text-text-3 underline-offset-2 hover:underline"
            >
              {biz.phone}
            </a>
          ) : (
            "—"
          )}{" "}
          ·{" "}
          <a
            href={`mailto:${biz.supportEmail}`}
            className="text-text-3 underline-offset-2 hover:underline"
          >
            문의 {biz.supportEmail}
          </a>
        </div>
        {/* 예전에는 여기에 "고지 미완 — 유료 결제가 열리지 않습니다" 경고를
            빨간 글씨로 띄웠다. 주소·전화가 채워지고 신고번호만 처리 대기인
            지금은 방문자에게 불안만 주는 문구라 소유자 요청으로 내렸다.
            결제 게이트(isBusinessDisclosureComplete) 자체는 그대로다 — 화면
            문구만 내려갔지 신고번호 없이 결제가 열리지는 않는다. */}

        {/* 수익 보장 문구 영구 미기재 방침 — 전 페이지 고지(소유자 방침 2026-08-11).
            문구 단일 출처는 app/components/ComplianceNotice.tsx */}
        <div>{NO_PROFIT_GUARANTEE_TEXT}</div>

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
          {/* S22 — 동의 철회·변경 경로: 저장된 결정을 지우고 배너를 다시 띄운다 */}
          <CookieSettingsLink />
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
