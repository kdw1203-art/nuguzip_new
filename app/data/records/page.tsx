import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "../../components/PageShell";
import {
  getPublicRecordDatasetStats,
  getPublicRecordsForComplex,
  datasetLabel,
} from "@/lib/market/public-records";
import { CODEF_PRODUCTS } from "@/lib/codef/endpoints";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "공공 부동산 자료 현황 | 누구집",
  description:
    "KB 시세·공시가격·실거래·신고이력 등 공공·공개 부동산 자료의 연동 현황과 단지별 조회.",
  robots: { index: true, follow: true },
};

function fmtKrw(won: number | null): string {
  if (!won || won <= 0) return "—";
  const eok = won / 100_000_000;
  if (eok >= 1) return `${eok >= 10 ? eok.toFixed(1) : eok.toFixed(2)}억`;
  return `${Math.round(won / 10_000).toLocaleString()}만`;
}

export default async function DataRecordsPage({
  searchParams,
}: {
  searchParams: Promise<{ complex?: string }>;
}) {
  const { complex } = await searchParams;
  const query = (complex ?? "").trim();
  const stats = await getPublicRecordDatasetStats();
  const totalRows = stats.reduce((s, d) => s + d.rows, 0);
  const records = query ? await getPublicRecordsForComplex(query, 60) : [];

  return (
    <PageShell
      breadcrumb="홈 › 데이터 › 공공 자료 현황"
      title="공공 부동산 자료 현황"
    >
      <p className="rise-in mb-5 text-[13px] leading-[1.6] text-text-2">
        KB 시세·국토부 실거래·부동산 공시가격·신고이력 등 공공·공개 자료를 단지 단위로
        모읍니다. 출처별 자료(일사편리·부동산공시가격알리미·KB·국토부 등) 기준.
      </p>

      {/* 데이터셋 연동 현황 */}
      <section className="rise-in-1 card mb-6 p-[var(--pad-card)]">
        <h2 className="text-[15px] font-extrabold text-ink">
          데이터셋 연동 현황{" "}
          <span className="text-[11px] font-medium text-text-3">
            총 {totalRows.toLocaleString()}건 적재
          </span>
        </h2>
        <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
          {CODEF_PRODUCTS.map((p) => {
            const s = stats.find((x) => x.dataset === p.dataset);
            const rows = s?.rows ?? 0;
            return (
              <div
                key={p.key}
                className="flex items-center justify-between gap-3 rounded-[12px] border border-line px-3 py-2.5"
              >
                <div className="min-w-0">
                  <div className="text-[13px] font-bold text-ink">{p.label}</div>
                  <div className="mt-0.5 truncate text-[11px] text-text-3">
                    {p.description}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  {rows > 0 ? (
                    <span className="text-[12px] font-extrabold text-primary">
                      {rows.toLocaleString()}건
                    </span>
                  ) : (
                    <span className="rounded-full bg-[#f2f4f8] px-2 py-1 text-[10px] font-semibold text-text-3">
                      연동 대기
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-[11px] leading-[1.6] text-text-3">
          &ldquo;연동 대기&rdquo; 자료는 CODEF(codef.io) 자격 증명 설정 후 자동 적재됩니다.
          실거래·시세 지도는 이미 국토부·KB 공개 데이터로 운영 중입니다.
        </p>
      </section>

      {/* 단지 검색 */}
      <section className="rise-in-2 card mb-6 p-[var(--pad-card)]">
        <h2 className="text-[15px] font-extrabold text-ink">단지 자료 조회</h2>
        <form action="/data/records" method="get" className="mt-3 flex gap-2">
          <input
            type="search"
            name="complex"
            defaultValue={query}
            placeholder="단지명으로 검색 (예: 은마아파트)"
            className="flex-1 rounded-xl border border-line bg-surface px-3.5 py-2 text-[13px] text-ink outline-none placeholder:text-text-3"
          />
          <button
            type="submit"
            className="btn-primary rounded-[10px] px-4 py-2 text-[13px]"
          >
            조회
          </button>
        </form>

        {query && records.length === 0 && (
          <div className="mt-4 rounded-[12px] border border-line bg-surface px-4 py-8 text-center text-[13px] text-text-3">
            &ldquo;{query}&rdquo; 관련 공개 자료가 아직 없어요. 실거래 데이터는{" "}
            <Link
              href={`/complex/browse`}
              className="font-bold text-primary underline-offset-2 hover:underline"
            >
              단지 실거래
            </Link>
            에서 확인해 보세요.
          </div>
        )}

        {records.length > 0 && (
          <ul className="mt-4">
            {records.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-3 border-b border-border py-3 last:border-0"
              >
                <div className="min-w-0">
                  <div className="text-[12px] font-bold text-ink">
                    {datasetLabel(r.dataset)}
                    {r.areaM2 ? ` · ${r.areaM2}㎡` : ""}
                  </div>
                  <div className="mt-0.5 text-[11px] text-text-3">
                    {r.complexName ?? ""} {r.recordDate ?? r.period ?? ""}
                  </div>
                </div>
                <div className="shrink-0 text-right text-[13px] font-extrabold text-ink">
                  {r.priceLowKrw || r.priceHighKrw
                    ? `${fmtKrw(r.priceLowKrw)} ~ ${fmtKrw(r.priceHighKrw)}`
                    : r.depositKrw
                      ? fmtKrw(r.depositKrw)
                      : "—"}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="mb-4 text-[11px] leading-[1.6] text-text-3">
        본 자료는 공공·공개 데이터를 취합한 참고용 정보이며, 실제 거래·계약 조건과 다를 수
        있습니다. 투자 판단의 책임은 이용자 본인에게 있습니다.
      </p>
    </PageShell>
  );
}
