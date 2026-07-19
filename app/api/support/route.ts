import { NextRequest, NextResponse } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { appendInboxNotification } from "@/lib/notifications/inbox";

const CATEGORIES = ["일반 문의", "결제·환불", "버그 신고", "개인정보", "악성 콘텐츠 신고", "기타"] as const;
type Category = (typeof CATEGORIES)[number];

export async function POST(req: NextRequest) {
  const session = await safeAuth();

  const body = (await req.json().catch(() => null)) as {
    category?: unknown;
    subject?: unknown;
    message?: unknown;
    email?: unknown;
  } | null;

  if (!body) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });

  const category = String(body.category ?? "").trim() as Category;
  const subject = String(body.subject ?? "").trim();
  const message = String(body.message ?? "").trim();
  const fromEmail = session?.user?.email ?? String(body.email ?? "").trim();

  if (!CATEGORIES.includes(category)) {
    return NextResponse.json({ error: "유효하지 않은 카테고리입니다." }, { status: 400 });
  }
  if (subject.length < 2 || subject.length > 200) {
    return NextResponse.json({ error: "제목은 2~200자 사이여야 합니다." }, { status: 400 });
  }
  if (message.length < 10 || message.length > 3000) {
    return NextResponse.json({ error: "내용은 10~3000자 사이여야 합니다." }, { status: 400 });
  }
  if (!fromEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fromEmail)) {
    return NextResponse.json({ error: "유효한 이메일을 입력해 주세요." }, { status: 400 });
  }

  // 관리자 계정에 인박스 알림으로 전달 (Supabase 미연결 시에도 메모리 저장)
  const adminEmail = process.env.ADMIN_EMAIL ?? "admin@nuguzip.com";
  await appendInboxNotification({
    userEmail: adminEmail,
    title: `[문의:${category}] ${subject}`,
    body: `보낸이: ${fromEmail}\n\n${message}`,
    actionUrl: `/admin/support`,
  }).catch(() => {/* ignore send failure */});

  // 사용자에게 접수 확인 알림
  if (session?.user?.email) {
    await appendInboxNotification({
      userEmail: session.user.email,
      title: "문의가 접수되었습니다",
      body: `[${category}] ${subject} — 영업일 기준 24~72시간 이내 답변 드립니다.`,
      actionUrl: `/notifications`,
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
