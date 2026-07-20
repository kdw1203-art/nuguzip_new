"use client";

/**
 * 포인트 상점 — 교환 인터랙션.
 * SPEND_ITEMS 그리드 + 잔액 표시 · 각 항목 "교환" → POST /api/points/spend { itemKey }.
 * 성공 시 잔액 갱신 + 안내 · 잔액 부족 시 버튼 비활성.
 */
import { useState } from "react";
import Link from "next/link";
import { SPEND_ITEMS, type SpendItem } from "@/lib/points/catalog";

type ItemState = {
  status: "idle" | "busy" | "done" | "error";
  message: string;
};

type SpendResponse = {
  ok?: boolean;
  balance?: number;
  note?: string;
  error?: string;
};

export function ShopClient({ initialBalance }: { initialBalance: number }) {
  const [balance, setBalance] = useState(initialBalance);
  const [states, setStates] = useState<Record<string, ItemState>>({});

  const setItem = (key: string, s: ItemState) =>
    setStates((prev) => ({ ...prev, [key]: s }));

  const redeem = async (item: SpendItem) => {
    if ((states[item.key]?.status ?? "idle") === "busy") return;
    setItem(item.key, { status: "busy", message: "" });
    try {
      const res = await fetch("/api/points/spend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemKey: item.key }),
      });
      const data = (await res.json().catch(() => ({}))) as SpendResponse;
      if (typeof data.balance === "number") setBalance(data.balance);
      if (res.ok && data.ok) {
        setItem(item.key, {
          status: "done",
          message: data.note ?? "교환이 완료됐어요.",
        });
      } else {
        setItem(item.key, {
          status: "error",
          message: data.error ?? "교환에 실패했어요. 잠시 후 다시 시도해 주세요.",
        });
      }
    } catch {
      setItem(item.key, {
        status: "error",
        message: "네트워크 오류예요. 잠시 후 다시 시도해 주세요.",
      });
    }
  };

  return (
    <div className="mx-auto flex max-w-[720px] flex-col gap-3">
      {/* 잔액 */}
      <div className="rise-in card flex items-center justify-between rounded-[16px] px-5 py-4">
        <div>
          <div className="text-[12px] text-text-3">보유 포인트</div>
          <div className="mt-0.5 text-2xl font-extrabold text-ink">
            {balance.toLocaleString("ko-KR")}
            <span className="ml-0.5 text-base text-primary">P</span>
          </div>
        </div>
        <Link
          href="/my/points"
          className="btn-soft btn-sm"
        >
          내역 보기
        </Link>
      </div>

      {/* 상품 그리드 */}
      <div className="rise-in-1 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {SPEND_ITEMS.map((item) => {
          const st = states[item.key] ?? { status: "idle", message: "" };
          const insufficient = balance < item.cost;
          const busy = st.status === "busy";
          const disabled = busy || (insufficient && st.status !== "done");
          return (
            <div
              key={item.key}
              className="card card-hover flex flex-col rounded-[16px] p-5"
            >
              <div className="text-sm font-extrabold text-ink">{item.label}</div>
              <div className="mt-1 flex-1 text-[12px] leading-[1.5] text-text-3">
                {item.desc}
              </div>
              <div className="mt-3 flex items-center justify-between">
                <div className="text-[15px] font-extrabold text-primary">
                  {item.cost.toLocaleString("ko-KR")}P
                </div>
                <button
                  type="button"
                  onClick={() => void redeem(item)}
                  disabled={disabled}
                  className="btn-primary btn-sm min-w-[72px]"
                >
                  {busy ? "교환 중…" : st.status === "done" ? "교환 완료" : "교환"}
                </button>
              </div>

              {/* 상태 안내 */}
              {st.status === "done" && (
                <div className="mt-2 rounded-[10px] bg-success-soft px-3 py-2 text-[12px] font-semibold text-success">
                  {st.message}
                </div>
              )}
              {st.status === "error" && (
                <div className="mt-2 rounded-[10px] bg-danger-soft px-3 py-2 text-[12px] font-semibold text-danger">
                  {st.message}
                </div>
              )}
              {st.status !== "done" &&
                st.status !== "error" &&
                insufficient && (
                  <div className="mt-2 text-[12px] font-semibold text-text-3">
                    포인트가 부족해요
                  </div>
                )}
            </div>
          );
        })}
      </div>

      <p className="rise-in-2 px-1 text-[11px] leading-[1.6] text-text-3">
        교환한 이용권·크레딧은 즉시 적용돼요. 구독 이용권 교환 시 반영까지 잠시 걸릴 수
        있어요. 포인트는 환불되지 않으니 신중히 교환해 주세요.
      </p>
    </div>
  );
}
