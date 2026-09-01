import "server-only";

import { getServiceSupabase } from "@/lib/supabase/service";
import { getAllRegionSnapshots } from "@/lib/market/store";
import { getWeeklyPriceHighs } from "@/lib/market/weekly-highs";
import { buildApplyCalendar } from "@/lib/applyhome/calendar";
import { regionIdForName } from "@/lib/region/catalog";
import { logger } from "@/lib/log";

/* ============================================================
   [#111·#116 통합] 주간 시황 자동 발행 — "이번 주 숫자"를 동네이야기 공식 글로.
   두 항목은 같은 데이터(지수 무버·신고가·청약·거래량)와 같은 포맷이라 별도 글
   2개는 중복이다 — 하나로 합쳐 매주 월요일 1편만 발행한다(중복 통합 원칙).

   규율은 신고가 자동 글(#81)과 동일:
   - 봇 작성자 실측 조회(UUID 하드코딩 금지) · is_automated 표시 · 출처 명기
   - external_key(weekly-market:YYYY-wNN) 멱등 — 재실행에도 1편
   - 전 수치 실측, 소스 실패 섹션은 통째로 생략(빈칸 창작 금지)
   - 블로그 팩(#58)·소셜 소재(#62)와 데이터 소스를 공유하되 문장은 피드용으로 짧게
   ============================================================ */

function isoWeekLabel(now = new Date()): { key: string; label: string } {
  const t = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return {
    key: `${t.getUTCFullYear()}-w${String(week).padStart(2, "0")}`,
    label: `${t.getUTCFullYear()}년 ${week}주차`,
  };
}

const eok = (v: number) => `${(v / 1e8).toFixed(1).replace(/\.0$/, "")}억`;

export type WeeklyPostResult =
  | { posted: true; postId: string }
  | { posted: false; reason: string };

export async function publishWeeklyMarketPost(): Promise<WeeklyPostResult> {
  const sb = getServiceSupabase();
  if (!sb) return { posted: false, reason: "no-db" };
  const { key, label } = isoWeekLabel();
  const externalKey = `weekly-market:${key}`;

  const { data: existing, error: exErr } = await sb
    .from("board_posts")
    .select("id")
    .eq("external_key", externalKey)
    .maybeSingle();
  if (exErr) throw new Error(`board_posts 조회 실패: ${exErr.message}`);
  if (existing) return { posted: false, reason: "already-posted" };

  const { data: authorRow } = await sb
    .from("board_posts")
    .select("author_id")
    .eq("is_automated", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!authorRow?.author_id) return { posted: false, reason: "no-bot-author" };

  const sections: string[] = [];
  const numbers: string[] = []; // "이번 주 숫자" 헤드 요약

  /* ① 지수 무버 */
  try {
    const snaps = [...(await getAllRegionSnapshots()).values()].filter(
      (s) => s.saleChangeMonthly !== undefined && Number.isFinite(s.saleChangeMonthly),
    );
    snaps.sort((a, b) => (b.saleChangeMonthly ?? 0) - (a.saleChangeMonthly ?? 0));
    if (snaps.length >= 5) {
      const up = snaps[0];
      const down = snaps[snaps.length - 1];
      const lines: string[] = [];
      if ((up.saleChangeMonthly ?? 0) > 0) {
        const rid = regionIdForName(up.regionName);
        lines.push(
          `· 상승 1위 ${up.regionName} +${(up.saleChangeMonthly ?? 0).toFixed(2)}%${rid ? ` → nuguzip.com/region/${rid}` : ""}`,
        );
        numbers.push(`${up.regionName} +${(up.saleChangeMonthly ?? 0).toFixed(2)}%`);
      }
      if ((down.saleChangeMonthly ?? 0) < 0) {
        const rid = regionIdForName(down.regionName);
        lines.push(
          `· 하락 1위 ${down.regionName} ${(down.saleChangeMonthly ?? 0).toFixed(2)}%${rid ? ` → nuguzip.com/region/${rid}` : ""}`,
        );
      }
      if (lines.length > 0) {
        sections.push(["■ 매매지수 흐름 (한국부동산원·KB, 전월 대비)", ...lines].join("\n"));
      }
    }
  } catch (e) {
    logger.warn("[weekly-post] 지수 섹션 생략", e);
  }

  /* ② 주간 신고가 */
  try {
    const highs = await getWeeklyPriceHighs(3);
    if (highs.length > 0) {
      sections.push(
        [
          "■ 이번 주 신고가 (국토교통부 실거래 신고)",
          /* [945 #26] 단지별 내부링크 — 검색으로 들어온 사람이 글에서 끝나지 않게 */
          ...highs.map(
            (h) =>
              `· ${h.regionName} ${h.complexName} ${h.areaM2}㎡ — ${eok(h.priceKrw)} (직전 최고 ${eok(h.priorMaxKrw)}) → nuguzip.com/map?q=${encodeURIComponent(h.complexName)}`,
          ),
        ].join("\n"),
      );
      numbers.push(`신고가 ${highs.length}건`);
    }
  } catch (e) {
    logger.warn("[weekly-post] 신고가 섹션 생략", e);
  }

  /* ③ 이번 주 청약 */
  try {
    const cal = await buildApplyCalendar();
    if (cal.state === "ok") {
      const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
      const week = new Date(Date.now() + 9 * 3600_000 + 6 * 86400_000).toISOString().slice(0, 10);
      const ends = cal.days
        .filter((d) => d.date >= today && d.date <= week)
        .flatMap((d) => d.ends.map((i) => ({ ...i, date: d.date })));
      if (ends.length > 0) {
        sections.push(
          [
            "■ 7일 내 접수 마감 청약 (청약홈)",
            ...ends
              .slice(0, 4)
              .map((i) => `· ${i.date.slice(5).replace("-", ".")} 마감 — ${i.region} ${i.houseName}`),
            ends.length > 4 ? `외 ${ends.length - 4}건 → nuguzip.com/apply/calendar` : "전체 일정 → nuguzip.com/apply/calendar",
          ].join("\n"),
        );
        numbers.push(`청약 마감 ${ends.length}건`);
      }
    }
  } catch (e) {
    logger.warn("[weekly-post] 청약 섹션 생략", e);
  }

  /* ④ [AI-41] AI가 본 특이 단지·지역 — 규칙 판정(급변동·거래 급증)을 자동 발행에 합류.
     지수 무버 스냅샷을 재사용해 추가 조회 없이, "왜 특이한지" 산술 근거만 적는다. */
  try {
    const snaps = [...(await getAllRegionSnapshots()).values()].filter(
      (s) =>
        s.saleChangeMonthly !== undefined &&
        Number.isFinite(s.saleChangeMonthly) &&
        s.tradeCount !== undefined,
    );
    const unusual = snaps
      .map((s) => ({
        s,
        why:
          Math.abs(s.saleChangeMonthly ?? 0) >= 1.2
            ? `월간 ${(s.saleChangeMonthly ?? 0) > 0 ? "+" : ""}${s.saleChangeMonthly}% 급변동`
            : (s.tradeCount ?? 0) >= 200
              ? `월 거래 ${s.tradeCount}건 급증권`
              : null,
      }))
      .filter((x): x is { s: (typeof snaps)[number]; why: string } => x.why !== null)
      .sort((a, b) => Math.abs(b.s.saleChangeMonthly ?? 0) - Math.abs(a.s.saleChangeMonthly ?? 0))
      .slice(0, 3);
    if (unusual.length > 0) {
      sections.push(
        [
          "■ AI 워크벤치가 본 이번 주 특이 지역 (규칙 판정)",
          ...unusual.map(({ s, why }) => `· ${s.regionName} — ${why}`),
          "각 지역 5축 진단(실거래·전월세·공급·정성·거시) → nuguzip.com/analysis/ai/ai-diagnosis",
        ].join("\n"),
      );
      numbers.push(`특이 지역 ${unusual.length}곳`);
    }
  } catch (e) {
    logger.warn("[weekly-post] AI 특이 지역 섹션 생략", e);
  }

  if (sections.length === 0) return { posted: false, reason: "no-data-sections" };

  /* [945 · 실사용50 #26] 검색어형 제목 — "9월 1주 아파트 실거래" 류 질의에
     걸리는 형태(월·주차 + '아파트 실거래·시세' 키워드)를 앞에, 실측 헤드라인
     숫자를 뒤에 둔다. 주차는 KST 기준 월내 주차(1~5주). */
  const kst = new Date(Date.now() + 9 * 3600_000);
  const weekOfMonth = Math.ceil(kst.getUTCDate() / 7);
  const searchLead = `${kst.getUTCMonth() + 1}월 ${weekOfMonth}주 아파트 실거래·시세`;
  const title = `${searchLead} — ${numbers.slice(0, 3).join(" · ") || label}`;
  const content = [
    `${label} 시장을 공개 데이터로만 정리했습니다. 전 수치는 공표·신고 기준이며 투자 권유가 아닙니다.`,
    "",
    ...sections.flatMap((s) => [s, ""]),
    "지역별 전체 랭킹과 전세가율은 nuguzip.com/analysis/gap, 매일 갱신 카드는 nuguzip.com/api/og/market-card 에서.",
  ].join("\n");

  const { data: inserted, error: insErr } = await sb
    .from("board_posts")
    .insert({
      author_id: authorRow.author_id,
      board_type: "community",
      category: "정보/소식",
      title,
      content,
      tags: ["주간시황", "실거래"],
      ai_summary: `${label} 시황 자동 정리 — ${numbers.join(", ") || "지수·신고가·청약"}.`,
      ai_keywords: ["주간시황", "아파트", "실거래"],
      source_name: "누구집 자동 집계",
      external_key: externalKey,
      is_automated: true,
      automation_meta: {
        source: "weekly-market-post",
        image: "https://nuguzip.com/api/og/market-card",
      },
      is_published: true,
    })
    .select("id")
    .single();
  if (insErr) throw new Error(`board_posts 발행 실패: ${insErr.message}`);
  return { posted: true, postId: String(inserted?.id ?? "") };
}
