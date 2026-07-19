import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { uploadFile, recordUpload, UPLOAD_MAX_BYTES, ALLOWED_MIME_TYPES } from "@/lib/storage/upload";
import { applyRateLimit, WRITE_RATE_LIMIT } from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * POST /api/upload
 * Body: multipart/form-data  field "file"  (optional: field "folder")
 * Returns: { url, path, size, mime }
 */
export async function POST(req: NextRequest) {
  // 속도 제한: 1분에 10회
  const limited = await applyRateLimit(req, { max: 10, windowMs: 60_000 });
  if (limited) return limited;

  const session = await safeAuth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "multipart/form-data 요청이 필요합니다." }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "'file' 필드가 없습니다." }, { status: 400 });
  }

  if (file.size > UPLOAD_MAX_BYTES) {
    return NextResponse.json(
      { error: `파일 크기는 ${UPLOAD_MAX_BYTES / 1024 / 1024}MB 이하여야 합니다.` },
      { status: 413 },
    );
  }
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: `허용되지 않는 파일 형식입니다. (${ALLOWED_MIME_TYPES.join(", ")})` },
      { status: 415 },
    );
  }

  const folder = String(formData.get("folder") ?? "general").replace(/[^a-z0-9_-]/gi, "_").slice(0, 50);

  try {
    const result = await uploadFile(file, session.user.email, folder);
    await recordUpload({ ...result, uploaderEmail: session.user.email });
    return NextResponse.json({
      url: result.url,
      path: result.path,
      size: result.size,
      mime: result.mime,
      fallback: result.fallback,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "업로드 실패";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** GET /api/upload — 허용 타입/크기 정보 */
export async function GET(_req: NextRequest) {
  void WRITE_RATE_LIMIT;
  return NextResponse.json({
    maxSizeBytes: UPLOAD_MAX_BYTES,
    maxSizeMb: UPLOAD_MAX_BYTES / 1024 / 1024,
    allowedMimeTypes: ALLOWED_MIME_TYPES,
  });
}
