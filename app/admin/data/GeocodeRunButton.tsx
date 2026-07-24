"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** 관리자 지오코딩 실행 버튼 — /api/cron/geocode-complexes (관리자 세션 인가) 호출 */
export function GeocodeRunButton({ configured }: { configured: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function run(limit: number) {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/cron/geocode-complexes?limit=${limit}`, {
        method: "GET",
        cache: "no-store",
      });
      const json = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        processed?: number;
        ok?: number;
        skipped?: boolean;
        error?: string;
      };
      if (!res.ok || json.error) {
        setMsg({ ok: false, text: json.error ?? `실패 (${res.status})` });
      } else if (json.skipped) {
        setMsg({ ok: false, text: "지오코딩 키 미설정으로 건너뜀" });
      } else {
        setMsg({
          ok: true,
          text: `처리 ${json.processed ?? 0}건 · 좌표 성공 ${json.ok ?? 0}건`,
        });
        router.refresh();
      }
    } catch {
      setMsg({ ok: false, text: "네트워크 오류" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || !configured}
          onClick={() => run(100)}
          className="rounded-lg bg-[#7ea2ff] px-3.5 py-2 text-[12px] font-bold text-[#0e1320] disabled:opacity-50"
        >
          {busy ? "실행 중…" : "100건 지오코딩"}
        </button>
        <button
          type="button"
          disabled={busy || !configured}
          onClick={() => run(300)}
          className="rounded-lg border border-[rgba(126,162,255,.4)] px-3.5 py-2 text-[12px] font-bold text-[#7ea2ff] disabled:opacity-50"
        >
          300건 지오코딩
        </button>
      </div>
      {!configured && (
        <div className="text-[11px] text-[#f2c94c]">
          NAVER Maps REST 키 미설정 — NCP 콘솔에서 Geocoding 활성화 후 Vercel 환경변수 설정 필요.
        </div>
      )}
      {msg && (
        <div className={`text-[11px] ${msg.ok ? "text-[#4ade80]" : "text-[#f87171]"}`}>
          {msg.text}
        </div>
      )}
      <div className="text-[10px] text-[#9aa6b8]">
        한 번에 최대 300건씩 좌표를 채웁니다. 나머지는 매일 자동(ETL) 백필돼요.
      </div>
    </div>
  );
}
