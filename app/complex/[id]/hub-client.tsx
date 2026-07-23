"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AIPanel } from "../../components/AIPanel";
import { PriceTrendChart, type PricePoint } from "./PriceTrendChart";
import {
  isInCompareTray,
  promoteCompareItemToServer,
  removeCompareItemFromServer,
  subscribeCompareTray,
  toggleCompareTray,
} from "@/lib/newui/compare-tray";

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

/* ===== 비교 담기 버튼 — lib/newui/compare-tray (localStorage, 최대 5개) ===== */
export function CompareTrayButton({
  complexId,
  name,
  region,
}: {
  complexId: string;
  name: string;
  region?: string;
}) {
  const [inTray, setInTray] = useState(false);
  const [full, setFull] = useState(false);

  useEffect(() => {
    setInTray(isInCompareTray(complexId));
    return subscribeCompareTray(() => setInTray(isInCompareTray(complexId)));
  }, [complexId]);

  useEffect(() => {
    if (!full) return;
    const t = setTimeout(() => setFull(false), 2000);
    return () => clearTimeout(t);
  }, [full]);

  const onClick = () => {
    const r = toggleCompareTray({ id: complexId, name, region });
    setInTray(r.inTray);
    setFull(r.full);
    // #46 로그인 상태면 서버 user_watchlist에도 반영 (실패 시 localStorage만 유지)
    if (r.inTray) promoteCompareItemToServer({ id: complexId, name });
    else if (!r.full) removeCompareItemFromServer(complexId);
  };

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={inTray}
      className={`flex-1 rounded-[11px] p-3 text-center text-[13px] transition-colors ${
        inTray ? "bg-ink font-extrabold text-white" : "btn-secondary"
      }`}
    >
      {full ? "최대 5개까지 담겨요" : inTray ? "비교 담김 ✓" : "비교 담기"}
    </button>
  );
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
  priceSeries,
}: {
  aiTitle: string;
  aiBody: string;
  myRecord: string;
  listingsLabel: string;
  trades: HubTrade[];
  notes: HubNote[];
  listings: HubListing[];
  priceSeries: PricePoint[];
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
          {/* 실거래 가격 추이 차트 (실데이터 2개월 이상일 때만) */}
          {priceSeries.length >= 2 && <PriceTrendChart points={priceSeries} />}
          {myRecordCard}
          {trades.length > 0 ? (
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
          ) : (
            <div className="card rounded-[14px] px-[15px] py-6 text-center text-[13px] text-text-3">
              아직 수집된 국토교통부 실거래가 없어요
            </div>
          )}
        </div>
      )}

      {/* ===== 노트 ===== */}
      {tab === "노트" && (
        <div className="rise-in-3 flex flex-col gap-2.5">
          {notes.length === 0 && (
            <div className="card rounded-[14px] px-[15px] py-6 text-center text-[13px] text-text-3">
              아직 이 단지에 공개된 임장노트가 없어요
            </div>
          )}
          {notes.map((n) => (
            <div
              key={n.title}
              className="card card-hover flex items-center justify-between rounded-[14px] px-[15px] py-3.5"
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
          {listings.length === 0 && (
            <div className="card rounded-[14px] px-[15px] py-6 text-center text-[13px] text-text-3">
              등록된 실매물이 아직 없어요 · 지도에서 주변 매물을 확인해 보세요
            </div>
          )}
          {listings.map((l) => (
            <div
              key={l.price}
              className={`card card-hover flex flex-col gap-1.5 rounded-[16px] px-[15px] py-3.5 ${
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
          <div className="px-1 text-xs font-extrabold text-text-3">
            실거래 히스토리 <span className="font-medium text-text-3">· 국토교통부 기준</span>
          </div>
          {/* 실거래 가격 추이 차트 (실데이터 2개월 이상일 때만) */}
          {priceSeries.length >= 2 && <PriceTrendChart points={priceSeries} />}
          {trades.length > 0 ? (
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
          ) : (
            <div className="card rounded-[14px] px-[15px] py-6 text-center text-[13px] text-text-3">
              아직 수집된 국토교통부 실거래가 없어요
            </div>
          )}
          <Link href="/analysis/price" className="btn-soft rounded-xl p-3 text-center text-[13px]">
            AI 시세 분석 보기
          </Link>
        </div>
      )}

      {/* ===== 내 기록 ===== */}
      {tab === "내 기록" && (
        <div className="rise-in-3 flex flex-col gap-2.5">
          {myRecordCard}
          {/* 사실 우선: 개인화된 노트 판정은 실제 작성 노트가 있을 때만 — 허위 점수·강약점 제거 */}
          <div className="card flex flex-col items-center gap-1.5 rounded-[14px] px-[15px] py-6 text-center">
            <span className="text-[13px] font-bold text-ink">
              아직 이 단지에 남긴 임장노트가 없어요
            </span>
            <span className="text-[11px] text-text-3">
              직접 방문해 기록하면 내 판정·방문 이력이 여기에 쌓여요
            </span>
            <Link
              href="/notes/new"
              className="btn-primary btn-cta mt-1 rounded-[10px] px-4 py-2 text-xs"
            >
              임장노트 쓰기
            </Link>
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
