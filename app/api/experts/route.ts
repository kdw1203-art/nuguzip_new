import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { appendInboxNotification } from "@/lib/notifications/inbox";
import { getAppUserIdByEmail } from "@/lib/me/profile";
import {
  createExpert,
  getExpertByOwnerEmail,
  listExperts,
} from "@/lib/experts/store-db";
import { sanitizeExpertForPublic } from "@/lib/experts/access";

export async function GET() {
  const items = (await listExperts()).map(sanitizeExpertForPublic);
  return NextResponse.json({ items });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  if (!body.name || !body.title || !body.category) {
    return NextResponse.json(
      { error: "성명·타이틀·카테고리는 필수입니다." },
      { status: 400 },
    );
  }
  const ownerEmail = session.user.email.trim().toLowerCase();
  const existing = await getExpertByOwnerEmail(ownerEmail);
  if (existing) {
    return NextResponse.json(
      {
        error:
          "이미 등록된 전문가 프로필이 있습니다. 수정 페이지에서 변경할 수 있습니다.",
        code: "duplicate",
        expertId: existing.id,
      },
      { status: 409 },
    );
  }
  try {
    const appUserId = await getAppUserIdByEmail(session.user.email);
    const expert = await createExpert({
      name: String(body.name),
      title: String(body.title),
      category: String(body.category),
      regions: Array.isArray(body.regions) ? body.regions.map(String) : [],
      specialties: Array.isArray(body.specialties) ? body.specialties.map(String) : [],
      introduction: body.introduction ? String(body.introduction) : undefined,
      consultationFee: Number(body.consultationFee ?? 0),
      reportFee: Number(body.reportFee ?? 0),
      experience: body.experience ? String(body.experience) : undefined,
      userId: appUserId,
      ownerEmail,
    });
    void appendInboxNotification({
      userEmail: ownerEmail,
      title: "전문가 프로필이 접수되었습니다",
      body: "검수 후 전문가 목록에 공개됩니다. 프로필은 언제든 수정할 수 있습니다.",
      actionUrl: `/town/experts`,
    });
    return NextResponse.json({ expert: sanitizeExpertForPublic(expert) });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "생성 실패" },
      { status: 500 },
    );
  }
}
