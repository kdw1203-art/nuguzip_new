"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/app/components/Icon";

/* PWA 웹 푸시 구독 (#19)
   흐름: GET /api/push/subscribe(공개키) → 권한 요청 → serviceWorker.ready →
         pushManager.subscribe(VAPID) → POST /api/push/subscribe(구독 저장).
   서버가 비활성(enabled:false / publicKey 없음)을 보고하면 아무것도 렌더하지 않는다.
   과도한 자동 프롬프트는 하지 않고, 사용자가 "알림 켜기"를 눌렀을 때만 권한을 요청한다. */

/** VAPID base64url 공개키 → Uint8Array (applicationServerKey 용) */
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

type Status = "idle" | "loading" | "subscribed" | "denied" | "error";

export function PushSubscribe() {
  // ready: 서버가 활성 상태이고 브라우저가 지원할 때만 true → 그 외에는 렌더 안 함
  const [ready, setReady] = useState(false);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (typeof window === "undefined") return;
      // 브라우저 지원 확인 (미지원이면 렌더 안 함)
      if (
        !("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        !("Notification" in window)
      ) {
        return;
      }

      try {
        const res = await fetch("/api/push/subscribe");
        if (!res.ok) return; // 조회 실패 → 렌더 안 함
        const data = (await res.json()) as {
          enabled?: boolean;
          publicKey?: string | null;
        };
        // 서버가 비활성(VAPID 미설정)을 보고 → 렌더 안 함
        if (cancelled || !data.enabled || !data.publicKey) return;

        setPublicKey(data.publicKey);
        setReady(true);

        if (Notification.permission === "denied") {
          setStatus("denied");
          return;
        }
        // 이미 구독돼 있으면 "켜짐" 상태로 표시
        const reg = await navigator.serviceWorker.getRegistration();
        const existing = await reg?.pushManager.getSubscription();
        if (!cancelled && existing) setStatus("subscribed");
      } catch {
        // 네트워크 실패 등 → 조용히 렌더 안 함
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const subscribe = async () => {
    if (!publicKey || status === "loading") return;
    setStatus("loading");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "denied" : "idle");
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      // 이미 구독이 있으면 재사용, 없으면 새로 구독
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
      }

      const json = sub.toJSON();
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: sub.endpoint,
          keys: {
            p256dh: json.keys?.p256dh,
            auth: json.keys?.auth,
          },
        }),
      });

      if (!res.ok) {
        setStatus("error");
        return;
      }
      setStatus("subscribed");
    } catch {
      setStatus("error");
    }
  };

  // 비활성 / 미지원 / 조회 실패 → 아무것도 렌더하지 않음
  if (!ready) return null;

  if (status === "subscribed") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-text-3">
        <Icon name="bell" size={13} />알림 켜짐
      </span>
    );
  }

  if (status === "denied") {
    return (
      <span className="text-[11px] text-text-3">브라우저 알림이 차단됨</span>
    );
  }

  return (
    <button
      type="button"
      onClick={subscribe}
      disabled={status === "loading"}
      className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-3 py-1.5 text-[11px] font-semibold text-text-2 transition-colors hover:text-primary disabled:opacity-60"
    >
      {status === "loading" ? (
        "설정 중…"
      ) : status === "error" ? (
        "다시 시도"
      ) : (
        <>
          <Icon name="bell" size={13} />알림 켜기
        </>
      )}
    </button>
  );
}

export default PushSubscribe;
