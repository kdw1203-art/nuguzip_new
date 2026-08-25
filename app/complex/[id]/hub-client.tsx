"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AIPanel } from "../../components/AIPanel";
import { PriceTrendChart, type PricePoint } from "./PriceTrendChart";
import { useSoftSignup } from "@/app/components/soft-signup/SoftSignupProvider";
import { useUpgradePaywall } from "@/app/components/UpgradePaywallProvider";

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

/* ===== 비교 담기 버튼 — #412 로 app/components/CompareTrayButton.tsx 분리.
   /map 이 버튼 하나 때문에 이 파일 전체(차트·AI 패널·탭)를 정적으로 끌고
   오던 것을 끊었다. 기존 임포터 호환을 위해 재수출만 남긴다. ===== */
export { CompareTrayButton } from "@/app/components/CompareTrayButton";

/* ===== 관심 단지(팔로우) 버튼 =====
   2026-07-27 이전 단지 홈 제목 옆의 "+ 단지 팔로우" 는 onClick 이 없는
   <button> 이었다. 파란 글씨로 눌러 보라고 말해 놓고 아무 일도 안 했다.
   지도 패널(ComplexInfoPanel)은 같은 기능을 /api/me/watchlist 로 이미
   제대로 쓰고 있었다 — 같은 API 를 붙인다.
   그쪽 토글은 Toast·SoftSignup 프로바이더에 묶여 있어 그대로 못 옮기므로,
   여기서는 버튼 안에서 상태를 그대로 말하는 자립형으로 만든다. */
export function WatchlistButton({
  complexId,
  complexName,
}: {
  complexId: string;
  complexName: string;
}) {
  const { promptSignup } = useSoftSignup();
  const { handleUpgradeResponse } = useUpgradePaywall();
  const [watching, setWatching] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  /* 모바일24 — 실패만 빨간 글씨로 말하고 성공은 침묵했다. 저장이 무엇을 의미하는지
     (시세 변동 알림 — price-alerts 크론이 ±1% 변동 시 실제로 보낸다) 성공 시에도
     한 줄로 말한다. tone 으로 색만 가른다. */
  const [message, setMessage] = useState<{ text: string; tone: "error" | "ok" } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/me/watchlist?complexId=${encodeURIComponent(complexId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { watching?: boolean } | null) => {
        // 비로그인(401)이면 j 가 null — "관심 없음"이 아니라 "모름"이므로 false 로 시작한다.
        if (!cancelled) setWatching(j ? Boolean(j.watching) : false);
      })
      .catch(() => {
        if (!cancelled) setWatching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [complexId]);

  async function toggle() {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = watching
        ? await fetch(`/api/me/watchlist?complexId=${encodeURIComponent(complexId)}`, {
            method: "DELETE",
          })
        : await fetch("/api/me/watchlist", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ complexId, complexName }),
          });
      if (res.status === 401) {
        promptSignup({
          action: "watchlist_add",
          title: "관심 단지로 저장할까요?",
          benefit: "가입하면 이 단지의 실거래·임장 기록을 모아볼 수 있어요.",
          callbackUrl: `/complex/${complexId}`,
        });
        return;
      }
      const j = (await res.json().catch(() => ({}))) as {
        error?: string;
        code?: string;
      };
      if (handleUpgradeResponse(res.status, j)) {
        setMessage({ text: j.error ?? "관심 단지 한도에 도달했어요", tone: "error" });
        return;
      }
      if (!res.ok) {
        setMessage({ text: j.error ?? "저장하지 못했어요", tone: "error" });
        return;
      }
      if (!watching) {
        setMessage({ text: "저장했어요 · 시세 변동 시 알림을 받아요", tone: "ok" });
      }
      setWatching(!watching);
    } catch {
      setMessage({ text: "네트워크 오류가 발생했어요", tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="flex flex-col items-end">
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        aria-pressed={watching === true}
        className={`text-xs font-bold disabled:opacity-50 ${
          watching ? "text-ink" : "text-primary"
        }`}
      >
        {busy ? "저장 중…" : watching ? "✓ 관심 단지" : "+ 단지 팔로우"}
      </button>
      {message && (
        <span
          className={`mt-0.5 text-[10px] ${message.tone === "ok" ? "text-text-3" : "text-danger"}`}
        >
          {message.text}
        </span>
      )}
    </span>
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
  notesFailed = false,
  notesWriteHref,
  listings,
  priceSeries,
  complexId,
}: {
  aiTitle: string;
  aiBody: string;
  myRecord: string;
  listingsLabel: string;
  trades: HubTrade[];
  notes: HubNote[];
  /** 조회 자체가 실패했는지 — "아직 없어요"와 "지금 못 불러왔어요"는 다른 말이다. */
  notesFailed?: boolean;
  /** 이 단지에 연결된 글을 쓰러 가는 주소 (/town/write?complex=…) */
  notesWriteHref?: string;
  listings: HubListing[];
  priceSeries: PricePoint[];
  /** 지도 CTA 딥링크용 — 있으면 /map?complexId= 로 단지 맥락을 들고 간다 */
  complexId?: string;
}) {
  const [tab, setTab] = useState<Tab>("요약");

  const myRecordCard = (
    <div className="card flex items-center justify-between rounded-[14px] px-[15px] py-3.5">
      <span className="t-body text-text-1">
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
      <div className="rise-in-2 flex flex-wrap gap-1.5 t-body">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-full px-3.5 py-2 font-bold transition-colors ${
              tab === t
                ? "bg-ink text-surface"
                : "border border-line bg-surface font-semibold text-text-2"
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
          {priceSeries.length >= 2 && <PriceTrendChart points={priceSeries} />}
          {myRecordCard}
          {trades.length > 0 ? (
            <div className="card flex flex-col rounded-[14px] px-3.5 py-2">
              <div className="flex items-baseline justify-between px-0.5 py-1.5">
                <span className="t-sub font-bold text-text-2">
                  최근 실거래 · {Math.min(trades.length, 18)}개월
                </span>
                <span className="t-caption text-text-3">시세 탭에서 전체</span>
              </div>
              <div className="overflow-hidden rounded-xl bg-bg">
                {trades.slice(0, 18).map((t, i) => (
                  <div
                    key={`${t.date}-${i}`}
                    className={`flex items-center justify-between px-3 py-[7px] text-[12px] ${
                      i > 0 ? "border-t border-line" : ""
                    }`}
                  >
                    <span className="text-text-2">
                      {t.date}
                      <span className="ml-1.5 text-text-3">{t.sub}</span>
                    </span>
                    <span className="flex shrink-0 items-baseline gap-1.5">
                      <span className="font-extrabold text-ink">{t.price}</span>
                      <span className={`text-[10px] ${deltaClass(t.tone)}`}>{t.delta}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="card rounded-[14px] px-[15px] py-6 text-center t-body text-text-3">
              아직 수집된 국토교통부 실거래가 없어요
            </div>
          )}
          {notes.length > 0 && (
            <div className="card flex flex-col gap-1.5 rounded-[14px] px-3.5 py-2.5">
              <div className="px-0.5 t-sub font-bold text-text-2">
                단지 이야기 미리보기 · {notes.length}건
              </div>
              {notes.slice(0, 4).map((n) => (
                <div
                  key={n.title}
                  className="rounded-xl bg-bg px-3 py-2"
                >
                  <div className="truncate t-sub font-bold text-ink">{n.title}</div>
                  <div className="mt-0.5 flex justify-between gap-2 t-caption text-text-3">
                    <span className="truncate">{n.author}</span>
                    <span className="shrink-0 font-bold text-primary">{n.score}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ===== 노트 ===== */}
      {tab === "노트" && (
        <div className="rise-in-3 flex flex-col gap-2.5">
          {notes.length === 0 && (
            <div className="card rounded-[14px] px-[15px] py-6 text-center t-body text-text-3">
              {notesFailed ? (
                <>
                  <b className="text-ink">지금은 불러올 수 없어요</b>
                  <div className="mt-1">
                    노트가 없는 게 아니라 목록을 읽어 오지 못했어요. 잠시 후 다시 열어
                    주세요.
                  </div>
                </>
              ) : (
                "아직 이 단지에 공개된 임장노트가 없어요"
              )}
            </div>
          )}
          {notes.map((n) => (
            <div
              key={n.title}
              className="card tile flex flex-col gap-0.5 rounded-[14px] px-3.5 py-3"
            >
              <div className="t-body font-bold text-ink">{n.title}</div>
              <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
                <span className="t-sub text-text-3">{n.author}</span>
                <span className="t-sub font-extrabold text-primary">{n.score}</span>
              </div>
            </div>
          ))}
          {notesWriteHref && !notesFailed && (
            <Link
              href={notesWriteHref}
              className="btn-primary rounded-xl p-3 text-center t-body"
            >
              이 단지 이야기 쓰기
            </Link>
          )}
          <Link href="/notes" className="btn-soft rounded-xl p-3 text-center t-body">
            공개 노트 모두 보기
          </Link>
        </div>
      )}

      {/* ===== 매물 ===== */}
      {tab === "매물" && (
        <div className="rise-in-3 flex flex-col gap-2.5">
          <div className="px-1 text-xs font-extrabold text-text-3">{listingsLabel}</div>
          {listings.length === 0 && (
            <div className="card rounded-[14px] px-[15px] py-6 text-center t-body text-text-3">
              등록된 실매물이 아직 없어요 · 지도에서 주변 매물을 확인해 보세요
            </div>
          )}
          {listings.map((l) => (
            <div
              key={l.price}
              className={`card tile flex flex-col gap-1.5 rounded-[16px] px-[15px] py-3.5 ${
                l.urgent ? "border-[1.5px] border-primary" : ""
              }`}
            >
              <div className="flex items-center gap-1.5">
                <span
                  className={`rounded-[5px] chip-pad text-[11px] font-extrabold ${
                    l.urgent ? "bg-danger-soft text-danger" : "bg-bg font-bold text-text-2"
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
              <div className="t-sub text-text-3">{l.agent}</div>
            </div>
          ))}
          {/* 예전엔 맨 /map — 단지 맥락이 통째로 사라져 전국 지도가 떴다 */}
          <Link
            href={complexId ? `/map?complexId=${encodeURIComponent(complexId)}` : "/map"}
            className="btn-soft rounded-xl p-3 text-center t-body"
          >
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
            <div className="card flex flex-col overflow-hidden rounded-[14px] px-0 py-0">
              <div className="border-b border-line bg-bg px-3.5 py-2 t-sub font-bold text-text-2">
                전체 {trades.length}개월 · 국토교통부
              </div>
              {trades.map((t, i) => (
                <div
                  key={`${t.date}-${i}`}
                  className={`flex items-center justify-between px-3.5 py-[7px] text-[12px] ${
                    i < trades.length - 1 ? "border-b border-divider" : ""
                  }`}
                >
                  <span className="text-text-2">
                    {t.date}
                    <span className="ml-1.5 text-text-3">{t.sub}</span>
                  </span>
                  <span className="flex shrink-0 items-baseline gap-1.5">
                    <span className="font-extrabold text-ink">{t.price}</span>
                    <span className={`text-[10px] ${deltaClass(t.tone)}`}>{t.delta}</span>
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="card rounded-[14px] px-[15px] py-6 text-center t-body text-text-3">
              아직 수집된 국토교통부 실거래가 없어요
            </div>
          )}
          <Link href="/analysis/price" className="btn-soft rounded-xl p-3 text-center t-body">
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
            <span className="t-body font-bold text-ink">
              아직 이 단지에 남긴 임장노트가 없어요
            </span>
            <span className="t-sub text-text-3">
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
            <span className="t-body text-text-1">
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
