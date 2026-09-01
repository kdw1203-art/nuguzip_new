import "server-only";
import { getServiceSupabase } from "@/lib/supabase/service";
import { getRegionSnapshot } from "@/lib/market/store";
import { getSupplyForArea } from "@/lib/market/supply";
import { REGION_CATALOG } from "@/lib/region/catalog";
import { formatKrwShort } from "@/lib/market/format";
import { logger } from "@/lib/log";

/* ============================================================
   [945 · 실사용50 #1] 동네 데이터 브리핑 자동 발행 — 콜드스타트 해소.

   문제: 동네이야기 대부분 지역이 "첫 글이 비어 있어요" 상태다. 사람 글을
   지어낼 수는 없으므로(가짜 이웃 글 금지), 봇 명의(is_automated)의 월간
   "데이터 브리핑" 글로 각 동네 홈에 최소한의 내용을 정직하게 채운다 —
   주간 시황 글과 같은 규약: 실측 수치만, 출처·시점 명시, 투자 권유 없음.

   멱등: external_key = region-intro:{regionId}:{YYYYMM} — 월 1회.
   데이터 없는 지역은 건너뛴다(없는 지역에 빈 글을 만드는 것도 소음이다).
   ============================================================ */

export type RegionIntroResult = {
  posted: number;
  skippedExisting: number;
  skippedNoData: number;
  failed: number;
};

function yyyymm(): string {
  const d = new Date(Date.now() + 9 * 3600_000); // KST 기준 월
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function publishRegionIntroPosts(limit = 30): Promise<RegionIntroResult> {
  const sb = getServiceSupabase();
  const out: RegionIntroResult = { posted: 0, skippedExisting: 0, skippedNoData: 0, failed: 0 };
  if (!sb) return out;

  const { data: authorRow } = await sb
    .from("board_posts")
    .select("author_id")
    .eq("is_automated", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const authorId = authorRow?.author_id;
  if (!authorId) {
    logger.warn("[region-intro] 봇 작성자 없음 — 발행 생략");
    return out;
  }

  const month = yyyymm();
  const monthLabel = `${month.slice(0, 4)}.${month.slice(4)}`;
  let budget = limit;

  for (const region of REGION_CATALOG) {
    if (budget <= 0) break;
    const externalKey = `region-intro:${region.id}:${month}`;
    try {
      const { data: existing, error: exErr } = await sb
        .from("board_posts")
        .select("id")
        .eq("external_key", externalKey)
        .maybeSingle();
      if (exErr) throw new Error(exErr.message);
      if (existing) {
        out.skippedExisting += 1;
        continue;
      }

      const snap = await getRegionSnapshot(region.id).catch(() => null);
      if (!snap || snap.avgSale == null || snap.avgSale <= 0) {
        out.skippedNoData += 1;
        continue; // 시세 실측이 없는 지역 — 빈 브리핑을 지어내지 않는다
      }

      const supply = await getSupplyForArea(region.name, 12).catch(() => []);
      const upcoming = supply.filter(
        (s) => s.moveInYm >= new Date().toISOString().slice(0, 7).replace("-", ""),
      );
      const upcomingHouseholds = upcoming.reduce((a, s) => a + (s.households ?? 0), 0);

      const lines: string[] = [];
      lines.push(
        `· 아파트 평균 매매가 ${formatKrwShort(snap.avgSale)}${
          snap.saleChangeMonthly != null
            ? ` (전월 대비 ${snap.saleChangeMonthly > 0 ? "+" : ""}${snap.saleChangeMonthly}%)`
            : ""
        }`,
      );
      if (snap.jeonseRatio != null) lines.push(`· 전세가율 ${Math.round(snap.jeonseRatio)}%`);
      if (snap.tradeCount != null) lines.push(`· 최근 월 거래 ${snap.tradeCount}건`);
      if (upcoming.length > 0) {
        lines.push(
          `· 12개월 내 입주 예정 ${upcoming.length}개 단지 · ${upcomingHouseholds.toLocaleString("ko-KR")}세대 (청약홈 공고)`,
        );
      }

      const periodLabel = snap.period
        ? `${String(snap.period).slice(0, 4)}.${String(snap.period).slice(4, 6)}`
        : monthLabel;
      const title = `${region.name} 시장 브리핑 — ${monthLabel}`;
      const content = [
        `${region.name}의 이번 달 공개 데이터 요약입니다. 전 수치는 공표·신고 기준이며 투자 권유가 아닙니다.`,
        "",
        `■ 숫자로 보는 ${region.name} (${periodLabel} 기준)`,
        ...lines,
        "",
        `상세 지표·지수 추이 → nuguzip.com/region/${region.id}`,
        `지도에서 보기 → nuguzip.com/map?q=${encodeURIComponent(region.name)}`,
        "",
        `이 동네에 다녀오셨다면 첫 이웃 글의 주인공이 되어 주세요 → nuguzip.com/town/write?region=${encodeURIComponent(region.name)}`,
      ].join("\n");

      const { error: insErr } = await sb.from("board_posts").insert({
        author_id: authorId,
        board_type: "community",
        category: "정보/소식",
        title,
        content,
        tags: [region.name, "동네브리핑"],
        ai_summary: `${region.name} ${monthLabel} 공개 데이터 요약 — 평균가·전세가율·거래량·입주.`,
        ai_keywords: [region.name, "시세", "브리핑"],
        source_name: "누구집 자동 집계",
        is_automated: true,
        external_key: externalKey,
      });
      if (insErr) throw new Error(insErr.message);
      out.posted += 1;
      budget -= 1;
    } catch (e) {
      out.failed += 1;
      logger.warn(`[region-intro] ${region.id} 발행 실패`, e);
    }
  }
  return out;
}
