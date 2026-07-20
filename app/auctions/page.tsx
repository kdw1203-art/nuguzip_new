import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "../components/PageShell";
import {
  getAuctions,
  getAuctionCount,
  AUCTION_USAGE_FILTERS,
} from "@/lib/onbid/store";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "서울 공매 물건 (온비드) | 누구집",
  description:
    "한국자산관리공사 온비드 공매 부동산 — 서울권 아파트·오피스텔·빌라 감정가·최저입찰가·입찰일정. 공공 데이터 기반.",
  robots: { index: true, follow: true },
};

function fmtKrw(won: number | null): string {
  if (!won || won <= 0) return "—";
  const eok = won / 100_000_000;
  if (eok >= 1) return `${eok >= 10 ? eok.toFixed(1) : eok.toFixed(2)}억`;
  return `${Math.round(won / 10_000).toLocaleString()}만`;
}
function fmtDt(v: string | null): string {
  if (!v || v.length < 8) return "—";
  return `${v.slice(0, 4)}.${v.slice(4, 6)}.${v.slice(6, 8)}`;
}

export default async function AuctionsPage({
  searchParams,
}: {
  searchParams: Promise<{ usage?: string; gu?: string }>;
}) {
  const { usage, gu } = await searchParams;
  const [items, total] = await Promise.all([
    getAuctions({ usage, sigungu: gu, limit: 120 }),
    getAuctionCount(),
  ]);

  return (
    <PageShell breadcrumb="홈 › 매물 › 공매 물건" title="서울 공매 물건">
      <p className="rise-in mb-5 text-[13px] leading-[1.6] text-text-2">
        한국자산관리공사 <strong className="text-ink">온비드</strong> 공매 부동산 —
        입찰 중·예정 물건 <strong className="text-ink">{total.toLocaleString()}건</strong>.
        감정가·최저입찰가·입찰일정은 공공 데이터 기준이며, 실제 입찰·명도 조건은 온비드 원문을
        반드시 확인하세요.
      </p>

      {/* 유형 필터 */}
      <section className="rise-in-1 mb-5 flex flex-wrap gap-1.5">
        <Link href="/auctions" className={!usage ? "chip-active" : "chip"}>
          전체
        </Link>
        {AUCTION_USAGE_FILTERS.map((f) => (
          <Link
            key={f.key}
            href={`/auctions?usage=${f.key}`}
            className={usage === f.key ? "chip-active" : "chip"}
          >
            {f.label}
          </Link>
        ))}
      </section>

      {items.length === 0 ? (
        <section className="rise-in-2 card p-[var(--pad-card)]">
          <div className="rounded-[12px] border border-line bg-surface px-4 py-10 text-center text-[13px] text-text-3">
            현재 조건의 공매 물건이 없어요. 데이터는 하루 2회 자동 갱신됩니다.
          </div>
        </section>
      ) : (
        <section className="rise-in-2 grid grid-cols-1 gap-3 md:grid-cols-2">
          {items.map((a) => {
            const url = a.onbidCltrno
              ? `https://www.onbid.co.kr/op/cta/cltrdtl/collateralDetailMoveableAssetsDetail.do?cltrHstrNo=${a.onbidCltrno}`
              : "https://www.onbid.co.kr";
            return (
              <a
                key={a.externalKey}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="card card-hover block p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="line-clamp-2 text-[13px] font-bold text-ink">
                      {a.name ?? "물건"}
                    </div>
                    <div className="mt-1 text-[11px] text-text-3">
                      {[a.sido, a.sigungu, a.emd].filter(Boolean).join(" ")}
                    </div>
                  </div>
                  {a.status ? (
                    <span className="shrink-0 rounded-full bg-primary-soft px-2 py-0.5 text-[10px] font-semibold text-primary">
                      {a.status}
                    </span>
                  ) : null}
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-text-3">
                  {a.usage ? <span>{a.usage}</span> : null}
                  {a.bldSqms ? <span>건물 {a.bldSqms}㎡</span> : null}
                  {a.landSqms ? <span>토지 {a.landSqms}㎡</span> : null}
                </div>
                <div className="mt-2 flex items-end justify-between">
                  <div>
                    <div className="text-[10px] text-text-3">최저입찰가</div>
                    <div className="text-[15px] font-extrabold text-primary">
                      {fmtKrw(a.minBidKrw)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] text-text-3">감정가</div>
                    <div className="text-[12px] font-bold text-ink">
                      {fmtKrw(a.appraisalKrw)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] text-text-3">입찰마감</div>
                    <div className="text-[12px] font-bold text-ink">
                      {fmtDt(a.bidEnd)}
                    </div>
                  </div>
                </div>
              </a>
            );
          })}
        </section>
      )}

      <p className="mt-5 text-[11px] leading-[1.6] text-text-3">
        출처: 한국자산관리공사 온비드(공공데이터포털) · 참고용 정보이며 권리분석·명도·정확한
        입찰조건은 온비드 공고 원문과 전문가 확인이 필요합니다.
      </p>
    </PageShell>
  );
}
