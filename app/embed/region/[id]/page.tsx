import type { Metadata } from "next";
import { findCatalogRegionById } from "@/lib/region/catalog";
import { getRegionSnapshot, getRegionMonthlyVolume } from "@/lib/market/store";
import type { RegionMarketSnapshot } from "@/lib/market/types";
import { formatKrwShort, formatYm } from "@/lib/market/format";
import { logger } from "@/lib/log";

/* ============================================================
   [#88] 중개사무소용 지역 시세 위젯 — /embed/region/[id]
   지역 시세 요약을 블로그·홈페이지에 <iframe> 한 줄로 싣는 카드.
   단지 위젯(embed/complex)과 같은 규칙:
   - 실데이터만, 조회 실패 시 "불러올 수 없음" 카드 (never crash)
   - 사이트 크롬 없음(embed 레이아웃), noindex
   - 출처(한국부동산원·국토교통부)와 누구집 링크가 카드 안에 박힌다 — 퍼가기가 곧 백링크
   ============================================================ */

export const revalidate = 3600;
export function generateStaticParams(): Array<{ id: string }> {
  return [];
}

export const metadata: Metadata = {
  title: "지역 아파트 시세 · 누구집",
  robots: { index: false, follow: false },
};

function FallbackCard({ name }: { name: string }) {
  return (
    <div
      style={{ fontFamily: "system-ui, sans-serif" }}
      className="flex flex-col gap-1 rounded-2xl border border-[#e3e8f1] bg-white p-4"
    >
      <div className="text-[14px] font-extrabold text-[#1c2433]">{name || "지역"} 시세</div>
      <p className="text-[12px] text-[#6b7686]">
        시세를 불러오지 못했어요. 잠시 후 새로고침하면 표시됩니다.
      </p>
      <a
        href="https://nuguzip.com"
        target="_blank"
        rel="noopener noreferrer"
        className="text-[11px] font-bold text-[#1d4fd8]"
      >
        누구집에서 보기 ↗
      </a>
    </div>
  );
}

export default async function EmbedRegionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const region = findCatalogRegionById(id);
  if (!region) return <FallbackCard name="" />;

  let snap: RegionMarketSnapshot | null = null;
  let volumeLabel: string | null = null;
  try {
    snap = await getRegionSnapshot(id);
    const vol = await getRegionMonthlyVolume(id, region.name, 1).catch(() => []);
    if (vol.length > 0) {
      const v = vol[vol.length - 1];
      volumeLabel = `${formatYm(v.month)} 매매 ${v.count.toLocaleString("ko-KR")}건`;
    }
  } catch (e) {
    logger.error(`[embed/region] ${id} 조회 실패`, e);
    return <FallbackCard name={region.name} />;
  }
  if (!snap) return <FallbackCard name={region.name} />;

  const change =
    snap.saleChangeMonthly !== undefined && Number.isFinite(snap.saleChangeMonthly)
      ? snap.saleChangeMonthly
      : null;

  return (
    <div
      style={{ fontFamily: "system-ui, sans-serif" }}
      className="flex flex-col gap-2 rounded-2xl border border-[#e3e8f1] bg-white p-4"
    >
      {/* [#107] 임베드 채택 비콘 — 부모 페이지(host)만 일집계, 개인 식별 없음 */}
      <script
        dangerouslySetInnerHTML={{
          __html:
            'try{var r=document.referrer;if(r&&navigator.sendBeacon){navigator.sendBeacon("/api/embed/beacon",new Blob([JSON.stringify({ref:r,kind:"region"})],{type:"application/json"}))}}catch(e){}',
        }}
      />

      <div className="flex items-baseline justify-between gap-2">
        <div className="text-[15px] font-extrabold text-[#1c2433]">
          {region.name} 아파트 시세
        </div>
        <div className="text-[10px] text-[#8b94a6]">{formatYm(snap.period)} 기준</div>
      </div>

      <div className="flex flex-wrap items-end gap-x-5 gap-y-1.5">
        {snap.avgSale && snap.avgSale > 0 && (
          <div>
            <div className="text-[10px] text-[#8b94a6]">평균 매매가</div>
            <div className="text-[22px] font-extrabold leading-tight text-[#1c2433]">
              {formatKrwShort(snap.avgSale)}
            </div>
          </div>
        )}
        {change !== null && (
          <div>
            <div className="text-[10px] text-[#8b94a6]">매매지수 전월비</div>
            <div
              className="text-[16px] font-extrabold leading-tight"
              style={{ color: change > 0 ? "#e11900" : change < 0 ? "#1565d8" : "#4a5568" }}
            >
              {change > 0 ? "▲" : change < 0 ? "▼" : "—"} {Math.abs(change).toFixed(2)}%
            </div>
          </div>
        )}
        {snap.jeonseRatio !== undefined && Number.isFinite(snap.jeonseRatio) && (
          <div>
            <div className="text-[10px] text-[#8b94a6]">전세가율</div>
            <div className="text-[16px] font-extrabold leading-tight text-[#1c2433]">
              {snap.jeonseRatio.toFixed(1)}%
            </div>
          </div>
        )}
      </div>

      {volumeLabel && <div className="text-[11px] text-[#4a5568]">{volumeLabel}</div>}

      <div className="flex items-center justify-between border-t border-[#f0f3f8] pt-2">
        <span className="text-[10px] text-[#8b94a6]">
          한국부동산원·KB 공표 통계 · 매물 호가 아님
        </span>
        <a
          href={`https://nuguzip.com/region/${id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] font-extrabold text-[#1d4fd8]"
        >
          누구집에서 자세히 ↗
        </a>
      </div>
    </div>
  );
}
