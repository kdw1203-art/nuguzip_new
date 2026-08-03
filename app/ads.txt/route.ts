import { getAdsTxtPublisherId } from "@/lib/ads/adsense-policy";

/**
 * /ads.txt — 광고 판매 권한 선언 (IAB ads.txt 표준).
 *
 * 애드센스는 이 파일이 없으면 "수익 손실 위험" 경고를 띄우고 일부 입찰이
 * 제한된다. 형식은 애드센스 고정 문자열이다:
 *   google.com, pub-XXXX, DIRECT, f08c47fec0942fa0
 * (f08c47fec0942fa0 은 구글의 인증 기관 ID — 모든 애드센스 게시자 공통 상수)
 *
 * 게시자 ID 는 adsense-policy 단일 출처에서 온다. 어떤 이유로든 ID 를 못
 * 만들면 빈 파일 대신 404 — 잘못된 선언 파일을 서빙하지 않는다.
 */
export const revalidate = 86400;

export function GET(): Response {
  const pub = getAdsTxtPublisherId();
  if (!pub) return new Response("not configured", { status: 404 });
  return new Response(`google.com, ${pub}, DIRECT, f08c47fec0942fa0\n`, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
