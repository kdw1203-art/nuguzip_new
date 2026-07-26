/**
 * 파일 업로드 스토리지 어댑터.
 * - Supabase Storage 설정 시: bucket 에 직접 업로드 → public URL 반환
 * - 미설정 시: base64 data URL 반환 (개발/테스트용, 크기 제한)
 * - 이미지(jpeg/png/webp)는 저장 전에 EXIF 등 메타데이터를 제거한다 (U-P5).
 */
import sharp from "sharp";
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

/* ---------- EXIF 제거 (U-P5) ----------
   임장 사진에는 촬영 GPS 좌표·기기 정보가 EXIF 로 박혀 온다. 공개 노트로
   나가면 "우리 집 위치"가 사진 파일 안에 그대로 남는 셈이라, 저장 전에
   재인코딩으로 메타데이터를 벗긴다(sharp 는 기본적으로 메타데이터를
   보존하지 않는다). .rotate() 를 먼저 둬서 EXIF Orientation 은 픽셀에
   반영한 뒤 태그를 버린다 — 안 그러면 세로 사진이 눕는다.
   실패 시 원본을 그대로 올리지 않는다(fail-closed) — GPS 유출 방지가
   목적인데 실패했다고 원본을 흘리면 의미가 없다. sharp 가 못 읽는
   파일은 애초에 정상 이미지가 아닐 가능성이 높다. */
const EXIF_STRIP_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

async function stripImageMetadata(raw: ArrayBuffer, mime: string): Promise<Buffer> {
  const img = sharp(Buffer.from(raw)).rotate();
  if (mime === "image/jpeg") return img.jpeg({ quality: 88 }).toBuffer();
  if (mime === "image/png") return img.png().toBuffer();
  return img.webp({ quality: 90 }).toBuffer();
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

  /* 이미지면 EXIF(GPS·기기정보) 제거 후 저장 — 실패 시 업로드 자체를 거부 */
  let body: Buffer;
  if (EXIF_STRIP_TYPES.has(file.type)) {
    try {
      body = await stripImageMetadata(await file.arrayBuffer(), file.type);
    } catch {
      throw new Error("이미지를 처리할 수 없습니다. 파일이 손상되지 않았는지 확인해 주세요.");
    }
  } else {
    body = Buffer.from(await file.arrayBuffer());
  }

  if (!sb) {
    // 폴백: base64 data URL (10 KB 초과 시 경고)
    if (body.length > 10_240) {
      throw new Error(
        "Supabase Storage 미설정 상태에서는 10 KB 이하 파일만 지원합니다. SUPABASE_STORAGE_BUCKET 을 설정해 주세요.",
      );
    }
    const dataUrl = `data:${file.type};base64,${body.toString("base64")}`;
    return { url: dataUrl, path, size: body.length, mime: file.type, fallback: true };
  }

  const { error } = await sb.storage
    .from(BUCKET)
    .upload(path, body, { contentType: file.type, upsert: false });

  if (error) throw new Error(`업로드 실패: ${error.message}`);

  const { data: urlData } = sb.storage.from(BUCKET).getPublicUrl(path);
  return {
    url: urlData.publicUrl,
    path,
    size: body.length,
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
