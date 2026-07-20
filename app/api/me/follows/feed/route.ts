/**
 * GET /api/me/follows/feed — 팔로우한 작성자의 공개 임장노트 피드 (authed)
 * /discover "팔로잉" 탭 전용. 응답 카드는 DiscoverCard 형태 (이메일 비노출 — 작성자 마스킹).
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { listFollowing } from "@/lib/follows/store-db";
import {
  listPublicNotes,
  inspectionAverageScore,
  type InspectionNote,
} from "@/lib/inspection/store-db";
import { resolveComplexHref } from "@/lib/newui/complex-link";
import { applyRateLimit, READ_RATE_LIMIT } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function grade(v: number): "상" | "중" | "하" {
  if (v >= 4) return "상";
  if (v >= 3) return "중";
  return "하";
}

function maskAuthor(n: InspectionNote): string {
  if (n.authorLabel && n.authorLabel.trim()) return n.authorLabel.trim();
  const local = n.authorEmail.split("@")[0] ?? "이웃";
  return `${local.slice(0, 2) || "이웃"}** 이웃`;
}

const SIZES = ["tall", "short", "mid", "short", "mid", "tall"] as const;

export async function GET(req: NextRequest) {
  const limited = await applyRateLimit(req, READ_RATE_LIMIT);
  if (limited) return limited;

  const session = await safeAuth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const follows = await listFollowing(session.user.email).catch(() => []);
  if (follows.length === 0) {
    return NextResponse.json({ follows: 0, items: [] });
  }

  const followedSet = new Set(follows.map((f) => f.followedEmail));

  let notes: InspectionNote[] = [];
  try {
    const rows = await listPublicNotes(100);
    notes = rows.filter((n) => followedSet.has(n.authorEmail)).slice(0, 30);
  } catch {
    notes = [];
  }

  const items = await Promise.all(
    notes.map(async (n, i) => {
      const oneLiner = n.summary?.trim() || n.sections.pros?.trim() || n.title;
      return {
        id: n.id,
        title: oneLiner.length > 34 ? `${oneLiner.slice(0, 34)}…` : oneLiner,
        aptName: n.aptName?.trim() || null,
        region: n.region,
        author: maskAuthor(n),
        saves:
          Math.round(inspectionAverageScore(n.scores) * 40) +
          (n.checklist.filter((c) => c.done).length || 0),
        visited: Boolean(n.visitDate),
        size: SIZES[i % SIZES.length],
        ratings: [
          { icon: "☀", grade: grade(n.scores.location) },
          { icon: "🔊", grade: grade(n.scores.school) },
          { icon: "🅿", grade: grade(n.scores.facility) },
          { icon: "🚇", grade: grade(n.scores.transport) },
        ],
        createdAt: Date.parse(n.createdAt) || 0,
        isReal: true,
        complexHref: await resolveComplexHref(n.aptName, n.region).catch(() => null),
      };
    }),
  );

  return NextResponse.json({ follows: follows.length, items });
}
