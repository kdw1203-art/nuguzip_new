"use client";

import { useState } from "react";
import Link from "next/link";
import { AIPanel } from "../../components/AIPanel";

/* 시안 23b — 단지 허브 탭 5개(요약·노트·매물·시세·내 기록) 전환 서브컴포넌트 */

export interface HubTrade {
  date: string;
  price: string;
  sub: string;
  delta: string;
  tone: "up" | "down" | "flat";
}

export interface HubNote {
  title: string;
  author: string;
  score: string;
}

export interface HubListing {
  badge: string;
  urgent: boolean;
  price: string;
  priceNote: string | null;
  meta: string;
  agent: string;
}

const TABS = ["요약", "노트", "매물", "시세", "내 기록"] as const;
type Tab = (typeof TABS)[number];

function deltaClass(tone: "up" | "down" | "flat"): string {
  return tone === "down" ? "delta-down" : tone === "up" ? "delta-up" : "delta-flat";
}

export function ComplexHubTabs({
  aiTitle,
  aiBody,
  myRecord,
  listingsLabel,
  trades,
  notes,
  listings,
}: {
  aiTitle: string;
  aiBody: string;
  myRecord: string;
  listingsLabel: string;
  trades: HubTrade[];
  notes: HubNote[];
  listings: HubListing[];
}) {
  const [tab, setTab] = useState<Tab>("요약");

  const myRecordCard = (
    <div className="card flex items-center justify-between rounded-[14px] px-[15px] py-3.5">
      <span className="text-[13px] text-text-1">
        <b className="text-ink">내 기록</b> — {myRecord}
      </span>
      <Link href="/my" className="shrink-0 text-xs font-extrabold text-primary">
        이어서 ›
      </Link>
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      {/* 탭 칩 5개 */}
      <div className="rise-in-2 flex flex-wrap gap-1.5 text-[13px]">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-full px-3.5 py-2 font-bold transition-colors ${
              tab === t
                ? "bg-ink text-white"
                : "border border-[#e2e7ee] bg-surface font-semibold text-text-2"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* ===== 요약 ===== */}
      {tab === "요약" && (
        <div className="rise-in-3 flex flex-col gap-3">
          <AIPanel title={aiTitle}>{aiBody}</AIPanel>
          {myRecordCard}
          <div className="card flex flex-col rounded-[14px] px-[15px] py-2">
            {trades.slice(0, 3).map((t, i) => (
              <div
                key={`${t.date}-${i}`}
                className={`flex items-center justify-between py-2.5 text-[13px] ${
                  i < Math.min(trades.length, 3) - 1 ? "border-b border-[#f0f3f8]" : ""
                }`}
              >
                <span className="text-text-2">
                  {t.date} · {t.sub}
                </span>
                <span className="flex items-baseline gap-2">
                  <span className="font-extrabold text-ink">{t.price}</span>
                  <span className={`text-[11px] ${deltaClass(t.tone)}`}>{t.delta}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===== 노트 ===== */}
      {tab === "노트" && (
        <div className="rise-in-3 flex flex-col gap-2.5">
          {notes.map((n) => (
            <div
              key={n.title}
              className="card flex items-center justify-between rounded-[14px] px-[15px] py-3.5"
            >
              <div>
                <div className="text-[13px] font-bold text-ink">{n.title}</div>
                <div className="mt-0.5 text-[11px] text-text-3">{n.author}</div>
              </div>
              <span className="shrink-0 text-xs font-extrabold text-primary">{n.score}</span>
            </div>
          ))}
          <Link href="/notes" className="btn-soft rounded-xl p-3 text-center text-[13px]">
            공개 노트 모두 보기
          </Link>
        </div>
      )}

      {/* ===== 매물 ===== */}
      {tab === "매물" && (
        <div className="rise-in-3 flex flex-col gap-2.5">
          <div className="px-1 text-xs font-extrabold text-text-3">{listingsLabel}</div>
          {listings.map((l) => (
            <div
              key={l.price}
              className={`card flex flex-col gap-1.5 rounded-[16px] px-[15px] py-3.5 ${
                l.urgent ? "border-[1.5px] border-primary" : ""
              }`}
            >
              <div className="flex items-center gap-1.5">
                <span
                  className={`rounded-[5px] px-2 py-[3px] text-[11px] font-extrabold ${
                    l.urgent ? "bg-danger-soft text-danger" : "bg-[#f2f4f8] font-bold text-text-2"
                  }`}
                >
                  {l.badge}
                </span>
                <span className="text-sm font-extrabold text-ink">{l.price}</span>
                {l.priceNote && (
                  <span className="text-xs font-bold text-primary">{l.priceNote}</span>
                )}
              </div>
              <div className="text-xs text-text-2">{l.meta}</div>
              <div className="text-[11px] text-text-3">{l.agent}</div>
            </div>
          ))}
          <Link href="/map" className="btn-soft rounded-xl p-3 text-center text-[13px]">
            지도에서 매물 전체 보기
          </Link>
        </div>
      )}

      {/* ===== 시세 ===== */}
      {tab === "시세" && (
        <div className="rise-in-3 flex flex-col gap-2.5">
          <div className="px-1 text-xs font-extrabold text-text-3">실거래 히스토리</div>
          <div className="card flex flex-col rounded-[14px] px-[15px] py-2">
            {trades.map((t, i) => (
              <div
                key={`${t.date}-${i}`}
                className={`flex items-center justify-between py-2.5 text-[13px] ${
                  i < trades.length - 1 ? "border-b border-[#f0f3f8]" : ""
                }`}
              >
                <span className="text-text-2">
                  {t.date} · {t.sub}
                </span>
                <span className="flex items-baseline gap-2">
                  <span className="font-extrabold text-ink">{t.price}</span>
                  <span className={`text-[11px] ${deltaClass(t.tone)}`}>{t.delta}</span>
                </span>
              </div>
            ))}
          </div>
          <Link href="/analysis/price" className="btn-soft rounded-xl p-3 text-center text-[13px]">
            AI 시세 분석 보기
          </Link>
        </div>
      )}

      {/* ===== 내 기록 ===== */}
      {tab === "내 기록" && (
        <div className="rise-in-3 flex flex-col gap-2.5">
          {myRecordCard}
          <div className="card flex flex-col gap-[7px] rounded-[14px] px-[15px] py-[13px]">
            <div className="flex justify-between">
              <span className="text-xs font-extrabold text-ink">내 노트 판정</span>
              <span className="text-xs font-extrabold text-primary">81점 · 5회 방문</span>
            </div>
            <div className="flex flex-wrap gap-[5px]">
              <span className="chip bg-primary-soft px-2 py-[3px] text-[10px] text-primary">
                학군 확정 강점
              </span>
              <span className="chip bg-primary-soft px-2 py-[3px] text-[10px] text-primary">
                배수 양호
              </span>
              <span className="chip bg-danger-soft px-2 py-[3px] text-[10px] text-danger">
                주차 확정 약점
              </span>
            </div>
          </div>
          <div className="card flex items-center justify-between rounded-[14px] px-[15px] py-3.5">
            <span className="text-[13px] text-text-1">
              비로그인 상태에서는 요약·노트만 열람돼요
            </span>
            <Link href="/login" className="shrink-0 text-xs font-extrabold text-primary">
              로그인 ›
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
