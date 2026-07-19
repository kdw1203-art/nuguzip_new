import { NextResponse } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { detectShellFromUserAgent } from "@/lib/platform-shell";
import { recordPlatformEvent } from "@/lib/platform-events";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await safeAuth();
  const platform = detectShellFromUserAgent(req.headers.get("user-agent"));
  const body = (await req.json().catch(() => ({}))) as {
    eventName?: string;
    source?: string;
    campaign?: string;
    path?: string;
    metadata?: Record<string, unknown>;
  };

  const eventName = body.eventName?.trim().slice(0, 80);
  if (!eventName) {
    return NextResponse.json({ error: "eventName이 필요합니다." }, { status: 400 });
  }

  const blocked = new Set(["password", "token", "secret", "authorization", "cookie"]);
  const metadata = Object.fromEntries(
    Object.entries(body.metadata ?? {})
      .filter(([k]) => !blocked.has(k.toLowerCase()))
      .slice(0, 30),
  );

  await recordPlatformEvent({
    platform,
    eventName,
    userEmail: session?.user?.email ?? null,
    source: body.source,
    campaign: body.campaign,
    path: body.path,
    metadata,
  });

  return NextResponse.json({ ok: true, platform });
}

