import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getSession, addSessionMedia } from "@/lib/inspection/session-store";
import { uploadFile, recordUpload } from "@/lib/storage/upload";
import { isAllowedSupabaseUrl } from "@/lib/storage/assert-supabase-url";
import { dbUnavailable } from "@/lib/api/db-unavailable";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** 못 읽은 세션을 404 "세션 없음"으로 답하지 않기 위한 안내. */
const SESSION_UNAVAILABLE = "지금은 임장 기록을 불러올 수 없습니다. 잠시 후 다시 시도해 주세요.";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const { id: sessionId } = await ctx.params;
  /* 현장에서 찍은 사진·녹음을 올리는 길목이다. 세션을 못 읽었다고 404 를
     주면 업로드가 그 자리에서 버려진다 — 다시 찍을 수 없는 자료다. */
  let row: Awaited<ReturnType<typeof getSession>>;
  try {
    row = await getSession(sessionId);
  } catch (err) {
    return dbUnavailable(`임장 세션 조회 실패 (id=${sessionId})`, err, SESSION_UNAVAILABLE);
  }
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
    /* 파일 없이 URL 만 받는 길이다. 이 값은 나중에 STT 잡이 **서버에서** 그대로
       fetch 하므로, 아무 URL 이나 받으면 그 자리가 SSRF 창구가 된다. 우리 스토리지
       오리진만 허용한다(lib/storage/assert-supabase-url.ts 의 근거 참고). */
    if (!isAllowedSupabaseUrl(publicUrl)) {
      return NextResponse.json(
        { error: "허용되지 않은 URL 입니다. 파일 업로드 URL만 사용할 수 있습니다." },
        { status: 400 },
      );
    }
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
