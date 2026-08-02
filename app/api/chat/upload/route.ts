import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { ok, apiError } from "@/lib/api/response";
import { applyRateLimit, WRITE_RATE_LIMIT } from "@/lib/rate-limit";
import { requireChatActor } from "@/app/api/chat/_shared";
import { getServiceSupabase } from "@/lib/supabase/service";
import { recordPlatformEvent } from "@/lib/platform-events";
import { detectShellFromUserAgent } from "@/lib/platform-shell";
import { FUNNEL_EVENT, recordFunnelEvent } from "@/lib/platform-funnel-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* 서명 URL 유효기간. 채팅 첨부는 대화 스크롤을 되짚으며 나중에 다시 열리므로 짧게 두면
   과거 첨부가 죽는다. 그렇다고 공개 URL 로 돌아가면 추측 가능한 키가 되므로,
   "무작위 토큰이 붙은 장기 URL"로 절충한다. 재발급 API 가 생기면 짧게 줄이는 게 맞다. */
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 365;

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

  /* 키에 난수를 섞는다. 예전 키는 `이메일/타임스탬프-원본파일명` 이라 상대방 이메일과
     대략의 시각만 알면 맞혀 볼 수 있었다. 부동산 채팅 첨부는 계약서·신분증이 오간다. */
  const safeName = file.name.replace(/[^\w.-]/g, "_").slice(-80);
  const key = `${actor.email}/${Date.now()}-${randomUUID().slice(0, 12)}-${safeName}`;

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
      /* chat-uploads 는 **비공개** 버킷이다. 공개 버킷 + 추측 가능한 키 조합이면
         채팅방 밖의 누구나 첨부를 열 수 있다. 서명 URL(만료 있는 무작위 토큰)로 준다. */
      const { data } = await sb.storage
        .from("chat-uploads")
        .createSignedUrl(key, SIGNED_URL_TTL_SECONDS);
      if (!data?.signedUrl) {
        return apiError("UPLOAD_FAILED", "첨부 URL 발급에 실패했습니다.", 500);
      }
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
          fileUrl: data.signedUrl,
          filePath: key,
          mime: contentType,
          sizeBytes: file.size,
        },
      });
    }
  }

  /* 예전에는 여기서 `/object/public/chat-uploads/...` 를 조립해 `ok: true` 로 돌려줬다.
     그런데 이 프로젝트의 버킷은 전부 비공개라 그 주소는 **열리지 않는다** — 즉 업로드가
     실패했는데 화면에는 성공으로 뜨고, 사용자는 깨진 첨부를 보게 된다.
     lib/storage/upload.ts 가 같은 이유로 취한 자세를 여기서도 지킨다: 열리지 않는 URL 을
     성공이라고 부르지 않는다. */
  return apiError(
    "STORAGE_UNAVAILABLE",
    "첨부 저장소에 연결할 수 없어 업로드하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    503,
  );
}
