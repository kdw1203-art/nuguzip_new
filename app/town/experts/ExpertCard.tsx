"use client";

import { useState } from "react";
import Link from "next/link";
import { ConsultButton } from "./ConsultButton";
import { QuoteRequestModal } from "./QuoteRequest";
import { Modal } from "@/app/components/ui/Modal";

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
  /** 상호·공개 연락처·등록번호 — 인증 전문가만 값이 온다(서버 DTO 에서 차단) */
  organization: string | null;
  contactPhone: string | null;
  contactKakao: string | null;
  brokerRegistrationNo: string | null;
};

export function ExpertCard({ e, index }: { e: ExpertCardData; index: number }) {
  const [detailOpen, setDetailOpen] = useState(false);
  const [quoteOpen, setQuoteOpen] = useState(false);

  return (
    <div
      className={`card card-hover rise-in-${Math.min(index + 1, 6)} flex flex-col gap-3 rounded-[20px] p-[22px]`}
    >
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-line to-bg t-section text-primary">
          {e.initial}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {/* [2026-08-22] 인증 전문가는 이름이 상세 페이지로 가는 실링크다 —
                예전엔 /town/experts/[id] 로 가는 길이 모달 안 링크뿐이라 공유도
                크롤도 안 되는 2단계 깊이였다. 모달(상세 보기)은 그대로 둔다. */}
            {e.verified && e.id ? (
              <Link
                href={`/town/experts/${e.id}`}
                className="truncate t-section text-ink no-underline hover:text-primary"
              >
                {e.title ? `${e.name} ${e.title}` : e.name}
              </Link>
            ) : (
              <span className="truncate t-section text-ink">
                {e.title ? `${e.name} ${e.title}` : e.name}
              </span>
            )}
            {e.verified ? (
              <span className="shrink-0 rounded-[5px] bg-primary-soft chip-pad-tight t-caption font-extrabold text-primary">
                인증
              </span>
            ) : (
              e.pendingLabel && (
                <span className="shrink-0 rounded border border-line px-1 py-px t-caption font-semibold text-text-3">
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
          <span key={t} className="rounded-full bg-bg px-2.5 py-1 t-sub text-text-2">
            {t}
          </span>
        ))}
      </div>

      <div className="flex justify-between text-xs text-text-3">
        <span>{e.ratingLabel}</span>
        <span>상담 {e.consultations}건</span>
        {/* 미집계 "—" 는 지표처럼 보이지 않게 숨긴다 */}
        {e.responseLabel !== "—" && <span>{e.responseLabel}</span>}
      </div>

      <div className="flex gap-2">
        {e.actionable && e.id ? (
          <>
            <ConsultButton expertId={e.id} expertName={e.name} />
            <button
              type="button"
              onClick={() => setDetailOpen(true)}
              className="btn-secondary flex-1 rounded-xl p-[11px] text-center t-body"
            >
              상세 보기
            </button>
          </>
        ) : (
          <span className="flex-1 cursor-default rounded-xl border border-line bg-bg p-[11px] text-center t-body font-semibold text-text-3">
            {e.pendingLabel === "예시" ? "예시 프로필 · 상담 불가" : "인증 심사 중 · 상담 대기"}
          </span>
        )}
      </div>

      {/* ---------- 상세 모달 ---------- */}
      <Modal
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        label={`${e.name} 전문가 상세`}
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-line to-bg text-lg font-extrabold text-primary">
              {e.initial}
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="t-section text-ink">{e.name}</span>
                {e.verified && (
                  <span className="rounded-[5px] bg-primary-soft chip-pad-tight t-caption font-extrabold text-primary">
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
            className="t-body text-text-3"
          >
            ✕
          </button>
        </div>

        <div
          className={`mb-3 grid gap-2 ${
            e.responseLabel !== "—" ? "grid-cols-3" : "grid-cols-2"
          }`}
        >
          {/* 후기 0건이면 숫자를 만들어 내지 않는다 — "0.0점"과 "아직 평가 없음"은 다르다. */}
          <div className="rounded-xl bg-bg p-2.5 text-center">
            <div className="t-section text-ink">
              {e.reviews > 0 ? e.ratingLabel.replace("★ ", "") : "—"}
            </div>
            <div className="t-caption text-text-3">
              {e.reviews > 0 ? `후기 ${e.reviews}건` : "평가 없음"}
            </div>
          </div>
          <div className="rounded-xl bg-bg p-2.5 text-center">
            <div className="t-section text-ink">{e.consultations}</div>
            <div className="t-caption text-text-3">상담 완료</div>
          </div>
          {e.responseLabel !== "—" && (
            <div className="rounded-xl bg-bg p-2.5 text-center">
              <div className="t-section text-primary">{e.responseLabel}</div>
              <div className="t-caption text-text-3">응답 안내</div>
            </div>
          )}
        </div>

        {e.introduction && (
          <div className="mb-3">
            <div className="mb-1 t-sub font-bold text-text-2">소개</div>
            <p className="whitespace-pre-wrap rounded-xl bg-bg px-3.5 py-3 t-body text-text-1">
              {e.introduction}
            </p>
          </div>
        )}

        <div className="mb-3">
          <div className="mb-1.5 t-sub font-bold text-text-2">전문 분야</div>
          <div className="flex flex-wrap gap-1.5">
            {e.tags.map((t) => (
              <span key={t} className="rounded-full bg-bg px-2.5 py-1 t-sub text-text-2">
                {t}
              </span>
            ))}
          </div>
        </div>

        {/* 상호·연락처·등록번호 — 인증 전문가가 프로필에서 직접 공개한 값만.
            등록번호는 공적 조회 가능한 정보라 신뢰 표시로 보여 준다. */}
        {(e.organization || e.contactPhone || e.contactKakao || e.brokerRegistrationNo) && (
          <div className="mb-3 flex flex-col gap-1.5 rounded-xl bg-bg px-3.5 py-3 t-sub">
            {e.organization && (
              <div className="flex items-center justify-between gap-2">
                <span className="shrink-0 text-text-3">상호</span>
                <span className="min-w-0 truncate font-bold text-ink">{e.organization}</span>
              </div>
            )}
            {e.brokerRegistrationNo && (
              <div className="flex items-center justify-between gap-2">
                <span className="shrink-0 text-text-3">등록번호</span>
                <span className="min-w-0 truncate font-bold text-ink">{e.brokerRegistrationNo}</span>
              </div>
            )}
            {e.contactPhone && (
              <div className="flex items-center justify-between gap-2">
                <span className="shrink-0 text-text-3">전화</span>
                <a href={`tel:${e.contactPhone.replace(/[^0-9+]/g, "")}`} className="font-extrabold text-primary no-underline">
                  {e.contactPhone}
                </a>
              </div>
            )}
            {/* 사용자 입력 URL — https 만 링크로 렌더(javascript: 등 스킴 주입 차단) */}
            {e.contactKakao && /^https:\/\//i.test(e.contactKakao.trim()) && (
              <div className="flex items-center justify-between gap-2">
                <span className="shrink-0 text-text-3">카카오톡</span>
                <a href={e.contactKakao.trim()} target="_blank" rel="noopener noreferrer" className="min-w-0 truncate font-extrabold text-primary no-underline">
                  채널 열기 ↗
                </a>
              </div>
            )}
          </div>
        )}

        <div className="mb-4 flex flex-col gap-2">
          <div className="flex items-center justify-between rounded-[14px] bg-bg px-4 py-3">
            <span className="t-body font-bold text-ink">상담료</span>
            <span className="t-section text-ink">{e.consultFeeLabel}</span>
          </div>
          <div className="flex items-center justify-between rounded-[14px] bg-bg px-4 py-3">
            <span className="t-body font-bold text-ink">리포트료</span>
            <span className="t-section text-ink">{e.reportFeeLabel}</span>
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
            className="btn-secondary flex-1 rounded-xl p-[11px] text-center t-body"
          >
            견적 요청
          </button>
        </div>
        {/* 예전엔 `/town/market` 으로 보내는 "발행 리포트 전체 보기" 였다. 두 가지가
            어긋나 있었다 — (1) /town/market 은 리다이렉트 경유지일 뿐이고,
            (2) 리포트 열람은 아직 오픈 전이라 "발행 리포트"는 한 건도 없다.
            실제로 닿는 곳(자료 허브)을 직접 가리키고, 라벨도 거기서 볼 수 있는 것에 맞춘다. */}
        {/* 공유·색인 가능한 전문가 상세 페이지 — 모달은 목록 안 미리보기, 전체는 여기 */}
        {e.id && (
          <Link
            href={`/town/experts/${e.id}`}
            className="mt-2 block text-center t-sub font-bold text-primary no-underline"
          >
            프로필 전체 페이지 보기 →
          </Link>
        )}
        <Link
          href="/town/library"
          className="mt-2 block text-center t-sub text-text-3 no-underline"
        >
          자료 · 리포트 보기
        </Link>
      </Modal>

      <QuoteRequestModal
        open={quoteOpen}
        onClose={() => setQuoteOpen(false)}
        headline={`${e.name} 관련 견적 요청`}
      />
    </div>
  );
}
