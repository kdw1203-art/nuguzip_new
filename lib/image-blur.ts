/**
 * 10×10 회색 SVG 인라인 blurDataURL — next/image placeholder="blur" 에 사용
 */
export const BLUR_DATA_URL =
  "data:image/svg+xml;base64," +
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="#e2e8f0"/></svg>`,
  ).toString("base64");

/** 임의의 이미지 src 가 유효한 원격 URL인지 확인 (상대 경로 제외) */
export function isRemoteUrl(src: string): boolean {
  return src.startsWith("http://") || src.startsWith("https://");
}
