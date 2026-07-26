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

  /* 팔로우 목록을 못 읽었을 때 빈 배열로 바꾸면 `follows: 0` 이 되고, 화면에서는
     "아직 팔로우한 이웃이 없어요" 가 된다 — 실제로는 스무 명을 팔로우한 사람일 수
     있다. 조회 실패는 "없음"이 아니므로 못 준다고 답한다(503). */
  const followed = await listFollowing(session.user.email).then(
    (rows) => ({ ok: true as const, rows }),
    (err: unknown) => ({
      ok: false as const,
      cause: err instanceof Error ? err.message : String(err),
    }),
  );
  if (!followed.ok) {
    return NextResponse.json(
      { error: `팔로잉 목록을 불러오지 못했습니다: ${followed.cause}` },
      { status: 503 },
    );
  }
  const follows = followed.rows;
  if (follows.length === 0) {
    return NextResponse.json({ follows: 0, items: [] });
  }

  const followedSet = new Set(follows.map((f) => f.followedEmail));

  /* 같은 이유로 노트 조회 실패도 빈 피드로 눌러 버리지 않는다. 여기서 [] 를 주면
     "팔로우한 이웃이 아직 글을 안 썼어요" 로 읽히는데, 그건 사실이 아니다. */
  const loaded = await listPublicNotes(100).then(
    (rows) => ({ ok: true as const, rows }),
    (err: unknown) => ({
      ok: false as const,
      cause: err instanceof Error ? err.message : String(err),
    }),
  );
  if (!loaded.ok) {
    return NextResponse.json(
      { error: `팔로잉 피드를 불러오지 못했습니다: ${loaded.cause}` },
      { status: 503 },
    );
  }
  const notes: InspectionNote[] = loaded.rows
    .filter((n) => followedSet.has(n.authorEmail))
    .slice(0, 30);

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
