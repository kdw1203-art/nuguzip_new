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

const ALLOWED_MIME_PREFIX = ["image/", "application/pdf", "text/"];
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
]);

function mimeAllowed(mime: string): boolean {
  return ALLOWED_MIME_PREFIX.some((prefix) => mime.startsWith(prefix));
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
  if (!mimeAllowed(file.type || "")) {
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
        contentType: file.type || "application/octet-stream",
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
        metadata: { key, size: file.size, mime: file.type || "application/octet-stream" },
      });
      void recordFunnelEvent(req, {
        eventName: FUNNEL_EVENT.CHAT_ATTACHMENT_UPLOAD,
        userEmail: actor.email,
        path: "/api/chat/upload",
        metadata: { key, size: file.size, mime: file.type || "application/octet-stream" },
      });
      return ok({
        ok: true,
        upload: {
          fileUrl: data.publicUrl,
          filePath: key,
          mime: file.type || "application/octet-stream",
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
      mime: file.type || "application/octet-stream",
      sizeBytes: file.size,
    },
    warning: "STORAGE_FALLBACK_URL",
  });
}
