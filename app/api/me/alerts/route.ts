import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { applyRateLimit } from "@/lib/rate-limit";
import {
  addAlertSubscription,
  isValidAlertType,
  listAlertSubscriptions,
  removeAlertSubscription,
} from "@/lib/alerts/subscriptions";

export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 알림 구독 목록 (#47) */
export async function GET() {
  const session = await safeAuth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const items = await listAlertSubscriptions(session.user.email);
  return NextResponse.json({ items });
}

/** 알림 구독 추가 — body: { type: "region"|"keyword", value: string } */
export async function POST(req: NextRequest) {
  const limited = await applyRateLimit(req);
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

  const type = body.type;
  if (!isValidAlertType(type)) {
    return NextResponse.json(
      { error: "type 은 region 또는 keyword 여야 합니다." },
      { status: 400 },
    );
  }

  const result = await addAlertSubscription(
    session.user.email,
    type,
    String(body.value ?? ""),
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result.item, { status: 201 });
}

/** 알림 구독 해지 — ?id=<uuid> */
export async function DELETE(req: NextRequest) {
  const session = await safeAuth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "id 가 필요합니다." }, { status: 400 });
  }
  const ok = await removeAlertSubscription(session.user.email, id);
  if (!ok) {
    return NextResponse.json({ error: "구독 해지에 실패했어요." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
