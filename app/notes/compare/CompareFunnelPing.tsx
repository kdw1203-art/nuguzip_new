"use client";

import { useEffect } from "react";

/** 회차 비교 화면 진입 시 ops 퍼널(FIELD_COMPARE_ADD) 1회 기록 */
export function CompareFunnelPing({
  noteId,
  aptName,
}: {
  noteId: string;
  aptName: string;
}) {
  useEffect(() => {
    const key = `nz_cmp_ping_${noteId}`;
    try {
      if (sessionStorage.getItem(key) === "1") return;
      sessionStorage.setItem(key, "1");
    } catch {
      /* private mode — still fire once per mount */
    }
    void fetch("/api/notes/compare-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ noteId, aptName }),
      keepalive: true,
    }).catch(() => {
      /* best-effort */
    });
  }, [noteId, aptName]);

  return null;
}
