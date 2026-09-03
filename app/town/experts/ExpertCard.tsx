"use client";

import Link from "next/link";
import { ConsultButton } from "./ConsultButton";
import { Icon } from "@/app/components/Icon";

/* 전문가 목록 카드 (953 개편).
   953 전에는 카드 안에 상세 모달이 하나 더 있었다 — 상세 페이지(/town/experts/[id])가
   생긴 뒤로는 같은 내용을 두 번 그리는 셈이라 걷어냈다. 카드는 "고르는 단계"에
   필요한 것만 보여 준다: 누구인지(이름·자격·상호), 어디서(지역), 무엇을(분야),
   믿을 만한지(인증·후기·완료 상담·응답), 그리고 두 동작(상담 신청 / 프로필).
   브랜드: 아바타는 네이비 위 한지 글자, 후기 별은 주홍, CTA 만 나우블루. */

export type ExpertCardData = {
  id: string | null;
  name: string;
  title: string;
  /** 자격 유형 라벨(공인중개사 등) — 카테고리 칩 */
  typeLabel: string;
  initial: string;
  regionLine: string;
  regions: string[];
  tags: string[];
  /** 후기 평균 (reviews>0 일 때만 의미) */
  rating: number;
  reviews: number;
  consultations: number;
  /** 실측 또는 전문가가 적은 응답 안내 — 없으면 null */
  responseLabel: string | null;
  introduction: string;
  consultFeeLabel: string;
  verified: boolean;
  /** 실제 상담 가능 여부 (=인증됨) */
  actionable: boolean;
  pendingLabel: string | null;
  organization: string | null;
  brokerRegistrationNo: string | null;
};

export function Stars({ rating, size = 12 }: { rating: number; size?: number }) {
  const full = Math.round(rating);
  return (
    <span className="inline-flex items-center gap-px text-brand-red" aria-hidden="true">
      {[1, 2, 3, 4, 5].map((n) => (
        <Icon key={n} name="star" size={size} className={n <= full ? "" : "opacity-25"} />
      ))}
    </span>
  );
}

export function ExpertCard({ e, index }: { e: ExpertCardData; index: number }) {
  const href = e.id ? `/town/experts/${e.id}` : "/town/experts";
  const intro = e.introduction.trim();

  return (
    <article
      className={`card tile rise-in-${Math.min(index + 1, 6)} flex flex-col gap-3 rounded-[18px] p-5`}
    >
      {/* 머리: 아바타 · 이름 · 인증 */}
      <div className="flex items-start gap-3">
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-navy t-section text-on-dark"
          aria-hidden="true"
        >
          {e.initial}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {e.id ? (
              <Link href={href} className="truncate t-section text-ink no-underline hover:text-primary">
                {e.name}
              </Link>
            ) : (
              <span className="truncate t-section text-ink">{e.name}</span>
            )}
            {e.verified ? (
              <span
                title="자격 서류와 신원 확인을 거쳐 내집나우가 승인한 전문가예요"
                className="inline-flex shrink-0 items-center gap-0.5 rounded-md bg-primary-soft chip-pad-tight t-caption font-extrabold text-primary"
              >
                <Icon name="shield" size={10} /> 인증
              </span>
            ) : (
              e.pendingLabel && (
                <span className="shrink-0 rounded-md border border-line chip-pad-tight t-caption font-semibold text-text-3">
                  {e.pendingLabel}
                </span>
              )
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 t-sub text-text-2">
            <span className="font-bold">{e.typeLabel}</span>
            {e.title && e.title !== e.typeLabel && <span className="text-text-3">· {e.title}</span>}
          </div>
          <div className="truncate t-sub text-text-3">{e.regionLine}</div>
        </div>
      </div>

      {/* 공적으로 조회 가능한 신호 — 값이 있을 때만 */}
      {(e.organization || e.brokerRegistrationNo) && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-[10px] bg-bg px-2.5 py-1.5 t-caption text-text-2">
          {e.organization && <span className="font-bold text-text-1">{e.organization}</span>}
          {e.brokerRegistrationNo && (
            <span>
              등록번호 <span className="t-num font-semibold">{e.brokerRegistrationNo}</span>
            </span>
          )}
        </div>
      )}

      {/* 소개 두 줄 */}
      {intro && <p className="clamp-2 t-sub text-text-2">{intro}</p>}

      {/* 분야 */}
      {e.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {e.tags.map((t) => (
            <span key={t} className="chip-tag px-2 py-0.5 t-caption">
              {t}
            </span>
          ))}
        </div>
      )}

      {/* 지표 — 실측만. 없는 건 지표처럼 보이지 않게 뺀다 */}
      <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 t-caption text-text-3">
        {e.reviews > 0 ? (
          <span className="inline-flex items-center gap-1">
            <Stars rating={e.rating} />
            <b className="t-num text-ink">{e.rating.toFixed(1)}</b>
            <span>({e.reviews})</span>
          </span>
        ) : (
          <span>후기 아직 없음</span>
        )}
        <span>
          상담 완료 <b className="t-num text-ink">{e.consultations}</b>
        </span>
        {e.responseLabel && <span className="text-success">{e.responseLabel}</span>}
        {e.consultFeeLabel !== "—" && <span className="ml-auto">상담료 {e.consultFeeLabel}</span>}
      </div>

      <div className="flex gap-2">
        {e.actionable && e.id ? (
          <>
            <ConsultButton expertId={e.id} expertName={e.name} className="btn-primary flex-1 rounded-xl px-3 py-2.5 t-body" />
            <Link href={href} className="btn-secondary flex-1 rounded-xl px-3 py-2.5 text-center t-body no-underline">
              프로필
            </Link>
          </>
        ) : (
          <span className="flex-1 cursor-default rounded-xl border border-line bg-bg px-3 py-2.5 text-center t-body font-semibold text-text-3">
            인증 심사 중 · 상담 대기
          </span>
        )}
      </div>
    </article>
  );
}
