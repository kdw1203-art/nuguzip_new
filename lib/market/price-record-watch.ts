import "server-only";

import { getServiceSupabase } from "@/lib/supabase/service";
import { regionIdForName } from "@/lib/region/catalog";
import { logger } from "@/lib/log";

/* [#81] 신고가 자동 소식 — 매일 들어오는 실거래에서 "3년 최고가를 3%+ 경신한
 * 당월·전월 계약"을 골라 하루 1건의 자동 글로 발행한다.
 *
 * 스팸 방지 3중 장치:
 *  1) RPC 필터(당월·전월 계약 + 사전 이력 10건+ + 3% 마진) — 백필 유입 오탐 차단
 *     (무필터 실측: 하루 933건 "가짜 신고가" → 필터 후 상위 수 건).
 *  2) 하루 최대 1건의 통합 글(개별 단지당 글 금지).
 *  3) external_key(price-high:YYYYMMDD) 멱등 — 크론 중복 실행에도 1건.
 * 사실 규율: 국토부 신고 기준·취소 가능성을 본문에 명기. 수치는 RPC 결과 그대로. */

export type PriceHighRow = {
  complex_name: string;
  region_name: string;
  area: number;
  deal_amount_krw: number;
  prior_max: number;
  prior_n: number;
  contract_ym: string;
  contract_day: number | null;
};

export type PriceRecordResult = {
  detected: number;
  posted: boolean;
  reason?: string;
  postId?: string;
};

function krwEok(v: number): string {
  const eok = v / 100_000_000;
  return eok >= 10 ? `${eok.toFixed(1)}억` : `${eok.toFixed(2)}억`;
}

function pyeong(area: number): string {
  return `${Math.round(area / 3.305785)}평형`;
}

export async function runPriceRecordWatch(): Promise<PriceRecordResult> {
  const sb = getServiceSupabase();
  if (!sb) return { detected: 0, posted: false, reason: "no-service-client" };

  const { data, error } = await sb.rpc("detect_new_price_highs", {
    p_hours: 26,
    p_min_prior: 10,
    p_margin: 1.03,
    p_limit: 5,
  });
  if (error) {
    logger.error("[price-record] RPC 실패", error);
    throw new Error(`detect_new_price_highs 실패: ${error.message}`);
  }
  const rows = (data ?? []) as PriceHighRow[];
  // 단지+면적 중복 제거(같은 날 두 건 경신 시 최고가만)
  const seen = new Set<string>();
  const items = rows.filter((r) => {
    const k = `${r.complex_name}|${r.region_name}|${r.area}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  if (items.length === 0) return { detected: 0, posted: false, reason: "no-records" };

  const kst = new Date(Date.now() + 9 * 3600_000);
  const ymd = kst.toISOString().slice(0, 10).replace(/-/g, "");
  const externalKey = `price-high:${ymd}`;

  // 멱등 — 오늘자 글이 이미 있으면 발행하지 않는다
  const { data: existing, error: exErr } = await sb
    .from("board_posts")
    .select("id")
    .eq("external_key", externalKey)
    .maybeSingle();
  if (exErr) {
    logger.error("[price-record] 기존 글 확인 실패", exErr);
    throw new Error(`board_posts 조회 실패: ${exErr.message}`);
  }
  if (existing) return { detected: items.length, posted: false, reason: "already-posted" };

  // 자동 수집 글의 작성자(봇 프로필)를 실사용 값에서 찾는다 — UUID 하드코딩 금지
  const { data: authorRow, error: authorErr } = await sb
    .from("board_posts")
    .select("author_id")
    .eq("is_automated", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (authorErr || !authorRow?.author_id) {
    return { detected: items.length, posted: false, reason: "no-bot-author" };
  }

  const top = items[0];
  const dateLabel = `${kst.getMonth() + 1}월 ${kst.getDate()}일`;
  const title = `오늘의 신고가 — ${top.complex_name} ${pyeong(top.area)} ${krwEok(top.deal_amount_krw)} 등 ${items.length}건`;

  const lines = items.map((r) => {
    const pct = ((r.deal_amount_krw / r.prior_max - 1) * 100).toFixed(1);
    const rid = regionIdForName(r.region_name);
    const regionLink = rid ? ` → 지역 시세: naezipnow.com/region/${rid}` : "";
    return `· ${r.region_name} ${r.complex_name} ${r.area}㎡(${pyeong(r.area)}) — ${krwEok(
      r.deal_amount_krw,
    )} 신고 (직전 3년 최고 ${krwEok(r.prior_max)} 대비 +${pct}%, 비교 표본 ${r.prior_n}건)${regionLink}`;
  });

  const content = [
    `${dateLabel} 국토교통부 실거래 신고분에서 직전 3년 최고가를 넘긴 계약 ${items.length}건이 확인됐습니다.`,
    "",
    ...lines,
    "",
    "기준: 같은 단지·비슷한 면적(±2㎡)의 직전 3년 신고가와 비교했고, 비교 표본이 10건 이상인 경우만 담았습니다. 실거래 신고는 계약 후 30일 이내에 이뤄지며, 신고 취소·정정으로 값이 바뀔 수 있습니다.",
  ].join("\n");

  const { data: inserted, error: insErr } = await sb
    .from("board_posts")
    .insert({
      author_id: authorRow.author_id,
      board_type: "community",
      category: "정보/소식",
      region: regionIdForName(top.region_name) ? top.region_name.split(" ").pop() : null,
      title,
      content,
      tags: ["신고가", "실거래"],
      ai_summary: `${dateLabel} 실거래 신고분 중 3년 최고가 경신 ${items.length}건 — 최고가는 ${top.complex_name} ${krwEok(top.deal_amount_krw)}입니다.`,
      ai_keywords: ["신고가", top.complex_name, top.region_name],
      source_name: "국토교통부 실거래가",
      external_key: externalKey,
      is_automated: true,
      automation_meta: {
        source: "price-record-watch",
        summary_v: "2",
        /* [#114] 대표 단지 24개월 차트 카드 — 목록 썸네일·공유 카드로 쓰인다 */
        image: `https://naezipnow.com/api/og/complex-trend?${new URLSearchParams({
          region: top.region_name,
          name: top.complex_name,
        }).toString()}`,
      },
      is_published: true,
    })
    .select("id")
    .single();
  if (insErr) {
    logger.error("[price-record] 발행 실패", insErr);
    throw new Error(`board_posts 발행 실패: ${insErr.message}`);
  }
  return { detected: items.length, posted: true, postId: String(inserted?.id ?? "") };
}
