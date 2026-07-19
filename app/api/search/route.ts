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

  try {
    // 커뮤니티 게시글
    if (type === "all" || type === "post") {
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
    }

    // 리포트
    if (type === "all" || type === "report") {
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
    }

    // 모임
    if (type === "all" || type === "meeting") {
      const meetings = await listMeetings();
      for (const m of meetings) {
        const searchable = `${m.title} ${m.description} ${m.tags.join(" ")} ${m.region}`.toLowerCase();
        if (searchable.includes(lower)) {
          results.push({
            id: m.id,
            type: "meeting",
            title: m.title,
            excerpt: m.description.slice(0, 200),
            url: `/market/${m.id}`,
            tags: m.tags,
            createdAt: m.createdAt,
          });
        }
      }
    }

    // 전문가
    if (type === "all" || type === "expert") {
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
    }
  } catch (err) {
    logger.error("[search] error:", err);
  }

  // 정렬 (최신순)
  results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const total = results.length;
  const start = (page - 1) * limit;
  const paged = results.slice(start, start + limit);

  return NextResponse.json({
    results: paged,
    total,
    page,
    limit,
    query: q,
  });
}
