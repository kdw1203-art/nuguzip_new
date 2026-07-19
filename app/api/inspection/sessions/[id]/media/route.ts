import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getSession, addSessionMedia } from "@/lib/inspection/session-store";
import { uploadFile, recordUpload } from "@/lib/storage/upload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const { id: sessionId } = await ctx.params;
  const row = await getSession(sessionId);
  if (!row) return NextResponse.json({ error: "세션 없음" }, { status: 404 });
  if (row.authorEmail !== session.user.email) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "multipart/form-data 필요" }, { status: 400 });
  }

  const file = form.get("file");
  const mediaType = String(form.get("mediaType") ?? "photo") === "audio" ? "audio" : "photo";
  const hint = String(form.get("hint") ?? "");

  if (file instanceof File) {
    const uploaded = await uploadFile(file, session.user.email, `inspection-sessions/${sessionId}`);
    await recordUpload({ ...uploaded, uploaderEmail: session.user.email });
    const media = await addSessionMedia({
      sessionId,
      mediaType,
      storagePath: uploaded.path,
      publicUrl: uploaded.url,
      mime: uploaded.mime,
      sizeBytes: uploaded.size,
      exif: hint ? { hint } : {},
    });
    return NextResponse.json({ media });
  }

  const publicUrl = String(form.get("publicUrl") ?? "").trim();
  if (publicUrl) {
    const media = await addSessionMedia({
      sessionId,
      mediaType,
      publicUrl,
      exif: hint ? { hint } : {},
    });
    return NextResponse.json({ media });
  }

  return NextResponse.json({ error: "file 또는 publicUrl 필요" }, { status: 400 });
}
