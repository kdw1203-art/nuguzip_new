import { NextResponse } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { createMeeting, listMeetings } from "@/lib/meetings/store-db";

export const runtime = "nodejs";

export async function GET() {
  const groups = await listMeetings();
  return NextResponse.json({ groups });
}

export async function POST(req: Request) {
  const session = await safeAuth();
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "JSON이 필요합니다." }, { status: 400 });
  }

  const title = String(body.title ?? "").trim();
  const description = String(body.description ?? "").trim();
  const city = String(body.city ?? "").trim();
  const district = String(body.district ?? "").trim();
  const meetType = String(body.meetType ?? body.category ?? "스터디").trim();
  const maxMembers = Math.min(200, Math.max(2, Number(body.maxMembers ?? 20)));
  const nextAt = String(body.nextAt ?? body.scheduledAt ?? "").trim() || null;
  const fee = Math.max(0, Number(body.fee ?? 0));
  const isPublic = body.isPublic !== false;
  const tagsRaw = body.tags;
  const tags =
    typeof tagsRaw === "string"
      ? tagsRaw.split(/[#,]/g).map((t) => t.trim()).filter(Boolean)
      : Array.isArray(tagsRaw) ? tagsRaw.map(String) : [];

  if (!title || title.length < 2) {
    return NextResponse.json({ error: "제목을 입력해 주세요." }, { status: 400 });
  }
  if (!district) {
    return NextResponse.json({ error: "시·군·구를 선택해 주세요." }, { status: 400 });
  }

  const organizerLabel = session?.user
    ? (session.user.name?.trim() || session.user.email?.split("@")[0]?.trim() || "회원")
    : String(body.hostLabel ?? body.organizerLabel ?? "").trim() || "게스트";
  const organizerEmail = session?.user?.email ?? String(body.organizerEmail ?? "게스트").trim();

  try {
    const group = await createMeeting({
      organizerEmail,
      organizerLabel,
      title,
      description: description || "모임 소개를 입력해 주세요.",
      region: `${city || "서울특별시"} ${district}`.trim(),
      category: meetType,
      scheduledAt: nextAt,
      maxMembers,
      fee,
      isPublic,
      tags,
    });
    return NextResponse.json({ group }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "생성 실패" },
      { status: 500 },
    );
  }
}
