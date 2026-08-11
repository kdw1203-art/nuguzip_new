"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
// public-records.ts 는 server-only 체인 — 타입만 가져오고(소거), 라벨은 순수
// 카탈로그(lib/codef/endpoints — server-only 아님)에서 같은 규칙으로 만든다.
import type { PublicRecord } from "@/lib/market/public-records";
import { CODEF_PRODUCTS } from "@/lib/codef/endpoints";

/** lib/market/public-records.ts datasetLabel 과 동일 규칙 (CODEF_PRODUCTS 파생) */
const DATASET_LABEL = new Map(CODEF_PRODUCTS.map((p) => [p.dataset, p.label] as const));
function datasetLabel(dataset: string): string {
  return DATASET_LABEL.get(dataset) ?? dataset;
}

/**
 * /data/records 단지 검색 (사용량 절감 14차 — ISR 전환의 클라이언트 절반).
 *
 * 예전에는 <form method="get"> 이 ?complex= 로 서버 재렌더를 일으켰다. 이제
 * 검색은 /api/public-records(검색어별 CDN 캐시) 페치이고, 딥링크 ?complex= 는
 * 마운트 후 location.search 에서 읽어 같은 경로로 조회한다. URL 은 pushState 로
 * 유지해 공유·뒤로가기가 예전과 같이 동작한다.
 * 조회 실패는 "자료 없음"과 구별해 그린다.
 */

function fmtKrw(won: number | null): string {
  if (!won || won <= 0) return "—";
  const eok = won / 100_000_000;
  if (eok >= 1) return `${eok >= 10 ? eok.toFixed(1) : eok.toFixed(2)}억`;
  return `${Math.round(won / 10_000).toLocaleString()}만`;
}

function readQuery(): string {
  return (new URLSearchParams(window.location.search).get("complex") ?? "").trim();
}

export function RecordsSearchClient() {
  const [input, setInput] = useState("");
  const [query, setQuery] = useState(""); // 마지막으로 실행된 검색어
  const [records, setRecords] = useState<PublicRecord[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const reqSeq = useRef(0);

  const run = (q: string) => {
    const name = q.trim();
    if (!name) return;
    const seq = ++reqSeq.current;
    setQuery(name);
    setStatus("loading");
    fetch(`/api/public-records?complex=${encodeURIComponent(name)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: { ok: boolean; items: PublicRecord[] }) => {
        if (seq !== reqSeq.current) return;
        if (!j.ok) throw new Error("not_ok");
        setRecords(j.items);
        setStatus("ok");
      })
      .catch(() => {
        if (seq !== reqSeq.current) return;
        setStatus("error");
      });
  };

  useEffect(() => {
    const q = readQuery();
    if (q) {
      setInput(q);
      run(q);
    }
    const onPop = () => {
      const pq = readQuery();
      setInput(pq);
      if (pq) run(pq);
      else {
        setStatus("idle");
        setRecords([]);
        setQuery("");
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const name = input.trim();
    if (!name) return;
    window.history.pushState(
      null,
      "",
      `/data/records?complex=${encodeURIComponent(name)}`,
    );
    run(name);
  };

  return (
    <>
      <form onSubmit={submit} className="mt-3 flex gap-2">
        <input
          type="search"
          name="complex"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          maxLength={40}
          placeholder="단지명으로 검색 (예: 은마아파트)"
          className="flex-1 rounded-xl border border-line bg-surface px-3.5 py-2 text-[13px] text-ink outline-none placeholder:text-text-3"
        />
        <button
          type="submit"
          disabled={status === "loading"}
          className="btn-primary rounded-[10px] px-4 py-2 text-[13px] disabled:opacity-60"
        >
          {status === "loading" ? "조회 중…" : "조회"}
        </button>
      </form>

      {status === "error" && (
        <div className="mt-4 rounded-[12px] border border-line bg-surface px-4 py-8 text-center text-[13px] text-text-2">
          &ldquo;{query}&rdquo; 조회에 실패했어요 — 자료가 없는 게 아니라 지금 읽지
          못한 상태예요. 잠시 뒤{" "}
          <button
            type="button"
            onClick={() => run(query)}
            className="font-bold text-primary underline underline-offset-2"
          >
            다시 시도
          </button>
          해 주세요.
        </div>
      )}

      {status === "ok" && records.length === 0 && (
        <div className="mt-4 rounded-[12px] border border-line bg-surface px-4 py-8 text-center text-[13px] text-text-3">
          &ldquo;{query}&rdquo; 관련 공개 자료가 아직 없어요. 실거래 데이터는{" "}
          <Link
            href={`/complex/browse`}
            className="font-bold text-primary underline-offset-2 hover:underline"
          >
            단지 실거래
          </Link>
          에서 확인해 보세요.
        </div>
      )}

      {status === "ok" && records.length > 0 && (
        <ul className="mt-4">
          {records.map((r) => (
            <li
              key={r.id}
              className="flex items-center justify-between gap-3 border-b border-border py-3 last:border-0"
            >
              <div className="min-w-0">
                <div className="text-[12px] font-bold text-ink">
                  {datasetLabel(r.dataset)}
                  {r.areaM2 ? ` · ${r.areaM2}㎡` : ""}
                </div>
                <div className="mt-0.5 text-[11px] text-text-3">
                  {r.complexName ?? ""} {r.recordDate ?? r.period ?? ""}
                </div>
              </div>
              <div className="shrink-0 text-right text-[13px] font-extrabold text-ink">
                {r.priceLowKrw || r.priceHighKrw
                  ? `${fmtKrw(r.priceLowKrw)} ~ ${fmtKrw(r.priceHighKrw)}`
                  : r.depositKrw
                    ? fmtKrw(r.depositKrw)
                    : "—"}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
