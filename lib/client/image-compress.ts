/**
 * [B31] 업로드 전 사진 줄이기 — 브라우저에서.
 *
 * 왜: 요즘 폰 사진 한 장이 4~8MB다. 그대로 올리면
 *  · 업로드 상한(10MB)에 걸리거나 셀룰러에서 몇십 초가 걸리고
 *  · 우리 스토리지에 원본 해상도가 쌓이며
 *  · 피드 카드에서는 어차피 400px 폭으로 줄어 보인다.
 * 화면에 그려질 크기보다 훨씬 큰 원본을 굳이 왕복시킬 이유가 없다.
 *
 * 원칙: **줄이지 못하면 원본을 그대로 돌려준다.** 캔버스가 막힌 환경(일부
 * 프라이빗 모드), HEIC 처럼 브라우저가 못 디코딩하는 형식, 이미 충분히 작은
 * 파일 — 어느 경우든 "압축 실패"로 업로드를 막지 않는다. 사진을 못 올리는 것이
 * 조금 큰 사진을 올리는 것보다 나쁘다.
 */

export type CompressOptions = {
  /** 긴 변의 최대 픽셀 (기본 1600 — 상세 화면 2배 해상도에 충분) */
  maxEdge?: number;
  /** JPEG 품질 0~1 */
  quality?: number;
};

/** 이보다 작은 파일은 손대지 않는다 — 다시 인코딩하면 오히려 커질 수 있다. */
const SKIP_UNDER_BYTES = 300 * 1024;

export async function compressImage(
  file: File,
  { maxEdge = 1600, quality = 0.82 }: CompressOptions = {},
): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  if (file.type === "image/gif") return file; // 애니메이션이 정지 이미지로 죽는다
  if (file.size <= SKIP_UNDER_BYTES) return file;

  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file; // 디코딩 불가(HEIC 등) — 원본을 그대로 보낸다
  }

  try {
    const { width, height } = bitmap;
    const scale = Math.min(1, maxEdge / Math.max(width, height));
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", quality);
    });
    if (!blob) return file;
    /* 줄었을 때만 바꾼다 — 작은 PNG 를 JPEG 로 다시 굽다 커지는 경우가 있다 */
    if (blob.size >= file.size) return file;

    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg", lastModified: file.lastModified });
  } catch {
    return file;
  } finally {
    bitmap.close?.();
  }
}
