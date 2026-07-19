/**
 * 파일 업로드 스토리지 어댑터.
 * - Supabase Storage 설정 시: bucket 에 직접 업로드 → public URL 반환
 * - 미설정 시: base64 data URL 반환 (개발/테스트용, 크기 제한)
 */
import { getServiceSupabase } from "@/lib/supabase/service";

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET ?? "woodong-uploads";

export const UPLOAD_MAX_BYTES = 10 * 1024 * 1024; // 10 MB
export const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
  "audio/webm",
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
];

export interface UploadResult {
  url: string;
  path: string;
  size: number;
  mime: string;
  fallback: boolean;
}

function sanitizeFileName(original: string): string {
  const ext = original.split(".").pop()?.toLowerCase() ?? "bin";
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  return `${ts}-${rand}.${ext}`;
}

export async function uploadFile(
  file: File,
  uploaderEmail: string,
  folder = "general",
): Promise<UploadResult> {
  if (file.size > UPLOAD_MAX_BYTES) {
    throw new Error(`파일 크기는 ${UPLOAD_MAX_BYTES / 1024 / 1024}MB 이하여야 합니다.`);
  }
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    throw new Error(`허용되지 않는 파일 형식입니다: ${file.type}`);
  }

  const sb = getServiceSupabase();
  const safeName = sanitizeFileName(file.name);
  const path = `${folder}/${uploaderEmail.replace(/[@.]/g, "_")}/${safeName}`;

  if (!sb) {
    // 폴백: base64 data URL (10 KB 초과 시 경고)
    if (file.size > 10_240) {
      throw new Error(
        "Supabase Storage 미설정 상태에서는 10 KB 이하 파일만 지원합니다. SUPABASE_STORAGE_BUCKET 을 설정해 주세요.",
      );
    }
    const buffer = await file.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    const dataUrl = `data:${file.type};base64,${base64}`;
    return { url: dataUrl, path, size: file.size, mime: file.type, fallback: true };
  }

  const buffer = await file.arrayBuffer();
  const { error } = await sb.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: file.type, upsert: false });

  if (error) throw new Error(`업로드 실패: ${error.message}`);

  const { data: urlData } = sb.storage.from(BUCKET).getPublicUrl(path);
  return {
    url: urlData.publicUrl,
    path,
    size: file.size,
    mime: file.type,
    fallback: false,
  };
}

export async function deleteFile(path: string): Promise<void> {
  const sb = getServiceSupabase();
  if (!sb) return;
  await sb.storage.from(BUCKET).remove([path]);
}

export async function recordUpload(
  result: UploadResult & { uploaderEmail: string },
): Promise<void> {
  const sb = getServiceSupabase();
  if (!sb || result.fallback) return;
  try {
    await sb.from("uploads").insert({
      uploader_email: result.uploaderEmail,
      bucket: BUCKET,
      path: result.path,
      size_bytes: result.size,
      mime: result.mime,
      url: result.url,
    });
  } catch {
    // non-critical
  }
}
