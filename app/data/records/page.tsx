import type { Metadata } from "next";
import { PageShell } from "../../components/PageShell";
import { getPublicRecordDatasetStats } from "@/lib/market/public-records";
import { RecordsSearchClient } from "./RecordsSearchClient";
import { CODEF_PRODUCTS } from "@/lib/codef/endpoints";
import { seoAlternates } from "@/lib/seo/alternates";

/* ── ISR 전환 (사용량 절감 14차, 2026-08-11) ────────────────────────────────
   예전에는 force-dynamic + ?complex= 서버 재렌더였다. ?complex= 는 자유 텍스트
   DB 검색이라 클라이언트 메모리 필터로 못 바꾼다 — 검색만 /api/public-records
   (검색어별 CDN 캐시)로 분리하고, 이 페이지는 통계(적재 현황)만 ISR 로 품는다.
   실측(2026-08-11): public_property_records 0행(CODEF 자격 증명 대기) —
   현황은 전부 "연동 대기"가 사실이고, 통계 로더는 실패 시 base(0건)를
   돌려주지만 그 표시는 "연동 대기"라 거짓 주장이 되지는 않는다. */
export const revalidate = 600;

export const metadata: Metadata = {
  title: "공공 부동산 자료 현황 | 누구집",
  description:
    "KB 시세·공시가격·실거래·신고이력 등 공공·공개 부동산 자료의 연동 현황과 단지별 조회.",
  robots: { index: true, follow: true },
  // N7 — 필터·정렬 파라미터 조합이 별개 URL 로 색인되지 않도록 canonical 고정
  alternates: seoAlternates("/data/records"),
};

export default async function DataRecordsPage() {
  const stats = await getPublicRecordDatasetStats();
  const totalRows = stats.reduce((s, d) => s + d.rows, 0);

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
                    <span className="rounded-full bg-bg chip-pad text-[10px] font-semibold text-text-3">
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
        <RecordsSearchClient />
      </section>

      <p className="mb-4 text-[11px] leading-[1.6] text-text-3">
        본 자료는 공공·공개 데이터를 취합한 참고용 정보이며, 실제 거래·계약 조건과 다를 수
        있습니다. 투자 판단의 책임은 이용자 본인에게 있습니다.
      </p>
    </PageShell>
  );
}
