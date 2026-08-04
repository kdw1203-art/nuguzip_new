"use client";

/**
 * 업로드 전 클라이언트 리사이즈 (최적화 50선 #23).
 *
 * 왜 필요한가 — 현장에서 찍은 폰 사진은 4000×3000·3~8MB 가 기본이다.
 * 화면에서 실제로 쓰이는 최대 폭은 카드/상세 모두 1000px 미만인데,
 * 임장 현장(지하주차장·엘리베이터 앞)의 느린 상행 회선으로 원본을 그대로
 * 올리다 실패하면 사용자는 "사진이 안 올라간다"만 겪는다.
 * 서버 상한(UPLOAD_MAX_BYTES = 10MB)에 걸려 413 이 나던 경로도 같은 원인이다.
 *
 * 원칙(사실 우선):
 * - 실패하면 원본을 그대로 돌려준다. 리사이즈는 최적화지 관문이 아니다.
 *   여기서 예외를 던져 업로드를 막으면 "사진을 잃는" 쪽이 된다.
 * - 결과가 원본보다 크면 원본을 쓴다(작은 이미지 재인코딩 방지).
 * - GIF(애니메이션)·비이미지는 손대지 않는다. 캔버스로 그리면 첫 프레임만 남는다.
 * - 투명도가 있으면 PNG 로 유지한다. JPEG 로 바꾸면 투명 영역이 검게 탄다.
 * - EXIF 회전은 imageOrientation:"from-image" 로 반영해 굽는다(서버는 sharp 로
 *   메타데이터를 제거하므로, 여기서 방향을 굽지 않으면 눕는 사진이 생긴다).
 */

/** 긴 변 상한 — 상세 원본 보기까지 감안한 여유값 */
export const MAX_DIMENSION = 1600;

/** 이 크기 이하 + 상한 이내면 재인코딩하지 않는다(화질 보존) */
const SKIP_BYTES = 1_200_000;

const JPEG_QUALITY = 0.82;

/** 캔버스로 다시 구워도 되는 형식 */
const RESIZABLE = new Set(["image/jpeg", "image/png", "image/webp"]);

type Decoded = { width: number; height: number; draw: CanvasImageSource; close: () => void };

async function decode(file: File): Promise<Decoded | null> {
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { width: bmp.width, height: bmp.height, draw: bmp, close: () => bmp.close() };
    } catch {
      /* HEIC 등 디코딩 불가 — 아래 <img> 경로로 한 번 더 시도 */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("decode failed"));
      el.src = url;
    });
    return {
      width: img.naturalWidth,
      height: img.naturalHeight,
      draw: img,
      close: () => URL.revokeObjectURL(url),
    };
  } catch {
    URL.revokeObjectURL(url);
    return null;
  }
}

/** 다운스케일된 캔버스에 알파가 남아 있는지 — 있으면 JPEG 로 바꾸면 안 된다 */
function hasAlpha(ctx: CanvasRenderingContext2D, w: number, h: number): boolean {
  try {
    const { data } = ctx.getImageData(0, 0, w, h);
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] < 255) return true;
    }
    return false;
  } catch {
    return true; // 확인 못 하면 안전한 쪽(PNG 유지)
  }
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((b) => resolve(b), type, quality);
    } catch {
      resolve(null);
    }
  });
}

function renamed(name: string, mime: string): string {
  const ext = mime === "image/png" ? ".png" : mime === "image/webp" ? ".webp" : ".jpg";
  const base = name.replace(/\.[^./\\]+$/, "") || "photo";
  return `${base}${ext}`;
}

/**
 * 이미지 한 장을 긴 변 {@link MAX_DIMENSION}px 이하로 줄인다.
 * 줄일 수 없거나 이득이 없으면 **원본 File 을 그대로** 반환한다.
 */
export async function resizeImageFile(file: File): Promise<File> {
  if (typeof document === "undefined") return file;
  if (!RESIZABLE.has(file.type)) return file;

  const decoded = await decode(file);
  if (!decoded) return file;

  try {
    const { width, height } = decoded;
    if (!width || !height) return file;

    const longest = Math.max(width, height);
    if (longest <= MAX_DIMENSION && file.size <= SKIP_BYTES) return file;

    const scale = Math.min(1, MAX_DIMENSION / longest);
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { alpha: file.type === "image/png" });
    if (!ctx) return file;
    ctx.drawImage(decoded.draw, 0, 0, w, h);

    const keepAlpha = file.type === "image/png" && hasAlpha(ctx, w, h);
    const outType = keepAlpha ? "image/png" : "image/jpeg";
    const blob = await toBlob(canvas, outType, keepAlpha ? undefined : JPEG_QUALITY);

    // 이득이 없으면(또는 인코딩 실패) 원본 유지
    if (!blob || blob.size >= file.size) return file;

    return new File([blob], renamed(file.name, outType), {
      type: outType,
      lastModified: file.lastModified,
    });
  } catch {
    return file;
  } finally {
    decoded.close();
  }
}

/** 여러 장 — 한 장이 실패해도 나머지는 계속 진행(각각 원본으로 대체) */
export async function resizeImageFiles(files: File[]): Promise<File[]> {
  const out: File[] = [];
  for (const f of files) {
    out.push(await resizeImageFile(f).catch(() => f));
  }
  return out;
}
