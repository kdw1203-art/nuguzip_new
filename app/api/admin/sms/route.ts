import { NextResponse } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { recordAudit } from "@/lib/admin/audit";
import { getSensConfigSummary, sendSensSms, type SensMessageType } from "@/lib/ncp/sens-sms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await safeAuth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json({
    ...getSensConfigSummary(),
    docsUrl: "https://api.ncloud-docs.com/docs/sens-sms-send",
  });
}

type PostBody = {
  type?: SensMessageType;
  contentType?: "COMM" | "AD";
  from?: string;
  subject?: string;
  content?: string;
  recipients?: string[];
  reserveTime?: string;
};

export async function POST(req: Request) {
  const session = await safeAuth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const content = String(body.content ?? "").trim();
  const recipients = (body.recipients ?? [])
    .map((r) => String(r).trim())
    .filter(Boolean);

  const result = await sendSensSms({
    type: body.type ?? "SMS",
    contentType: body.contentType ?? "COMM",
    from: body.from,
    subject: body.subject,
    content,
    messages: recipients.map((to) => ({ to })),
    reserveTime: body.reserveTime,
    reserveTimeZone: body.reserveTime ? "Asia/Seoul" : undefined,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, details: result.body },
      { status: result.status },
    );
  }

  await recordAudit({
    action: "sms.send",
    targetType: "sens",
    note: `${recipients.length}건 발송`,
    metadata: {
      requestId: result.requestId,
      type: body.type ?? "SMS",
      recipientCount: recipients.length,
    },
  });

  return NextResponse.json({
    ok: true,
    requestId: result.requestId,
    requestTime: result.requestTime,
    statusCode: result.statusCode,
    statusName: result.statusName,
  });
}
