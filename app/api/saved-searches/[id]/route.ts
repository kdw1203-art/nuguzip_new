/**
 * /api/saved-searches/[id]
 *  - PATCH  : 알림 on/off 토글 (body { alertEnabled: boolean })
 *  - DELETE : 저장 검색 삭제
 * 둘 다 로그인 필수이며, store 가 id + user_email 로 소유자 스코프를 강제한다.
 * Next.js 15: route context 의 params 는 Promise 이므로 await 해서 사용한다.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { deleteSavedSearch, setAlertEnabled } from "@/lib/saved-search/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await safeAuth();
  const email = session?.user?.email ?? null;
  if (!email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const rl = rateLimit(`saved-search:patch:${email}`, {
    limit: 60,
    windowMs: 60 * 60_000,
  });
  if (!rl.ok) return tooManyRequests(rl.retryAfterSec);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON 본문이 필요합니다." }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  if (typeof b.alertEnabled !== "boolean") {
    return NextResponse.json(
      { error: "alertEnabled 값이 필요합니다." },
      { status: 400 },
    );
  }

  const result = await setAlertEnabled(email, id, b.alertEnabled);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? "변경에 실패했습니다." },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, alertEnabled: b.alertEnabled });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await safeAuth();
  const email = session?.user?.email ?? null;
  if (!email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const rl = rateLimit(`saved-search:delete:${email}`, {
    limit: 60,
    windowMs: 60 * 60_000,
  });
  if (!rl.ok) return tooManyRequests(rl.retryAfterSec);

  const result = await deleteSavedSearch(email, id);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? "삭제에 실패했습니다." },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
