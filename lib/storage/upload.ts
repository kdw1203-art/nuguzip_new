/**
 * 파일 업로드 스토리지 어댑터.
 * - Supabase Storage 설정 시: bucket 에 직접 업로드 → 재생 가능한 URL 반환
 *   (공개 버킷이면 public URL, 비공개 버킷이면 서명 URL)
 * - 미설정 시: base64 data URL 반환 (개발/테스트용, 크기 제한)
 * - 이미지(jpeg/png/webp)는 저장 전에 EXIF 등 메타데이터를 제거한다 (U-P5).
 *
 * 저장소는 별도 CDN 을 두지 않는다. Supabase Storage 는 모든 플랜에서
 * Cloudflare CDN 뒤에 있고, 이 프로젝트는 Pro 라 Smart CDN(수정·삭제 시
 * 엣지 자동 무효화)까지 켜져 있다. 앞단에 CDN 을 하나 더 얹으면 무효화
 * 경로만 둘로 늘어난다.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
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

async function stripImageMetadata(raw: ArrayBuffer | Buffer, mime: string): Promise<Buffer> {
  const img = sharp(Buffer.isBuffer(raw) ? raw : Buffer.from(raw)).rotate();
  if (mime === "image/jpeg") return img.jpeg({ quality: 88 }).toBuffer();
  if (mime === "image/png") return img.png().toBuffer();
  return img.webp({ quality: 90 }).toBuffer();
}

/* ---------- 재생 가능한 URL 만들기 ----------
   2026-07-28: 여기는 버킷 공개 여부를 확인하지 않고 무조건 getPublicUrl() 을
   불렀다. getPublicUrl 은 권한을 확인하지 않고 문자열만 조립한다 — 그래서
   이 프로젝트의 버킷 6개가 전부 public:false 인 지금, 업로드는 "성공"하고
   반환된 URL 은 열리지 않는 상태였다. 올라간 사진이 깨진 이미지로 보이는
   것은 사용자 입장에서 "업로드가 안 된 것"과 구분되지 않는다. 실패를
   성공처럼 돌려주지 않는다는 원칙에 정면으로 어긋난다.

   지금은 버킷 공개 여부를 실제로 조회해서 갈라 준다.
     - 공개 버킷: public URL (CDN 캐시 적중률이 가장 좋다)
     - 비공개 버킷 / 조회 실패: 서명 URL
   확인이 안 되면 비공개로 간주한다 — 서명 URL 은 공개 버킷에서도 열리므로
   이 방향의 오판만 안전하다.

   버킷을 공개로 바꿀지(= 임장 사진을 링크만 알면 누구나 열 수 있게 할지)는
   개인정보 판단이라 코드가 정할 문제가 아니다. 그래서 여기서는 버킷 설정을
   건드리지 않고, 지금 설정 그대로 열리는 URL 을 만든다. */

/** 서명 URL 유효기간. 노트에 저장된 URL 이 조용히 만료되지 않도록 길게 잡는다. */
export const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 365; // 1년

/** undefined = 아직 안 봄, null = 조회 실패(=비공개로 간주) */
let bucketPublicCache: boolean | null | undefined;

async function isBucketPublic(sb: SupabaseClient): Promise<boolean> {
  if (bucketPublicCache !== undefined) return bucketPublicCache === true;
  try {
    const { data, error } = await sb.storage.getBucket(BUCKET);
    bucketPublicCache = error || !data ? null : data.public === true;
  } catch {
    bucketPublicCache = null;
  }
  return bucketPublicCache === true;
}

/**
 * 저장 경로 하나를 지금 설정에서 실제로 열리는 URL 로 바꾼다.
 * 만들지 못하면 던진다 — 열리지 않는 URL 을 조용히 돌려주지 않는다.
 */
export async function resolveStorageUrl(
  path: string,
  expiresIn = SIGNED_URL_TTL_SECONDS,
): Promise<string> {
  const sb = getServiceSupabase();
  if (!sb) throw new Error("스토리지가 설정되지 않아 파일 주소를 만들 수 없습니다.");

  if (await isBucketPublic(sb)) {
    const { data } = sb.storage.from(BUCKET).getPublicUrl(path);
    if (data?.publicUrl) return data.publicUrl;
    throw new Error("파일 주소를 만들지 못했습니다.");
  }

  const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(path, expiresIn);
  if (error || !data?.signedUrl) {
    throw new Error(`파일 주소를 만들지 못했습니다: ${error?.message ?? "원인 불명"}`);
  }
  return data.signedUrl;
}

function sanitizeFileName(original: string): string {
  const ext = original.split(".").pop()?.toLowerCase() ?? "bin";
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  return `${ts}-${rand}.${ext}`;
}

/** declared MIME vs magic bytes — 위조 Content-Type 완화 */
export function sniffMimeFromBytes(buf: Buffer): string | null {
  if (buf.length < 4) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  ) {
    return "image/png";
  }
  if (
    buf.length >= 12 &&
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  if (
    buf[0] === 0x47 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x38
  ) {
    return "image/gif";
  }
  if (buf.toString("ascii", 0, 4) === "%PDF") return "application/pdf";
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) {
    return "audio/webm";
  }
  if (buf.length >= 3 && buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) {
    return "audio/mpeg";
  }
  return null;
}

export async function uploadFile(
  file: File,
  uploaderEmail: string,
  folder = "general",
): Promise<UploadResult> {
  if (file.size <= 0) {
    throw new Error("빈 파일은 업로드할 수 없습니다.");
  }
  if (file.size > UPLOAD_MAX_BYTES) {
    throw new Error(`파일 크기는 ${UPLOAD_MAX_BYTES / 1024 / 1024}MB 이하여야 합니다.`);
  }
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    throw new Error(`허용되지 않는 파일 형식입니다: ${file.type}`);
  }

  const raw = Buffer.from(await file.arrayBuffer());
  const sniffed = sniffMimeFromBytes(raw);
  /* 이미지는 magic 필수. PDF도 필수. 오디오는 포맷이 다양해 declared MIME만 허용. */
  if (
    file.type.startsWith("image/") ||
    file.type === "application/pdf"
  ) {
    if (!sniffed || sniffed !== file.type) {
      throw new Error(
        "파일 내용과 형식이 일치하지 않습니다. 다른 파일로 다시 시도해 주세요.",
      );
    }
  }

  const sb = getServiceSupabase();
  const safeName = sanitizeFileName(file.name);
  const path = `${folder}/${uploaderEmail.replace(/[@.]/g, "_")}/${safeName}`;

  /* 이미지면 EXIF(GPS·기기정보) 제거 후 저장 — 실패 시 업로드 자체를 거부 */
  let body: Buffer;
  if (EXIF_STRIP_TYPES.has(file.type)) {
    try {
      body = await stripImageMetadata(raw, file.type);
    } catch {
      throw new Error("이미지를 처리할 수 없습니다. 파일이 손상되지 않았는지 확인해 주세요.");
    }
  } else {
    body = raw;
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

  /* 주소를 못 만들면 올라간 객체를 지우고 실패로 답한다. 파일만 남고
     주소는 없는 상태를 "업로드 성공"이라고 부를 수는 없다. */
  let url: string;
  try {
    url = await resolveStorageUrl(path);
  } catch (err) {
    await sb.storage
      .from(BUCKET)
      .remove([path])
      .catch(() => undefined);
    throw err instanceof Error ? err : new Error("업로드한 파일의 주소를 만들지 못했습니다.");
  }

  return {
    url,
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
