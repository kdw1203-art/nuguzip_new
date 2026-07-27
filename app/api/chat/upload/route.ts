import { NextRequest } from "next/server";
import { ok, apiError } from "@/lib/api/response";
import { applyRateLimit, WRITE_RATE_LIMIT } from "@/lib/rate-limit";
import { requireChatActor } from "@/app/api/chat/_shared";
import { getSupabaseUrl } from "@/lib/supabase/env";
import { getServiceSupabase } from "@/lib/supabase/service";
import { recordPlatformEvent } from "@/lib/platform-events";
import { detectShellFromUserAgent } from "@/lib/platform-shell";
import { FUNNEL_EVENT, recordFunnelEvent } from "@/lib/platform-funnel-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 허용 MIME 은 **정확히 일치하는 목록**이다.
 *
 * 예전에는 ["image/", "application/pdf", "text/"] 를 접두사로 비교했다. 그래서
 * `image/svg+xml` 과 `text/html` 이 통과했고, 이 파일들은 공개 버킷에 그 Content-Type
 * 그대로 저장돼 URL 만 열면 **우리 스토리지 도메인에서 스크립트가 실행**됐다.
 * SVG 는 <script> 를 품을 수 있는 문서 포맷이지 그림 포맷이 아니다.
 */
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
  "text/plain",
]);
const MAX_SIZE = 10 * 1024 * 1024;
const BLOCKED_EXTENSIONS = new Set([
  ".exe",
  ".dll",
  ".bat",
  ".cmd",
  ".sh",
  ".ps1",
  ".js",
  ".mjs",
  ".cjs",
  ".jar",
  ".scr",
  ".vbs",
  /* 확장자로도 한 번 더 막는다 — MIME 은 클라이언트가 붙이는 값이라
     `image/png` 이라고 적고 .svg/.html 을 올릴 수 있다. */
  ".svg",
  ".html",
  ".htm",
  ".xhtml",
]);

/** 클라이언트가 보낸 MIME 을 서버 목록에 대조해 **서버가 아는 값**으로 돌려준다. */
function resolveContentType(mime: string): string | null {
  const normalized = mime.split(";")[0].trim().toLowerCase();
  return ALLOWED_MIME_TYPES.has(normalized) ? normalized : null;
}

function hasBlockedExtension(filename: string): boolean {
  const lower = filename.toLowerCase();
  return [...BLOCKED_EXTENSIONS].some((ext) => lower.endsWith(ext));
}

export async function POST(req: NextRequest) {
  const limited = await applyRateLimit(req, WRITE_RATE_LIMIT);
  if (limited) return limited;
  const { actor, error } = await requireChatActor();
  if (error || !actor) return error;
  const form = await req.formData().catch(() => null);
  if (!form) return apiError("INVALID_FORM", "multipart/form-data가 필요합니다.", 400);
  const file = form.get("file");
  if (!(file instanceof File)) {
    return apiError("FILE_REQUIRED", "file 필드가 필요합니다.", 400);
  }
  if (hasBlockedExtension(file.name)) {
    return apiError("FILE_TYPE_BLOCKED", "실행 가능 파일은 업로드할 수 없습니다.", 400);
  }
  if (file.size <= 0 || file.size > MAX_SIZE) {
    return apiError("FILE_SIZE_INVALID", "파일 크기는 0보다 크고 10MB 이하여야 합니다.", 400);
  }
  /* 저장할 Content-Type 은 요청 값을 되돌려주지 않고 서버 목록에서 고른 값을 쓴다 —
     `image/png; charset=x` 같은 변형이나 대소문자 차이로 검사와 저장이 갈라지지 않게. */
  const contentType = resolveContentType(file.type || "");
  if (!contentType) {
    return apiError("MIME_NOT_ALLOWED", "허용되지 않은 파일 형식입니다.", 400);
  }

  const fallbackUrl = `${getSupabaseUrl() ?? ""}/storage/v1/object/public/chat-uploads`;
  const key = `${actor.email}/${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`;

  const sb = getServiceSupabase();
  if (sb) {
    const bytes = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await sb.storage
      .from("chat-uploads")
      .upload(key, bytes, {
        upsert: false,
        contentType,
      });
    if (!uploadError) {
      const { data } = sb.storage.from("chat-uploads").getPublicUrl(key);
      const platform = detectShellFromUserAgent(req.headers.get("user-agent"));
      void recordPlatformEvent({
        platform,
        eventName: "chat_attachment_upload",
        userEmail: actor.email,
        source: "server_api",
        campaign: "chat",
        path: "/api/chat/upload",
        metadata: { key, size: file.size, mime: contentType },
      });
      void recordFunnelEvent(req, {
        eventName: FUNNEL_EVENT.CHAT_ATTACHMENT_UPLOAD,
        userEmail: actor.email,
        path: "/api/chat/upload",
        metadata: { key, size: file.size, mime: contentType },
      });
      return ok({
        ok: true,
        upload: {
          fileUrl: data.publicUrl,
          filePath: key,
          mime: contentType,
          sizeBytes: file.size,
        },
      });
    }
  }

  return ok({
    ok: true,
    upload: {
      fileUrl: `${fallbackUrl}/${key}`,
      filePath: key,
      mime: contentType,
      sizeBytes: file.size,
    },
    warning: "STORAGE_FALLBACK_URL",
  });
}
