import { NextResponse } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import {
  addBookmark,
  isBookmarked,
  listBookmarks,
  removeBookmark,
  type BookmarkTargetType,
} from "@/lib/bookmarks/store";
import {
  checkBookmarkAddQuota,
  quotaDeniedJson,
  resolveQuotaPlan,
} from "@/lib/subscriptions/usage-summary";
import { withUserQuotaLock } from "@/lib/subscriptions/quota-lock";

export const runtime = "nodejs";

function isValidType(v: unknown): v is BookmarkTargetType {
  return (
    v === "post" ||
    v === "report" ||
    v === "expert" ||
    v === "meeting" ||
    v === "market" ||
    v === "complex"
  );
}

export async function GET(req: Request) {
  const session = await safeAuth();
  if (!session?.user?.email) return NextResponse.json({ items: [] });
  const url = new URL(req.url);
  const t = url.searchParams.get("type");
  const type = isValidType(t) ? t : undefined;
  const items = await listBookmarks(session.user.email, type);
  return NextResponse.json({ items });
}

export async function POST(req: Request) {
  const session = await safeAuth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    type?: string;
    id?: string;
    label?: string;
    note?: string;
  };
  if (!isValidType(body.type) || !body.id) {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }
  const targetType = body.type;
  const targetId = body.id;

  const email = session.user.email;

  return withUserQuotaLock(`bookmark:${email}`, async () => {
    const [plan, already] = await Promise.all([
      resolveQuotaPlan(email, session.user.plan),
      isBookmarked(email, targetType, targetId),
    ]);
    const quota = await checkBookmarkAddQuota(email, plan, already);
    if (!quota.allowed) {
      const payload = quotaDeniedJson(
        quota.message,
        quota.requiredTier,
        quota.used,
        quota.limit,
      );
      return NextResponse.json(payload, { status: 403 });
    }

    const rec = await addBookmark({
      userEmail: email,
      targetType,
      targetId,
      label: body.label ?? null,
      note: body.note ?? null,
    });
    return NextResponse.json({ bookmark: rec });
  });
}

export async function DELETE(req: Request) {
  const session = await safeAuth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const url = new URL(req.url);
  const type = url.searchParams.get("type");
  const id = url.searchParams.get("id");
  if (!isValidType(type) || !id) {
    return NextResponse.json({ error: "invalid query" }, { status: 400 });
  }
  await removeBookmark(session.user.email, type, id);
  return NextResponse.json({ ok: true });
}
