import { CRAWLER_ENDPOINT_CACHE_CONTROL } from "@/lib/http/cache-policy";
import { listReportMonths, formatYmKo } from "@/lib/reports/monthly";
import { listPublicNotes } from "@/lib/inspection/store-db";

/**
 * N3 — RSS 2.0 피드 (/feed.xml).
 *
 * 왜 RSS 인가:
 *   - 네이버 서치어드바이저는 사이트맵과 **별도로** RSS 를 제출받는다. 새 글이
 *     빨리 잡히는 경로가 하나 더 생긴다.
 *   - AI 크롤러·뉴스 애그리게이터·개인 리더가 구독하는 표면이다. 사이트맵은
 *     "URL 목록"이지만 RSS 는 "무엇이 새로 나왔는가"라서 성격이 다르다.
 *
 * 무엇을 싣는가: 월간 실거래 리포트(집계 데이터) + 공개 임장노트. 둘 다 실제로
 * 존재하는 URL 이고, 날짜는 DB 의 갱신 시각을 그대로 쓴다. 갱신 시각을 모르는
 * 항목에는 pubDate 를 아예 넣지 않는다 — 오늘 날짜를 찍으면 리더가 매번
 * "방금 올라온 글"로 오해한다(사이트맵 lastmod 에서 이미 겪은 문제다).
 *
 * 라우트 핸들러인 이유는 sitemap.xml 과 같다 — 런타임 생성(서비스 롤 키가 있어
 * 데이터가 빠지지 않음) + Cache-Control 직접 지정(Next 가 덮지 않음).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BASE_URL = "https://nuguzip.com";
const MAX_REPORTS = 12;
const MAX_NOTES = 20;

type FeedItem = {
  title: string;
  link: string;
  description: string;
  /** ISO 문자열 — 확인된 갱신 시각이 있을 때만 */
  date: string | null;
  category: string;
};

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** RSS 2.0 pubDate 는 RFC 822 형식을 요구한다. */
function rfc822(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toUTCString();
}

async function collectItems(): Promise<FeedItem[]> {
  const items: FeedItem[] = [];

  try {
    const months = await listReportMonths();
    for (const m of months.slice(0, MAX_REPORTS)) {
      const label = formatYmKo(m.ym);
      items.push({
        title: `${label} 아파트 실거래 리포트 — ${m.regionCount}개 지역 ${m.txCount.toLocaleString("ko-KR")}건`,
        link: `${BASE_URL}/reports/${m.ym}`,
        description: `${label} 누구집 집계 지역 ${m.regionCount}곳의 아파트 매매 실거래 ${m.txCount.toLocaleString("ko-KR")}건. 지역별 거래량·평균가·전월 대비 변동을 국토교통부 실거래 신고 기준으로 정리했습니다.`,
        date: m.updatedAt,
        category: "월간 리포트",
      });
    }
  } catch {
    // 조회 실패 시 그 블록만 비운다 — 피드 자체는 낸다.
  }

  try {
    const notes = await listPublicNotes(MAX_NOTES);
    for (const n of notes) {
      if (!n.isPublic) continue;
      const where = [n.region, n.aptName].filter(Boolean).join(" ").trim();
      const summary = (n.summary ?? "").trim();
      items.push({
        title: n.title,
        link: `${BASE_URL}/notes/${n.id}`,
        description:
          summary ||
          (where ? `${where} 현장 방문 기록입니다.` : "현장 방문 기록입니다."),
        date: n.updatedAt || n.createdAt || null,
        category: "임장노트",
      });
    }
  } catch {
    // 생략
  }

  // 날짜가 있는 항목을 최신순으로, 날짜 없는 항목은 뒤로.
  items.sort((a, b) => {
    if (a.date && b.date) return b.date.localeCompare(a.date);
    if (a.date) return -1;
    if (b.date) return 1;
    return 0;
  });
  return items;
}

function serializeFeed(items: FeedItem[]): string {
  const lastBuild = new Date().toUTCString();
  const body = items
    .map((it) => {
      const parts = [
        `<title>${xmlEscape(it.title)}</title>`,
        `<link>${xmlEscape(it.link)}</link>`,
        `<guid isPermaLink="true">${xmlEscape(it.link)}</guid>`,
        `<category>${xmlEscape(it.category)}</category>`,
        `<description>${xmlEscape(it.description)}</description>`,
      ];
      const pub = it.date ? rfc822(it.date) : null;
      if (pub) parts.push(`<pubDate>${pub}</pubDate>`);
      return `<item>\n${parts.join("\n")}\n</item>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
<title>누구집 — 실거래 리포트·임장노트</title>
<link>${BASE_URL}</link>
<atom:link href="${BASE_URL}/feed.xml" rel="self" type="application/rss+xml" />
<description>국토교통부 실거래 공개 데이터로 만드는 월간 지역 리포트와, 직접 다녀온 현장 기록(임장노트)을 발행합니다.</description>
<language>ko-kr</language>
<lastBuildDate>${lastBuild}</lastBuildDate>
<generator>nuguzip.com</generator>
${body}
</channel>
</rss>
`;
}

export async function GET(): Promise<Response> {
  const items = await collectItems();
  return new Response(serializeFeed(items), {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": CRAWLER_ENDPOINT_CACHE_CONTROL,
      "X-Robots-Tag": "noindex",
    },
  });
}
