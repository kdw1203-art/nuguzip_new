"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
/* types.ts 는 설계상 server-only 체인이 없는 순수 타입·상수 모듈이라 값 import 가 안전하다
   (파일 머리말에 그렇게 못박혀 있다). store.ts 쪽은 서버 전용이므로 타입만 온다. */
import { PARTNER_TYPES, type DevPartner } from "@/lib/dev-deals/types";

/**
 * /dev-deals/partners 클라이언트 셸 (사용량 절감 10차 — ISR 전환의 클라이언트 절반).
 *
 * 서버(ISR)는 전량(실측 1행, 실등록 0)을 SSR 로 그리고, ?type= 필터는 마운트 후
 * location.search 에서 읽는다. 칩은 history.pushState 버튼이다 (useSearchParams 는
 * 프리렌더 HTML 에서 그 서브트리를 지운다 — /town/news 실측 교훈).
 *
 * 필터 동치성: 예전 서버는 type 을 DB .eq 로 걸었다. 전량이 페치 상한
 * (PARTNERS_FETCH_CAP=120) 안이면 메모리 필터가 동치고, 상한 도달 시
 * truncated 로 내려와 화면에 알린다.
 */

function readTypeFromLocation(): string | null {
  const raw = new URLSearchParams(window.location.search).get("type");
  const v = (raw ?? "").trim();
  return v || null;
}

function PartnerCard({ p }: { p: DevPartner }) {
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-full bg-primary-soft chip-pad text-[11px] font-semibold text-primary">
            {p.partnerType}
          </span>
          {p.isVerified && (
            <span
              className="chip"
              style={{ background: "var(--success-soft)", color: "var(--success)" }}
            >
              검증
            </span>
          )}
          {p.isSample && (
            <span
              className="chip"
              style={{ background: "var(--warning-soft)", color: "var(--warning)" }}
            >
              예시
            </span>
          )}
        </div>
      </div>

      <div className="mt-2 text-[14px] font-extrabold text-ink">{p.companyName}</div>
      <div className="mt-0.5 text-[11px] text-text-3">{p.region ?? "지역 전국·협의"}</div>

      {p.intro && (
        <p className="mt-2 line-clamp-3 text-[12px] leading-[1.6] text-text-2">
          {p.intro}
        </p>
      )}

      {p.specialties.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {p.specialties.map((s) => (
            <span
              key={s}
              className="rounded-full bg-[rgba(0,0,0,.04)] chip-pad text-[10px] font-medium text-text-2"
            >
              {s}
            </span>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between text-[11px] text-text-3">
        <span>연락처 {p.contactMasked ?? "문의 시 공개"}</span>
        {p.portfolioUrl && (
          <a
            href={p.portfolioUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-bold text-primary underline"
          >
            포트폴리오
          </a>
        )}
      </div>
    </div>
  );
}

export function PartnersClient({
  partners,
  truncated,
}: {
  partners: DevPartner[];
  truncated: boolean;
}) {
  // SSR/첫 하이드레이션은 전체(null) — 프리렌더 HTML 과 정확히 일치.
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    setActive(readTypeFromLocation());
    const onPop = () => setActive(readTypeFromLocation());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const select = (next: string | null) => {
    setActive(next);
    const url = next
      ? `/dev-deals/partners?type=${encodeURIComponent(next)}`
      : "/dev-deals/partners";
    window.history.pushState(null, "", url);
  };

  const shown = active ? partners.filter((p) => p.partnerType === active) : partners;

  return (
    <>
      {/* 유형 필터 — 예전엔 ?type= 링크(서버 재렌더)였다. 이제 얕은 pushState 버튼. */}
      <section className="rise-in-1 mb-5 flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => select(null)}
          aria-pressed={active === null}
          className={!active ? "chip-active" : "chip"}
        >
          전체
        </button>
        {PARTNER_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => select(active === t ? null : t)}
            aria-pressed={active === t}
            className={active === t ? "chip-active" : "chip"}
          >
            {t}
          </button>
        ))}
      </section>

      {truncated && (
        <p className="rise-in-1 mb-3 text-[11px] leading-[1.6] text-text-3">
          등록 업체가 조회 상한에 도달해 일부가 잘렸을 수 있어요 — 유형별 수가
          실제보다 적게 보일 수 있습니다.
        </p>
      )}

      {shown.length === 0 ? (
        <section className="rise-in-2 card p-[var(--pad-card)]">
          <div className="rounded-[12px] border border-line bg-surface px-4 py-10 text-center text-[13px] text-text-3">
            해당 유형의 협력업체가 아직 없어요.{" "}
            <Link
              href="/dev-deals/partners/new"
              className="font-bold text-primary underline"
            >
              협력업체로 등록
            </Link>
            해 매칭을 받아 보세요.
          </div>
        </section>
      ) : (
        <section className="rise-in-2 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {shown.map((p) => (
            <PartnerCard key={p.id} p={p} />
          ))}
        </section>
      )}
    </>
  );
}
