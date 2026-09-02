import "server-only";

import { getAllRegionSnapshots } from "@/lib/market/store";
import { buildApplyCalendar } from "@/lib/applyhome/calendar";
import { getWeeklyPriceHighs, type WeeklyHigh } from "@/lib/market/weekly-highs";
import { formatKrwShort } from "@/lib/market/format";
import { logger } from "@/lib/log";

/* ============================================================
   [#58] 네이버 블로그용 주간 시황 팩 — 붙여넣기 완성본 자동 생성.
   발행은 사장님이 한다(자동 발행 아님). 여기서는 "준비 시간 0"만 만든다:
   제목 후보 · 본문(블로그 서식) · 해시태그 · 공유 이미지 URL.

   원칙(사이트와 동일):
   - 전 수치 실측 + 기준시점. 소스가 실패하면 그 섹션이 통째로 빠진다.
   - 전망·권유·수익 보장류 문구 금지(소셜 금지어 검사와 같은 축).
   - 출처 문단은 항상 포함 — 블로그에 나가도 데이터의 출처가 따라간다.
   ============================================================ */

export type BlogPack = {
  /** 제목 후보 (2개) */
  titles: string[];
  /** 붙여넣기용 본문 (네이버 블로그 일반 서식 — 순수 텍스트) */
  body: string;
  hashtags: string[];
  /** 오늘의 시장 카드 이미지 URL ([#60]) */
  imageUrl: string;
  /** 실제로 포함된 섹션 이름들 (관리 화면 안내용) */
  sections: string[];
  /** 빠진 섹션 — 소스 실패로 못 넣은 것 (없음과 구분해 표시) */
  missing: string[];
  generatedAt: string;
};

function weekLabel(now = new Date()): string {
  const kst = new Date(now.getTime() + 9 * 3600_000);
  const y = kst.getUTCFullYear();
  const m = kst.getUTCMonth() + 1;
  // 월 내 주차 (1일이 속한 주 = 1주차, 단순 달력 규칙)
  const week = Math.ceil((kst.getUTCDate() + new Date(Date.UTC(y, m - 1, 1)).getUTCDay()) / 7);
  return `${y}년 ${m}월 ${week}주차`;
}

export async function buildBlogPack(): Promise<BlogPack> {
  const sections: string[] = [];
  const missing: string[] = [];
  const parts: string[] = [];
  const label = weekLabel();

  let upName: string | null = null;

  /* ── 1) 지수 무버 (REB/KB 스냅샷) ── */
  try {
    const snapshots = await getAllRegionSnapshots();
    const movers = [...snapshots.values()]
      .filter((s) => s.saleChangeMonthly !== undefined && Number.isFinite(s.saleChangeMonthly))
      .sort((a, b) => (b.saleChangeMonthly ?? 0) - (a.saleChangeMonthly ?? 0));
    if (movers.length >= 5) {
      const ups = movers.slice(0, 3).filter((s) => (s.saleChangeMonthly ?? 0) > 0);
      const downs = movers.slice(-3).filter((s) => (s.saleChangeMonthly ?? 0) < 0).reverse();
      const lines: string[] = [];
      if (ups.length > 0) {
        upName = ups[0].regionName;
        lines.push("📈 매매지수 상승 상위");
        for (const s of ups) {
          lines.push(`· ${s.regionName} +${(s.saleChangeMonthly ?? 0).toFixed(2)}%`);
        }
      }
      if (downs.length > 0) {
        lines.push("");
        lines.push("📉 매매지수 하락 상위");
        for (const s of downs) {
          lines.push(`· ${s.regionName} ${(s.saleChangeMonthly ?? 0).toFixed(2)}%`);
        }
      }
      if (lines.length > 0) {
        parts.push(
          [
            `■ 이번 주 지역별 흐름 (한국부동산원·KB 전월 대비)`,
            "",
            ...lines,
            "",
            `전체 ${movers.length}개 지역 랭킹과 전세가율은 내집나우 갭 스크리너에서 볼 수 있어요.`,
            `→ https://nuguzip.com/analysis/gap`,
          ].join("\n"),
        );
        sections.push("지역별 지수 흐름");
      }
    } else {
      missing.push("지역별 지수 흐름");
    }
  } catch (e) {
    logger.error("[blog-pack] 스냅샷 실패", e);
    missing.push("지역별 지수 흐름");
  }

  /* ── 2) 주간 신고가 ── */
  try {
    const highs: WeeklyHigh[] = await getWeeklyPriceHighs(5);
    if (highs.length > 0) {
      const lines = highs.map(
        (h) =>
          `· ${h.regionName} ${h.complexName} ${h.areaM2}㎡ — ${formatKrwShort(h.priceKrw)} (직전 최고 ${formatKrwShort(h.priorMaxKrw)})`,
      );
      parts.push(
        [
          "■ 이번 주 신고가 단지 (국토교통부 실거래 신고 기준)",
          "",
          ...lines,
          "",
          "※ 계약 후 30일 신고 기한이 있어 이후 정정·취소될 수 있습니다.",
        ].join("\n"),
      );
      sections.push("주간 신고가");
    }
  } catch (e) {
    logger.error("[blog-pack] 신고가 실패", e);
    missing.push("주간 신고가");
  }

  /* ── 3) 이번 주 청약 ── */
  try {
    const cal = await buildApplyCalendar();
    if (cal.state === "ok") {
      const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
      const week = new Date(Date.now() + 9 * 3600_000 + 6 * 86400_000).toISOString().slice(0, 10);
      const ends = cal.days
        .filter((d) => d.date >= today && d.date <= week)
        .flatMap((d) => d.ends.map((i) => ({ ...i, date: d.date })));
      if (ends.length > 0) {
        const lines = ends
          .slice(0, 6)
          .map((i) => `· ${i.date.slice(5).replace("-", ".")} 마감 — ${i.region} ${i.houseName}`);
        parts.push(
          [
            "■ 7일 내 접수 마감 청약",
            "",
            ...lines,
            ends.length > 6 ? `외 ${ends.length - 6}건` : "",
            "",
            "전체 일정 → https://nuguzip.com/apply/calendar",
          ]
            .filter(Boolean)
            .join("\n"),
        );
        sections.push("청약 마감");
      }
    } else if (cal.state === "error") {
      missing.push("청약 마감");
    }
  } catch (e) {
    logger.error("[blog-pack] 청약 실패", e);
    missing.push("청약 마감");
  }

  const intro = `${label} 수도권 아파트 시장을 공개 데이터로만 정리했습니다. 아래 수치는 한국부동산원·KB 공표 통계와 국토교통부 실거래 신고, 청약홈 공고 기준이며, 특정 지역·단지에 대한 투자 권유가 아닙니다.`;
  const outro = [
    "─────────────────",
    "데이터 출처: 한국부동산원·KB(지수), 국토교통부 실거래가(신고가), 청약홈(청약 일정)",
    "매일 갱신되는 지도·시세·임장노트는 내집나우에서 → https://nuguzip.com",
    "이 정리는 산술 사실의 요약이며 투자 판단과 책임은 각자에게 있습니다.",
  ].join("\n");

  const body = [intro, ...parts, outro].join("\n\n");

  const titles = [
    upName
      ? `${label} 아파트 시장 정리 — ${upName} 상승 1위, 신고가·청약 마감 한눈에`
      : `${label} 아파트 시장 정리 — 지수·신고가·청약 마감 한눈에`,
    `이번 주 부동산 데이터 요약 (${label}) — 실거래 신고 기준`,
  ];

  return {
    titles,
    body,
    hashtags: [
      "부동산",
      "아파트",
      "실거래가",
      "부동산시장",
      "청약",
      "아파트시세",
      "내집나우",
    ],
    imageUrl: "https://nuguzip.com/api/og/market-card",
    sections,
    missing,
    generatedAt: new Date().toISOString(),
  };
}
