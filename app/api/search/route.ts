import { NextResponse } from "next/server";
import { readPosts } from "@/lib/posts-store";
import { listReports } from "@/lib/reports/store-db";
import { listMeetings } from "@/lib/meetings/store-db";
import { listExperts } from "@/lib/experts/store-db";
import { logger } from "@/lib/log";

export const runtime = "nodejs";

export interface SearchResult {
  id: string;
  type: "post" | "report" | "meeting" | "expert";
  title: string;
  excerpt: string;
  url: string;
  tags: string[];
  createdAt: string;
}

function excerptAroundQuery(text: string, q: string, maxLen = 200): string {
  const t = text.trim();
  if (!t) return "";
  const lower = q.toLowerCase();
  const idx = t.toLowerCase().indexOf(lower);
  if (idx < 0) return t.slice(0, maxLen);
  const start = Math.max(0, idx - 40);
  return t.slice(start, start + maxLen);
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const type = searchParams.get("type") ?? "all";
  const page = Math.max(1, Number(searchParams.get("page") ?? 1));
  const limit = Math.min(50, Math.max(1, Number(searchParams.get("limit") ?? 20)));

  if (!q || q.length < 2) {
    return NextResponse.json({ results: [], total: 0, query: q });
  }

  const lower = q.toLowerCase();
  const results: SearchResult[] = [];

  /* 어느 소스를 **읽어 봤는데 실패했는지** 기록한다.
     예전에는 네 소스를 try 하나로 묶고 catch 에서 로그만 남겼다. 그래서
     게시글 조회가 터지면 리포트·모임·전문가는 아예 시도조차 못 한 채로,
     응답은 200 에 `total: 0` — "검색 결과가 없습니다"와 구분이 되지 않았다.
     못 찾은 것과 못 읽은 것은 다른 사실이다. 소스별로 따로 잡고, 실패한
     소스를 응답에 적어 보낸다. */
  const failedSources: string[] = [];
  const attemptedSources: string[] = [];

  async function fromSource(name: string, run: () => Promise<void>) {
    attemptedSources.push(name);
    try {
      await run();
    } catch (err) {
      failedSources.push(name);
      logger.error(`[search] ${name} 조회 실패:`, err);
    }
  }

  // 커뮤니티 게시글
  if (type === "all" || type === "post") {
    await fromSource("post", async () => {
      const posts = await readPosts();
      for (const p of posts) {
        const searchable = `${p.title} ${p.body ?? ""} ${(p.tags ?? []).join(" ")}`.toLowerCase();
        if (searchable.includes(lower)) {
          results.push({
            id: p.id,
            type: "post",
            title: p.title,
            excerpt: excerptAroundQuery(p.body ?? "", q),
            url: `/community/${p.id}`,
            tags: p.tags ?? [],
            createdAt: p.createdAt ?? new Date().toISOString(),
          });
        }
      }
    });
  }

  // 리포트
  if (type === "all" || type === "report") {
    await fromSource("report", async () => {
      const reports = await listReports();
      for (const r of reports) {
        const searchable =
          `${r.title} ${r.subtitle ?? ""} ${r.previewContent ?? ""} ${r.tags.join(" ")}`.toLowerCase();
        if (searchable.includes(lower)) {
          results.push({
            id: r.id,
            type: "report",
            title: r.title,
            excerpt: excerptAroundQuery(r.subtitle ?? r.previewContent ?? "", q),
            url: `/reports/${r.id}`,
            tags: r.tags,
            createdAt: r.publishedAt,
          });
        }
      }
    });
  }

  // 모임
  if (type === "all" || type === "meeting") {
    await fromSource("meeting", async () => {
      const meetings = await listMeetings();
      for (const m of meetings) {
        const searchable = `${m.title} ${m.description} ${m.tags.join(" ")} ${m.region}`.toLowerCase();
        if (searchable.includes(lower)) {
          results.push({
            id: m.id,
            type: "meeting",
            title: m.title,
            excerpt: m.description.slice(0, 200),
            /* 예전에는 `/market/${m.id}` 였다. 그런 경로는 이 앱에 없다
               (app/market 디렉터리 자체가 없다) — 모임 검색 결과를 누르면
               전부 404 였다. 모임 상세는 /town/groups/[id] 다. */
            url: `/town/groups/${m.id}`,
            tags: m.tags,
            createdAt: m.createdAt,
          });
        }
      }
    });
  }

  // 전문가
  if (type === "all" || type === "expert") {
    await fromSource("expert", async () => {
      const experts = await listExperts();
      for (const e of experts) {
        const pub = e as unknown as {
          id: string; name: string; title: string; introduction: string;
          specialties: string[]; regions: string[]; createdAt: string;
        };
        const searchable = `${pub.name} ${pub.title} ${pub.introduction} ${pub.specialties.join(" ")} ${pub.regions.join(" ")}`.toLowerCase();
        if (searchable.includes(lower)) {
          results.push({
            id: pub.id,
            type: "expert",
            title: pub.name,
            excerpt: (pub.introduction ?? "").slice(0, 200),
            url: `/experts/${pub.id}`,
            tags: pub.specialties ?? [],
            createdAt: pub.createdAt ?? new Date().toISOString(),
          });
        }
      }
    });
  }

  // 정렬 (최신순)
  results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const total = results.length;
  const start = (page - 1) * limit;
  const paged = results.slice(start, start + limit);

  /* 물어본 소스를 **하나도** 못 읽었다면 우리가 아는 건 "없다"가 아니라
     "모른다"다. 그때 200 + total 0 을 주면 받는 쪽은 결과가 없다고 읽는다.
     그래서 503 으로 준다. 일부만 실패했다면 결과는 주되 무엇이 빠졌는지
     같이 적는다 — 그래야 "전부"가 아님을 알 수 있다. */
  if (failedSources.length > 0 && failedSources.length === attemptedSources.length) {
    return NextResponse.json(
      {
        error: "검색 소스를 지금 읽지 못했어요. 결과가 없는 게 아니라 조회에 실패한 상태입니다.",
        query: q,
        failedSources,
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json({
    results: paged,
    total,
    page,
    limit,
    query: q,
    /* 부분 실패 공개: 이 필드가 있으면 total 은 "전체"가 아니라
       "읽는 데 성공한 소스 기준"이다. */
    partial: failedSources.length > 0,
    ...(failedSources.length > 0 ? { failedSources } : {}),
  });
}
