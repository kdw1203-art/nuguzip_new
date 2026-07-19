/**
 * 주간 다이제스트 (#86) — 최근 7일 실데이터 요약 (서버 전용, 1h 캐시).
 *
 * - 뉴스 하이라이트: board_posts 자동 수집 뉴스 (community·is_automated·is_published,
 *   source_published_at 기준 7일 이내, 없으면 created_at) 상위 8건
 * - 시장 요약: market_region_price 최신 스냅샷 (서울/경기/인천 주요 지역) + 전월 대비 등락
 * - 커뮤니티: 최근 7일 이웃(비자동) 글 수·제목
 * 모든 항목은 실패·빈 데이터 시 빈 배열/0 으로 폴백한다 (가짜 숫자 없음).
 */
import "server-only";
import { unstable_cache } from "next/cache";
import { readBoardPosts, readTownPosts } from "@/lib/newui/board-posts";
import { getMarketFreshnessDateLabel } from "@/lib/newui/freshness";
import { getAllRegionSnapshots } from "@/lib/market/store";
import { logger } from "@/lib/log";
import type { Post } from "@/lib/types/post";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const NEWS_LIMIT = 8;
const COMMUNITY_TITLE_LIMIT = 3;

export type DigestDeltaTone = "up" | "down" | "flat";

export interface DigestNewsItem {
  id: string;
  title: string;
  sourceName: string | null;
  region: string | null;
  /** 표시용 게시 시각 (source_published_at ?? created_at, ISO) */
  publishedAt: string;
}

export interface DigestMarketItem {
  regionId: string;
  name: string;
  city: string;
  /** "12.8억" 형식 평균 매매가 */
  price: string;
  /** "▲ 0.6%" 형식 전월 대비 등락 */
  delta: string;
  tone: DigestDeltaTone;
  /** "2026.05" — market_region_price.period(yyyymm) */
  periodLabel: string | null;
}

export interface DigestCommunitySummary {
  count: number;
  titles: Array<{ id: string; title: string }>;
}

export interface WeeklyDigest {
  /** "7월 3주차" */
  weekLabel: string;
  /** 다이제스트 계산 시각 (ISO) — 데이터 기준 시각 캡션용 */
  generatedAt: string;
  /** 실거래 적재 기준일 "YYYY.MM.DD" (market_ingest_log) — 없으면 null */
  marketAsOf: string | null;
  news: DigestNewsItem[];
  market: DigestMarketItem[];
  community: DigestCommunitySummary;
}

/** 시장 요약 대상 주요 지역 (market_region_price region_id 기준) */
const MAJOR_REGIONS: Array<{ id: string; city: string }> = [
  { id: "gangnam", city: "서울" },
  { id: "mapo", city: "서울" },
  { id: "songpa", city: "서울" },
  { id: "gwacheon", city: "경기" },
  { id: "gwangmyeong", city: "경기" },
  { id: "incheon-bupyeong", city: "인천" },
];

function formatEok(won: number): string {
  const eok = won / 100_000_000;
  const s = eok >= 10 ? eok.toFixed(1) : eok.toFixed(2);
  return `${s.replace(/\.?0+$/, "")}억`;
}

function deltaOf(changePct: number | undefined): { delta: string; tone: DigestDeltaTone } {
  if (typeof changePct !== "number" || !Number.isFinite(changePct)) {
    return { delta: "— 0.0%", tone: "flat" };
  }
  const arrow = changePct > 0 ? "▲" : changePct < 0 ? "▼" : "—";
  const tone: DigestDeltaTone = changePct > 0.1 ? "up" : changePct < -0.1 ? "down" : "flat";
  return { delta: `${arrow} ${Math.abs(changePct).toFixed(1)}%`, tone };
}

function displayTime(p: Post): number {
  const t = Date.parse(p.sourcePublishedAt || p.createdAt);
  return Number.isFinite(t) ? t : 0;
}

function weekLabelOf(now: Date): string {
  const month = now.getMonth() + 1;
  const week = Math.min(Math.ceil(now.getDate() / 7), 5);
  return `${month}월 ${week}주차`;
}

async function computeNews(sinceMs: number): Promise<DigestNewsItem[]> {
  const posts = await readBoardPosts().catch((): Post[] => []);
  return posts
    .filter((p) => p.isAutomated && displayTime(p) >= sinceMs)
    .sort((a, b) => displayTime(b) - displayTime(a))
    .slice(0, NEWS_LIMIT)
    .map((p) => ({
      id: p.id,
      title: p.title,
      sourceName: p.sourceName ?? null,
      region: p.city || null,
      publishedAt: new Date(displayTime(p)).toISOString(),
    }));
}

async function computeMarket(): Promise<DigestMarketItem[]> {
  const snapshots = await getAllRegionSnapshots().catch(
    () => new Map<string, never>(),
  );
  const items: DigestMarketItem[] = [];
  for (const target of MAJOR_REGIONS) {
    const snap = snapshots.get(target.id);
    if (!snap) continue;
    const priceWon = snap.avgSale ?? snap.medianSale;
    if (typeof priceWon !== "number" || priceWon <= 0) continue;
    const { delta, tone } = deltaOf(snap.saleChangeMonthly ?? snap.saleChangeWeekly);
    const period = /^\d{6}$/.test(snap.period)
      ? `${snap.period.slice(0, 4)}.${snap.period.slice(4, 6)}`
      : null;
    items.push({
      regionId: target.id,
      name: snap.regionName,
      city: target.city,
      price: formatEok(priceWon),
      delta,
      tone,
      periodLabel: period,
    });
  }
  return items;
}

async function computeCommunity(sinceMs: number): Promise<DigestCommunitySummary> {
  const posts = await readTownPosts().catch((): Post[] => []);
  const recent = posts.filter(
    (p) => !p.isAutomated && Date.parse(p.createdAt) >= sinceMs,
  );
  return {
    count: recent.length,
    titles: recent
      .slice(0, COMMUNITY_TITLE_LIMIT)
      .map((p) => ({ id: p.id, title: p.title })),
  };
}

async function computeWeeklyDigest(): Promise<WeeklyDigest> {
  const now = new Date();
  const sinceMs = now.getTime() - WEEK_MS;
  const [news, market, community, marketAsOf] = await Promise.all([
    computeNews(sinceMs),
    computeMarket(),
    computeCommunity(sinceMs),
    getMarketFreshnessDateLabel().catch((): string | null => null),
  ]);
  return {
    weekLabel: weekLabelOf(now),
    generatedAt: now.toISOString(),
    marketAsOf,
    news,
    market,
    community,
  };
}

const loadWeeklyDigestCached = unstable_cache(
  async (): Promise<WeeklyDigest> => {
    try {
      return await computeWeeklyDigest();
    } catch (e) {
      logger.error("[getWeeklyDigest]", e);
      return {
        weekLabel: weekLabelOf(new Date()),
        generatedAt: new Date().toISOString(),
        marketAsOf: null,
        news: [],
        market: [],
        community: { count: 0, titles: [] },
      };
    }
  },
  ["newui-weekly-digest"],
  { revalidate: 3600 },
);

/** 최근 7일 주간 다이제스트 (1h 캐시). 실패 시 빈 섹션 폴백. */
export async function getWeeklyDigest(): Promise<WeeklyDigest> {
  return loadWeeklyDigestCached();
}
