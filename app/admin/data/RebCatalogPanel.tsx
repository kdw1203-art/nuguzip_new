"use client";

import { useState } from "react";

/**
 * F1 — R-ONE(부동산원) 통계표 카탈로그 조회.
 * stat-codes 매핑을 검증·교정할 때 쓴다. 조회 전용이라 DB 를 건드리지 않는다.
 * REB_OPENAPI_KEY 가 없으면 API 가 message 로 알려주고 목록은 비어 있다.
 */

interface TableRow {
  statblId?: string;
  statblNm?: string;
  cycle?: string;
}
interface ItemRow {
  itmId?: string;
  itmNm?: string;
  itmFullNm?: string;
}

export function RebCatalogPanel() {
  const [q, setQ] = useState("매매가격지수");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [tables, setTables] = useState<TableRow[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [items, setItems] = useState<ItemRow[]>([]);

  async function search() {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    setOpenId(null);
    setItems([]);
    try {
      const res = await fetch(`/api/admin/market/reb-catalog?q=${encodeURIComponent(q)}`, {
        cache: "no-store",
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        tables?: TableRow[];
        count?: number;
        message?: string;
        error?: string;
      };
      if (!res.ok || json.ok === false) {
        setTables([]);
        setMsg(json.message ?? json.error ?? `조회 실패 (${res.status})`);
        return;
      }
      setTables(json.tables ?? []);
      setMsg(`${(json.count ?? 0).toLocaleString("ko-KR")}건`);
    } catch {
      setMsg("네트워크 오류");
    } finally {
      setBusy(false);
    }
  }

  async function loadItems(statblId: string) {
    if (openId === statblId) {
      setOpenId(null);
      setItems([]);
      return;
    }
    setOpenId(statblId);
    setItems([]);
    try {
      const res = await fetch(
        `/api/admin/market/reb-catalog?statblId=${encodeURIComponent(statblId)}`,
        { cache: "no-store" },
      );
      const json = (await res.json().catch(() => ({}))) as { items?: ItemRow[] };
      setItems(json.items ?? []);
    } catch {
      setItems([]);
    }
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void search();
          }}
          placeholder="통계표 이름 일부 (예: 매매가격지수)"
          className="min-w-0 flex-1 rounded-lg border border-[rgba(255,255,255,.1)] bg-[rgba(255,255,255,.04)] px-3 py-2 text-[12px] text-white placeholder:text-[#6b7688] focus:border-[rgba(126,162,255,.5)] focus:outline-none"
        />
        <button
          type="button"
          onClick={() => void search()}
          disabled={busy}
          className="shrink-0 rounded-lg bg-ai-accent px-3.5 py-2 text-[12px] font-bold text-[#0e1320] disabled:opacity-50"
        >
          {busy ? "조회 중…" : "조회"}
        </button>
      </div>
      {msg && <div className="text-[10px] text-[#9aa6b8]">{msg}</div>}

      {tables.length > 0 && (
        <div className="max-h-[280px] overflow-y-auto rounded-xl border border-[rgba(255,255,255,.07)]">
          {tables.slice(0, 80).map((t) => (
            <div key={t.statblId} className="border-b border-[rgba(255,255,255,.05)] last:border-0">
              <button
                type="button"
                onClick={() => void loadItems(t.statblId ?? "")}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-[rgba(255,255,255,.04)]"
              >
                <span className="min-w-0 flex-1 truncate text-[12px] text-white">
                  {t.statblNm}
                </span>
                <code className="shrink-0 text-[10px] text-ai-accent">{t.statblId}</code>
              </button>
              {openId === t.statblId && (
                <div className="bg-[rgba(0,0,0,.2)] px-3 py-2">
                  {items.length === 0 ? (
                    <div className="text-[10px] text-[#9aa6b8]">세부항목 불러오는 중…</div>
                  ) : (
                    <div className="flex flex-col gap-1">
                      {items.slice(0, 40).map((it) => (
                        <div key={it.itmId} className="flex gap-2 text-[10px]">
                          <code className="shrink-0 text-[#f2c94c]">{it.itmId}</code>
                          <span className="min-w-0 truncate text-[#c7d0de]">
                            {it.itmFullNm || it.itmNm}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
