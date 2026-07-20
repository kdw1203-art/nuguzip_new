"use client";

import { useState } from "react";
import Link from "next/link";
import { ConsultButton } from "./ConsultButton";
import { QuoteRequestModal } from "./QuoteRequest";

/* 전문가 목록 카드 + 상세 모달.
   상세: 소개·전문분야·상담료·리포트료 + 상담 요청(consult API) + 견적 요청(market_requests).
   인증(is_verified) 전문가만 실제 상담/상세 열람 가능 · 미인증/목업은 예시로 비활성. */

export type ExpertCardData = {
  id: string | null;
  name: string;
  title: string;
  initial: string;
  regionLine: string;
  regions: string[];
  tags: string[];
  ratingLabel: string;
  reviews: number;
  consultations: number;
  responseLabel: string;
  introduction: string;
  consultFeeLabel: string;
  reportFeeLabel: string;
  verified: boolean;
  /** 실제 상담·상세 열람 가능 여부 (=인증됨) */
  actionable: boolean;
  /** 비활성 사유 라벨: "예시"(목업) | "인증 심사 중"(미인증 실데이터) */
  pendingLabel: string | null;
};

export function ExpertCard({ e, index }: { e: ExpertCardData; index: number }) {
  const [detailOpen, setDetailOpen] = useState(false);
  const [quoteOpen, setQuoteOpen] = useState(false);

  return (
    <div
      className={`card card-hover rise-in-${Math.min(index + 1, 6)} flex flex-col gap-3 rounded-[20px] p-[22px]`}
    >
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#e2e8f2] to-[#eef2f8] text-[15px] font-extrabold text-primary">
          {e.initial}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[15px] font-extrabold text-ink">
              {e.title ? `${e.name} ${e.title}` : e.name}
            </span>
            {e.verified ? (
              <span className="shrink-0 rounded-[5px] bg-[#edf2fe] px-[7px] py-px text-[10px] font-extrabold text-primary">
                인증
              </span>
            ) : (
              e.pendingLabel && (
                <span className="shrink-0 rounded border border-line px-1 py-px text-[9px] font-semibold text-text-3">
                  {e.pendingLabel}
                </span>
              )
            )}
          </div>
          <div className="truncate text-xs text-text-3">{e.regionLine}</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {e.tags.map((t) => (
          <span key={t} className="rounded-full bg-[#f2f4f8] px-2.5 py-1 text-[11px] text-text-2">
            {t}
          </span>
        ))}
      </div>

      <div className="flex justify-between text-xs text-text-3">
        <span>{e.ratingLabel}</span>
        <span>상담 {e.consultations}건</span>
        <span>{e.responseLabel}</span>
      </div>

      <div className="flex gap-2">
        {e.actionable && e.id ? (
          <>
            <ConsultButton expertId={e.id} expertName={e.name} />
            <button
              type="button"
              onClick={() => setDetailOpen(true)}
              className="btn-secondary flex-1 rounded-xl p-[11px] text-center text-[13px]"
            >
              상세 보기
            </button>
          </>
        ) : (
          <span className="flex-1 cursor-default rounded-xl border border-line bg-bg p-[11px] text-center text-[13px] font-semibold text-text-3">
            {e.pendingLabel === "예시" ? "예시 프로필 · 상담 불가" : "인증 심사 중 · 상담 대기"}
          </span>
        )}
      </div>

      {/* ---------- 상세 모달 ---------- */}
      {detailOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(16,24,40,.4)] backdrop-blur-[2px] sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label={`${e.name} 전문가 상세`}
        >
          <div className="max-h-[88vh] w-full max-w-[460px] overflow-y-auto rounded-t-3xl bg-surface p-5 sm:rounded-3xl">
            <div className="mb-3 flex items-start justify-between gap-2">
              <div className="flex items-center gap-3">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#e2e8f2] to-[#eef2f8] text-lg font-extrabold text-primary">
                  {e.initial}
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[16px] font-extrabold text-ink">{e.name}</span>
                    {e.verified && (
                      <span className="rounded-[5px] bg-[#edf2fe] px-[7px] py-px text-[10px] font-extrabold text-primary">
                        인증
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-text-3">
                    {e.title}
                    {e.regionLine ? ` · ${e.regionLine}` : ""}
                  </div>
                </div>
              </div>
              <button
                type="button"
                aria-label="닫기"
                onClick={() => setDetailOpen(false)}
                className="text-[15px] text-text-3"
              >
                ✕
              </button>
            </div>

            <div className="mb-3 grid grid-cols-3 gap-2">
              <div className="rounded-xl bg-bg p-2.5 text-center">
                <div className="text-[15px] font-extrabold text-ink">{e.ratingLabel.replace("★ ", "")}</div>
                <div className="text-[10px] text-text-3">평점 {e.reviews}</div>
              </div>
              <div className="rounded-xl bg-bg p-2.5 text-center">
                <div className="text-[15px] font-extrabold text-ink">{e.consultations}</div>
                <div className="text-[10px] text-text-3">상담 완료</div>
              </div>
              <div className="rounded-xl bg-bg p-2.5 text-center">
                <div className="text-[15px] font-extrabold text-primary">{e.responseLabel}</div>
                <div className="text-[10px] text-text-3">응답</div>
              </div>
            </div>

            {e.introduction && (
              <div className="mb-3">
                <div className="mb-1 text-[11px] font-bold text-text-2">소개</div>
                <p className="whitespace-pre-wrap rounded-xl bg-bg px-3.5 py-3 text-[13px] leading-[1.7] text-text-1">
                  {e.introduction}
                </p>
              </div>
            )}

            <div className="mb-3">
              <div className="mb-1.5 text-[11px] font-bold text-text-2">전문 분야</div>
              <div className="flex flex-wrap gap-1.5">
                {e.tags.map((t) => (
                  <span key={t} className="rounded-full bg-[#f2f4f8] px-2.5 py-1 text-[11px] text-text-2">
                    {t}
                  </span>
                ))}
              </div>
            </div>

            <div className="mb-4 flex flex-col gap-2">
              <div className="flex items-center justify-between rounded-[14px] bg-bg px-4 py-3">
                <span className="text-[13px] font-bold text-ink">상담료</span>
                <span className="text-[15px] font-extrabold text-ink">{e.consultFeeLabel}</span>
              </div>
              <div className="flex items-center justify-between rounded-[14px] bg-bg px-4 py-3">
                <span className="text-[13px] font-bold text-ink">리포트료</span>
                <span className="text-[15px] font-extrabold text-ink">{e.reportFeeLabel}</span>
              </div>
            </div>

            <div className="flex gap-2">
              {e.id && <ConsultButton expertId={e.id} expertName={e.name} />}
              <button
                type="button"
                onClick={() => {
                  setDetailOpen(false);
                  setQuoteOpen(true);
                }}
                className="btn-secondary flex-1 rounded-xl p-[11px] text-center text-[13px]"
              >
                견적 요청
              </button>
            </div>
            <Link
              href="/town/market"
              className="mt-2 block text-center text-[11px] text-text-3 no-underline"
            >
              발행 리포트 전체 보기
            </Link>
          </div>
        </div>
      )}

      <QuoteRequestModal
        open={quoteOpen}
        onClose={() => setQuoteOpen(false)}
        headline={`${e.name} 관련 견적 요청`}
      />
    </div>
  );
}
