import type { Metadata } from "next";
import Link from "next/link";
import {
  EXPERT_CERT_FEES,
  MARKETPLACE_FEES,
} from "@/lib/billing/marketplace-fees";
import { buildPageMetadata } from "@/lib/seo/page-metadata";
import { getBusinessInfo } from "@/lib/brand/business-info";

export const metadata: Metadata = buildPageMetadata({
  title: "거래·수수료 안내",
  description:
    "nuguzip 구매자·판매자·전문가 인증 수수료. 크몽 대비 예측 가능한 부동산 의사결정 거래 체계.",
  path: "/legal/fees",
});

export default function FeesPolicyPage() {
  const info = getBusinessInfo();
  return (
    <main className="mx-auto w-full max-w-3xl">
      <h1 className="text-2xl font-bold text-ink">거래·수수료 안내</h1>
      <p className="mt-2 text-sm leading-relaxed text-text-2">
        nuguzip은 부동산 의사결정 도구에 맞게 거래 조건을 공개합니다. VAT·PG 실비는 별도 안내가
        없는 한 결제 영수증 기준입니다. 멤버십 요금은{" "}
        <Link href="/subscription" className="font-semibold text-primary hover:underline">
          요금제
        </Link>
        를 참고하세요.
      </p>

      <section className="mt-8">
        <h2 className="text-lg font-bold text-ink">마켓플레이스 수수료</h2>
        <p className="mt-1 text-xs text-text-3">
          크몽 공개 기준과 비교 — nuguzip 제안 요율 (2026년 6월 기준)
        </p>
        <div className="mt-3 overflow-x-auto rounded-[14px] border border-line">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-bg text-left">
                <th className="border-b border-line px-3 py-2 font-semibold text-text-1">
                  거래 유형
                </th>
                <th className="border-b border-line px-3 py-2 font-semibold text-text-1">
                  크몽 공개
                </th>
                <th className="border-b border-line px-3 py-2 font-semibold text-primary">
                  nuguzip
                </th>
              </tr>
            </thead>
            <tbody>
              {MARKETPLACE_FEES.map((row) => (
                <tr key={row.id} className="border-b border-line last:border-0">
                  <td className="px-3 py-2 font-medium text-text-1">{row.label}</td>
                  <td className="px-3 py-2 text-text-2">{row.kmongPublic ?? "—"}</td>
                  <td className="px-3 py-2 font-semibold text-ink">
                    {row.nuguzip}
                    {row.note ? (
                      <span className="mt-0.5 block font-normal text-text-3">
                        {row.note}
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-bold text-ink">전문가 인증·정산</h2>
        <ul className="mt-3 space-y-2 rounded-[14px] border border-line bg-bg p-4 text-sm">
          {EXPERT_CERT_FEES.map((row) => (
            <li key={row.label} className="flex justify-between gap-4">
              <span className="text-text-1">{row.label}</span>
              <span className="shrink-0 font-semibold text-ink">{row.rate}</span>
            </li>
          ))}
        </ul>
      </section>

      <p className="mt-8 text-xs leading-relaxed text-text-3">
        수수료는 사전 고지 후 변경될 수 있으며, 기존 거래에는 체결 시점 요율이 적용됩니다. 문의:{" "}
        <a href={`mailto:${info.supportEmail}`} className="text-primary hover:underline">
          {info.supportEmail}
        </a>
      </p>
    </main>
  );
}
