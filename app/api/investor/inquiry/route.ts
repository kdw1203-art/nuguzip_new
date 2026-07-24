import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createB2bInquiry } from "@/lib/admin/business-dashboards";
import { resolveProjectAdminEmail } from "@/lib/auth/admin-emails";
import { appendInboxNotification } from "@/lib/notifications/inbox";

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function resolveAdminReceiver(): string | null {
  return resolveProjectAdminEmail();
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const name = String(body.name ?? "").trim();
  const company = String(body.company ?? "").trim();
  const email = String(body.email ?? "")
    .trim()
    .toLowerCase();
  const interest = String(body.interest ?? "").trim();

  if (!name || !email) {
    return NextResponse.json({ error: "name/email required" }, { status: 400 });
  }
  if (name.length > 60) {
    return NextResponse.json({ error: "name too long" }, { status: 400 });
  }
  if (company.length > 120) {
    return NextResponse.json({ error: "company too long" }, { status: 400 });
  }
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "invalid email" }, { status: 400 });
  }
  if (interest.length > 3000) {
    return NextResponse.json({ error: "interest too long" }, { status: 400 });
  }

  const title = `[IR문의] ${company ? `${company} / ` : ""}${name}`;
  const bodyMd = [
    `- 이름: ${name}`,
    `- 회사/펀드: ${company || "-"}`,
    `- 이메일: ${email}`,
    `- 관심 영역:`,
    interest ? interest : "(미입력)",
  ].join("\n");

  const saved = await createB2bInquiry({
    title,
    bodyMd,
    status: "open",
  });
  if (!saved) {
    return NextResponse.json({ error: "inquiry storage unavailable" }, { status: 503 });
  }

  const adminEmail = resolveAdminReceiver();
  if (adminEmail) {
    await appendInboxNotification({
      userEmail: adminEmail,
      title: "새 투자/IR 문의가 접수되었습니다",
      body: `${title}\n\n${bodyMd}`,
      actionUrl: "/admin",
    }).catch(() => {});
  }

  return NextResponse.json({
    ok: true,
    message: "투자 문의가 접수되었습니다.",
    payload: { name, company, email, interest },
  });
}
