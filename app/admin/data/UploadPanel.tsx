"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * F1 — 수동 데이터 업로드 패널.
 * 공공 API 인증키가 없거나 API 로 못 받는 자료(KB 시계열 엑셀, RTMS CSV, 공공데이터 아카이브)를
 * 관리자가 직접 올려 적재한다. 응답 JSON 요약을 그대로 보여준다.
 */

interface Target {
  key: string;
  label: string;
  path: string;
  accept: string;
  hint: string;
}

const TARGETS: Target[] = [
  {
    key: "molit",
    label: "실거래 CSV (RTMS)",
    path: "/api/admin/molit-csv",
    accept: ".csv",
    hint: "공공데이터포털 아파트 매매/전월세 실거래 CSV → market_transactions",
  },
  {
    key: "kb",
    label: "KB 시계열 (.xlsx)",
    path: "/api/admin/market/kb-upload",
    accept: ".xlsx",
    hint: "KB 주간·월간 주택가격 시계열 엑셀 → market_region_*",
  },
  {
    key: "archive",
    label: "공공데이터 아카이브",
    path: "/api/admin/public-data/archive",
    accept: ".csv,.zip,.hwpx",
    hint: "CSV·ZIP·HWPX 원본 보관 및 추출",
  },
];

type Result = { ok: boolean; text: string; detail?: string };

function summarize(json: Record<string, unknown>): string {
  const parts: string[] = [];
  const pick = (k: string, label: string) => {
    const v = json[k];
    if (typeof v === "number") parts.push(`${label} ${v.toLocaleString("ko-KR")}`);
  };
  pick("parsed", "파싱");
  pick("inserted", "적재");
  pick("upserted", "반영");
  pick("rows", "행");
  pick("coveredGroups", "기존커버(구·월)");
  const sk = json.skipped;
  if (sk && typeof sk === "object") {
    const s = sk as Record<string, number>;
    const bits = Object.entries(s)
      .filter(([, v]) => typeof v === "number" && v > 0)
      .map(([k, v]) => `${k}=${v}`);
    if (bits.length > 0) parts.push(`건너뜀(${bits.join(",")})`);
  } else if (typeof sk === "number" && sk > 0) parts.push(`건너뜀 ${sk}`);
  if (typeof json.message === "string" && json.message) parts.push(json.message);
  return parts.length > 0 ? parts.join(" · ") : "완료";
}

function UploadRow({ target }: { target: Target }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(target.path, { method: "POST", body: fd });
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok || json.ok === false) {
        setResult({
          ok: false,
          text:
            (typeof json.error === "string" && json.error) ||
            (typeof json.message === "string" && json.message) ||
            `실패 (${res.status})`,
        });
      } else {
        setResult({ ok: true, text: `${file.name} — ${summarize(json)}` });
        router.refresh();
      }
    } catch {
      setResult({ ok: false, text: "업로드 실패 (네트워크)" });
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="rounded-xl border border-[rgba(255,255,255,.07)] bg-[rgba(255,255,255,.03)] px-3.5 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[12.5px] font-bold text-white">{target.label}</div>
          <div className="truncate text-[10.5px] text-[#9aa6b8]">{target.hint}</div>
        </div>
        <label
          className={`shrink-0 cursor-pointer rounded-lg border border-[rgba(126,162,255,.35)] px-3 py-1.5 text-[11.5px] font-bold text-ai-accent ${
            busy ? "pointer-events-none opacity-50" : ""
          }`}
        >
          {busy ? "업로드 중…" : "파일 선택"}
          <input
            ref={inputRef}
            type="file"
            accept={target.accept}
            onChange={onPick}
            className="hidden"
            disabled={busy}
          />
        </label>
      </div>
      {result && (
        <div
          className={`mt-2 break-words text-[10.5px] ${result.ok ? "text-ai-success" : "text-ai-danger"}`}
        >
          {result.text}
        </div>
      )}
    </div>
  );
}

export function UploadPanel() {
  return (
    <div className="flex flex-col gap-2.5">
      {TARGETS.map((t) => (
        <UploadRow key={t.key} target={t} />
      ))}
      <div className="text-[10px] leading-relaxed text-[#9aa6b8]">
        실거래 CSV 는 이미 데이터가 있는 구·월을 통째로 건너뜁니다. 같은 거래가 두 번 들어가면
        거래량·평균가가 이중 계상되기 때문이에요. 비어 있는 지역·기간을 채울 때 쓰세요.
      </div>
    </div>
  );
}
