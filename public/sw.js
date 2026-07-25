/**
 * 누구집 서비스워커 — PWA 설치 요건용 최소 구현.
 * (구 woodong-sw-v11-purge는 캐시 삭제 후 자가 unregister 하는 정리용이라
 *  SwRegister 와 함께 쓰면 재등록 루프가 생기므로, 최소 안전 SW로 교체)
 */
const VERSION = "nuguzip-sw-v2";
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      /* 캐시에 넣는 건 오프라인 폴백 문서 하나뿐이다. 실패해도 설치는 계속한다 —
         폴백을 못 받았다고 서비스워커 자체가 안 깔리면 푸시 알림까지 같이 죽는다. */
      try {
        const cache = await caches.open(VERSION);
        await cache.add(new Request(OFFLINE_URL, { cache: "reload" }));
      } catch (e) {
        // 오프라인 폴백 없이 동작 (fetch 핸들러가 알아서 통과시킨다)
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // 구(우리동네이야기) SW·이전 버전이 남긴 캐시 정리
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

/**
 * 네트워크 우선. 캐시에서 **응답을 만들어 주는 경우는 단 하나** — 네트워크가
 * 완전히 실패한 페이지 이동이다. 그때만 /offline 문서를 돌려준다.
 *
 * 시세·실거래·매물 응답은 절대 캐시하지 않는다. 부동산에서 오래된 숫자를 지금
 * 값처럼 보여주는 건 안 보여주는 것보다 나쁘다. 그래서 GET 이 아니거나,
 * 페이지 이동이 아니거나, 서버가 에러라도 응답을 준 경우엔 그대로 통과시킨다.
 */
self.addEventListener("fetch", (event) => {
  const req = event.request;

  if (req.method !== "GET") return;
  // 페이지 이동만 처리 (이미지·API·정적 자산은 브라우저 기본 동작 그대로)
  if (req.mode !== "navigate") return;

  event.respondWith(
    (async () => {
      try {
        /* 서버가 4xx/5xx 를 주더라도 그건 "연결은 됐다"는 뜻이므로 그대로 전달한다.
           오프라인 화면으로 바꿔치기하면 진짜 원인을 감추게 된다. */
        return await fetch(req);
      } catch (e) {
        const cached = await caches.match(OFFLINE_URL);
        if (cached) return cached;
        /* 폴백조차 없으면 브라우저 기본 오프라인 화면으로 — 우리가 지어낸
           그럴듯한 화면을 보여주는 것보다 낫다. */
        throw e;
      }
    })(),
  );
});

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
    /* 알림 아이콘도 PNG. 안드로이드 알림 트레이는 SVG 를 렌더하지 않아서
       지금까지 기본 종 아이콘으로 대체되고 있었다. */
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
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
