/**
 * 누구집 서비스워커 — PWA 설치 요건용 최소 구현.
 * (구 woodong-sw-v11-purge는 캐시 삭제 후 자가 unregister 하는 정리용이라
 *  SwRegister 와 함께 쓰면 재등록 루프가 생기므로, 최소 안전 SW로 교체)
 */
const VERSION = "nuguzip-sw-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // 구(우리동네이야기) SW가 남긴 캐시 정리
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

// 네트워크 우선 — 오프라인 캐싱은 도입하지 않음(항상 최신 데이터)
self.addEventListener("fetch", () => {});
