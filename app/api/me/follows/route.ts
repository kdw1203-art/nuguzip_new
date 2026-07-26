/**
 * GET  /api/me/follows                    — 내 팔로잉 목록 + 팔로워 수
 * POST /api/me/follows                    — { followedEmail } 또는 { handle } 팔로우
 * DELETE /api/me/follows                  — { followedEmail } 또는 { handle } 언팔로우
 * GET  /api/me/follows?check=email        — 특정 사용자를 팔로우 중인지 확인
 * GET  /api/me/follows?checkHandle=handle — 핸들(닉네임) 기준 확인 (이메일 비노출)
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import {
  followUser,
  unfollowUser,
  listFollowing,
  isFollowing,
  followCounts,
  resolveEmailByHandle,
} from "@/lib/follows/store-db";
import { applyRateLimit, WRITE_RATE_LIMIT, READ_RATE_LIMIT } from "@/lib/rate-limit";
import { dbUnavailable } from "@/lib/api/db-unavailable";

export const runtime = "nodejs";

/** 못 읽은 팔로우 상태를 "팔로우 안 함"·"0명"으로 답하지 않기 위한 안내. */
const FOLLOWS_UNAVAILABLE = "지금은 팔로우 정보를 불러올 수 없습니다. 잠시 후 다시 시도해 주세요.";

export async function GET(req: NextRequest) {
  const limited = await applyRateLimit(req, READ_RATE_LIMIT);
  if (limited) return limited;

  const session = await safeAuth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const myEmail = session.user.email;

  const check = req.nextUrl.searchParams.get("check");
  if (check) {
    try {
      const following = await isFollowing(myEmail, check);
      return NextResponse.json({ following });
    } catch (err) {
      return dbUnavailable("팔로우 여부 조회 실패", err, FOLLOWS_UNAVAILABLE);
    }
  }

  // 핸들(닉네임) 기준 확인 — 클라이언트에 이메일 노출 없이 상태 조회
  const checkHandle = req.nextUrl.searchParams.get("checkHandle");
  if (checkHandle) {
    try {
      const email = await resolveEmailByHandle(checkHandle);
      /* 핸들이 안 풀린 것(email 없음)은 "그런 사용자가 없다"라서 false 가 맞다. */
      const following = email ? await isFollowing(myEmail, email) : false;
      return NextResponse.json({ following });
    } catch (err) {
      return dbUnavailable("팔로우 여부 조회 실패 (handle)", err, FOLLOWS_UNAVAILABLE);
    }
  }

  try {
    const [list, counts] = await Promise.all([
      listFollowing(myEmail),
      followCounts(myEmail),
    ]);
    return NextResponse.json({
      following: list,
      followingCount: counts.following,
      followerCount: counts.followers,
    });
  } catch (err) {
    return dbUnavailable("팔로잉 목록·팔로워 수 조회 실패", err, FOLLOWS_UNAVAILABLE);
  }
}

export async function POST(req: NextRequest) {
  const limited = await applyRateLimit(req, WRITE_RATE_LIMIT);
  if (limited) return limited;

  const session = await safeAuth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "JSON이 필요합니다." }, { status: 400 });
  }

  let followedEmail = String(body.followedEmail ?? "").trim();
  if (!followedEmail) {
    const handle = String(body.handle ?? "").trim();
    if (handle) {
      followedEmail = (await resolveEmailByHandle(handle)) ?? "";
      if (!followedEmail) {
        return NextResponse.json({ error: "사용자를 찾을 수 없습니다." }, { status: 404 });
      }
    }
  }
  if (!followedEmail) {
    return NextResponse.json({ error: "followedEmail 또는 handle이 필요합니다." }, { status: 400 });
  }

  try {
    await followUser(session.user.email, followedEmail);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "팔로우 실패";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const limited = await applyRateLimit(req, WRITE_RATE_LIMIT);
  if (limited) return limited;

  const session = await safeAuth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "JSON이 필요합니다." }, { status: 400 });
  }

  let followedEmail = String(body.followedEmail ?? "").trim();
  if (!followedEmail) {
    const handle = String(body.handle ?? "").trim();
    if (handle) followedEmail = (await resolveEmailByHandle(handle)) ?? "";
  }
  if (!followedEmail) {
    return NextResponse.json({ error: "followedEmail 또는 handle이 필요합니다." }, { status: 400 });
  }

  await unfollowUser(session.user.email, followedEmail);
  return NextResponse.json({ ok: true });
}
