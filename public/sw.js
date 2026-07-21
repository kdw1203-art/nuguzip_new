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

// 웹 푸시 수신 — 페이로드 { title, body, url, tag }
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    // JSON 이 아니면 텍스트를 본문으로 사용
    payload = { body: event.data ? event.data.text() : "" };
  }

  const title = payload.title || "누구집 알림";
  const options = {
    body: payload.body || "",
    icon: "/icons/icon-192.svg",
    badge: "/icons/icon-192.svg",
    data: { url: payload.url || "/" },
    tag: payload.tag,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// 알림 클릭 — 이미 열린 탭이 있으면 포커스, 없으면 새 창
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl =
    (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      for (const client of allClients) {
        try {
          const clientUrl = new URL(client.url);
          const target = new URL(targetUrl, self.location.origin);
          if (clientUrl.pathname === target.pathname && "focus" in client) {
            return client.focus();
          }
        } catch (e) {
          // URL 파싱 실패 시 다음 클라이언트 확인
        }
      }

      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return undefined;
    })(),
  );
});
