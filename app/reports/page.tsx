import Link from "next/link";
import { PageShell } from "../components/PageShell";
import { listReportMonths, formatYmKo } from "@/lib/reports/monthly";
import { buildPageMetadata } from "@/lib/seo/page-metadata";

export const metadata = buildPageMetadata({
  title: "월간 아파트 실거래 리포트",
  description:
    "국토교통부 실거래 집계로 매월 자동 생성되는 지역별 아파트 거래량·평균가 리포트 목록.",
  path: "/reports",
});

export const revalidate = 3600;

/* S11/G7 — 월간 리포트 목록. 데이터가 있는 달만 나열한다(빈 달 페이지 양산 금지). */

export default async function ReportsIndexPage() {
  const months = await listReportMonths();

  return (
    <PageShell breadcrumb="월간 실거래 리포트">
      <div className="mx-auto max-w-[760px]">
        <h1 className="rise-in text-[24px] font-extrabold text-ink">월간 아파트 실거래 리포트</h1>
        <p className="rise-in-1 mt-2 text-[14px] leading-[1.7] text-text-2">
          국토교통부 실거래 신고 집계에서 매월 자동으로 만들어지는 리포트입니다.
          사람이 쓰는 시황 글이 아니라 데이터 요약이며, 모든 수치는{" "}
          <Link href="/methodology" className="font-bold text-primary underline">
            공개된 방법론
          </Link>
          을 따릅니다.
        </p>

        {months.length > 0 ? (
          <div className="mt-6 flex flex-col gap-3">
            {months.map((m, i) => (
              <Link
                key={m.ym}
                href={`/reports/${m.ym}`}
                className={`rise-in-${Math.min(i + 2, 6)} card card-hover flex items-center justify-between rounded-[16px] px-5 py-4 no-underline`}
              >
                <span className="text-[15px] font-extrabold text-ink">
                  {formatYmKo(m.ym)} 실거래 리포트
                </span>
                <span className="text-[12px] font-semibold text-text-3">
                  {m.regionCount}개 지역 · {m.txCount.toLocaleString("ko-KR")}건 ›
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="mt-6 card rounded-[16px] px-5 py-8 text-center text-[13px] text-text-3">
            아직 집계된 월이 없어요. 실거래 수집이 쌓이면 자동으로 생성됩니다.
          </div>
        )}
      </div>
    </PageShell>
  );
}
