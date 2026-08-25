"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ExpertCard, type ExpertCardData } from "./ExpertCard";
import { EXPERT_SUBCATEGORIES, findSub, matchSubcategory } from "@/lib/subcategories";
import { Icon } from "@/app/components/Icon";

/**
 * /town/experts 클라이언트 셸 (사용량 절감 11차 — ISR 전환의 클라이언트 절반).
 *
 * 서버(ISR)는 전량(실측 0행, 상한 200)을 SSR 로 그리고, ?sub/?region/?sort 는
 * 마운트 후 location.search 에서 읽는다. 칩은 pushState 버튼 (useSearchParams 는
 * 프리렌더 HTML 에서 서브트리를 지운다 — /town/news 실측 교훈). 필터·정렬은
 * 예전 서버 판과 같은 코드·같은 순서(분야→지역→인증우선 정렬)다.
 *
 * 개인정보: 서버가 넘기는 것은 아래 ExpertPublicRow(슬림 DTO)뿐이다 —
 * UserExpertProfile 의 ownerEmail·userId 는 공개 ISR 캐시에 실리면 안 된다.
 */

/** 공개해도 되는 필드만 — 서버(page.tsx)가 이 모양으로 깎아서 넘긴다 */
export type ExpertPublicRow = {
  id: string;
  name: string;
  title: string;
  category: string;
  regions: string[];
  specialties: string[];
  introduction: string;
  consultationFee: number;
  reportFee: number;
  rating: number;
  reviews: number;
  consultations: number;
  experience: string;
  responseTime: string;
  isVerified: boolean;
  organization: string | null;
  contactPhone: string | null;
  contactKakao: string | null;
  brokerRegistrationNo: string | null;
  createdAt: string;
};

/* ---------- 헬퍼 (예전 서버 페이지에서 그대로 이동) ---------- */

function fee(n: number): string {
  if (n <= 0) return "—";
  if (n >= 10000 && n % 10000 === 0) return `${n / 10000}만원`;
  return `${n.toLocaleString("ko-KR")}원`;
}

function initialOf(name: string): string {
  const trimmed = name.trim();
  return trimmed ? Array.from(trimmed)[0]! : "전";
}

function regionKeyOf(region: string): string {
  return region.split(/[\s·]/)[0] || region;
}

function toCard(e: ExpertPublicRow): ExpertCardData {
  return {
    id: e.id,
    name: e.name,
    title: e.title,
    initial: initialOf(e.name),
    regionLine: [e.regions.slice(0, 2).join("·") || "전국", e.experience ? `경력 ${e.experience}` : null]
      .filter(Boolean)
      .join(" · "),
    regions: e.regions,
    tags: (e.specialties.length > 0 ? e.specialties : [e.category]).filter(Boolean).slice(0, 4),
    // 후기 0건이면 "★ 0.0" 대신 "평가 없음" — 평가가 없는 것과 낮은 평가는 다르다.
    ratingLabel: e.reviews > 0 ? `★ ${e.rating.toFixed(1)}` : "평가 없음",
    reviews: e.reviews,
    consultations: e.consultations,
    responseLabel:
      e.responseTime?.trim() && e.responseTime.trim() !== "대기" ? e.responseTime.trim() : "—",
    introduction: e.introduction,
    consultFeeLabel: fee(e.consultationFee),
    reportFeeLabel: fee(e.reportFee),
    verified: e.isVerified,
    actionable: e.isVerified,
    pendingLabel: e.isVerified ? null : "인증 심사 중",
    organization: e.organization,
    contactPhone: e.contactPhone,
    contactKakao: e.contactKakao,
    brokerRegistrationNo: e.brokerRegistrationNo,
  };
}

type Filter = { sub: string; region: string; sort: "recent" | "consult" };

function readFilter(): Filter {
  const usp = new URLSearchParams(window.location.search);
  return {
    sub: findSub(EXPERT_SUBCATEGORIES, usp.get("sub") ?? undefined).id,
    region: (usp.get("region") ?? "all").trim() || "all",
    /* J8 — "평점순" 없음(상수 0 컬럼). 옛 링크 ?sort=rating 도 recent 로 온다. */
    sort: usp.get("sort") === "consult" ? "consult" : "recent",
  };
}

export function ExpertsClient({
  items,
  truncated,
}: {
  items: ExpertPublicRow[];
  truncated: boolean;
}) {
  // SSR/첫 하이드레이션은 필터 없음 — 프리렌더 HTML 과 정확히 일치.
  const [filter, setFilter] = useState<Filter>({ sub: "all", region: "all", sort: "recent" });

  useEffect(() => {
    setFilter(readFilter());
    const onPop = () => setFilter(readFilter());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const apply = (patch: Partial<Filter>) => {
    const next = { ...filter, ...patch };
    setFilter(next);
    const usp = new URLSearchParams();
    if (next.sub !== "all") usp.set("sub", next.sub);
    if (next.region !== "all") usp.set("region", next.region);
    if (next.sort !== "recent") usp.set("sort", next.sort);
    const s = usp.toString();
    window.history.pushState(null, "", s ? `/town/experts?${s}` : "/town/experts");
  };

  const sub = findSub(EXPERT_SUBCATEGORIES, filter.sub);
  const usingReal = items.length > 0;

  /* 지역 칩 — 항상 전량 기준 (예전 서버 판과 동일).
     [2026-08-22] 등록순으로 앞 6개를 자르던 것을 **빈도순** 6개로 — 임의 지역이
     칩을 차지하고 정작 전문가가 많은 지역이 닿지 않는 문제. */
  const regionFreq = new Map<string, number>();
  for (const e of items) {
    for (const r of e.regions.map(regionKeyOf).filter(Boolean)) {
      regionFreq.set(r, (regionFreq.get(r) ?? 0) + 1);
    }
  }
  const regionKeys = [...regionFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([k]) => k);

  let cards: ExpertCardData[] = [];
  if (usingReal) {
    let list = items;
    if (sub.id !== "all") {
      list = list.filter((e) => matchSubcategory(sub, [e.category, e.title, ...e.specialties]));
    }
    if (filter.region !== "all") {
      list = list.filter((e) => e.regions.some((r) => regionKeyOf(r) === filter.region));
    }
    list = [...list].sort((a, b) => {
      if (a.isVerified !== b.isVerified) return a.isVerified ? -1 : 1;
      if (filter.sort === "consult") return b.consultations - a.consultations;
      return b.createdAt.localeCompare(a.createdAt);
    });
    cards = list.map(toCard);
  }

  const verifiedCards = cards.filter((c) => c.verified);
  const otherCards = cards.filter((c) => !c.verified);

  /* [2026-08-22] slice(0,6) 이 7번째 '금융/대출' 칩을 잘라 먹고 있었다 — 등록
     폼은 대출상담사를 받는데 목록 필터로는 닿을 수 없는 분야였다. 칩 줄은
     가로 스크롤이라 전부 그려도 넘치지 않는다. */
  const subChips = EXPERT_SUBCATEGORIES;
  const sortChips = [
    { id: "recent", label: "최근 등록순" },
    { id: "consult", label: "상담 많은 순" },
  ] as const;
  const filtersActive =
    sub.id !== "all" || filter.region !== "all" || filter.sort !== "recent";

  return (
    <>
      {/* ---------- 필터 (pushState 버튼 — 서버 왕복 없음) ---------- */}
      <div className="rise-in-1 mb-4 flex flex-col gap-2.5">
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 t-body [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {subChips.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => apply({ sub: c.id })}
              aria-pressed={sub.id === c.id}
              className={`chip press shrink-0 px-3.5 py-2 ${
                sub.id === c.id ? "chip-active" : "border border-line bg-surface text-text-2"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        {usingReal && (
          <div className="flex flex-wrap items-center gap-1.5 t-body">
            <button
              type="button"
              onClick={() => apply({ region: "all" })}
              aria-pressed={filter.region === "all"}
              className={`chip press px-3 py-1.5 ${filter.region === "all" ? "chip-active" : "border border-line bg-surface text-text-2"}`}
            >
              전체 지역
            </button>
            {regionKeys.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => apply({ region: r })}
                aria-pressed={filter.region === r}
                className={`chip press px-3 py-1.5 ${filter.region === r ? "chip-active" : "border border-line bg-surface text-text-2"}`}
              >
                {r}
              </button>
            ))}
            <span className="mx-1 h-4 w-px bg-line" />
            {sortChips.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => apply({ sort: c.id })}
                aria-pressed={filter.sort === c.id}
                className={`chip press px-3 py-1.5 ${filter.sort === c.id ? "chip-active" : "border border-line bg-surface text-text-2"}`}
              >
                {c.label}
              </button>
            ))}
            {filtersActive && (
              <button
                type="button"
                onClick={() => apply({ sub: "all", region: "all", sort: "recent" })}
                className="ml-auto inline-flex items-center gap-1 t-sub font-semibold text-primary"
              >
                <Icon name="x" size={12} /> 필터 초기화
              </button>
            )}
          </div>
        )}
      </div>

      {truncated && (
        <p className="mb-3 t-sub text-text-3">
          등록 전문가가 조회 상한에 도달해 일부가 잘렸을 수 있어요 — 필터 결과가
          실제보다 적게 보일 수 있습니다.
        </p>
      )}

      {/* ---------- 섹션 ---------- */}
      {cards.length === 0 ? (
        <div className="rise-in-2 card flex flex-col items-center gap-3 rounded-[18px] px-6 py-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-primary">
            <Icon name="search" size={22} />
          </div>
          <p className="text-sm font-bold text-ink">
            {sub.id === "all" && filter.region === "all"
              ? "인증 전문가가 아직 없어요"
              : `${sub.label} 분야 전문가가 아직 없어요`}
          </p>
          <p className="max-w-xs text-xs leading-[1.6] text-text-3">
            {sub.id === "all" && filter.region === "all"
              ? "베타 기간에는 공급이 적을 수 있어요. 전문가 인증이 끝나면 상담이 열려요. 그동안은 임장노트·지도로 판단을 이어가세요."
              : "다른 분야·지역을 보거나, 임장노트로 기록을 이어가세요."}
          </p>
          <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
            {filtersActive && (
              <button
                type="button"
                onClick={() => apply({ sub: "all", region: "all", sort: "recent" })}
                className="btn-soft rounded-lg px-4 py-2 text-xs"
              >
                필터 초기화
              </button>
            )}
            <Link href="/notes" className="btn-soft rounded-lg px-4 py-2 text-xs no-underline">
              공개 임장노트 보기
            </Link>
            <Link href="/map" className="btn-soft rounded-lg px-4 py-2 text-xs no-underline">
              지도에서 단지 찾기
            </Link>
            <Link href="/qna" className="btn-soft rounded-lg px-4 py-2 text-xs no-underline">
              단지 Q&A에 질문하기
            </Link>
          </div>
        </div>
      ) : (
        <>
          {/* 인증 전문가 */}
          <section className="mb-8">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="t-section text-ink">인증 전문가</h2>
              <span className="t-sub font-semibold text-text-3">
                {verifiedCards.length}명
              </span>
            </div>
            {verifiedCards.length > 0 ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {verifiedCards.map((e, i) => (
                  <ExpertCard key={e.id ?? `${e.name}-${i}`} e={e} index={i} />
                ))}
              </div>
            ) : (
              <div className="card flex flex-col items-center gap-2 rounded-[18px] px-6 py-10 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-primary">
                  <Icon name="shield" size={22} />
                </div>
                <div className="text-sm font-bold text-text-1">아직 인증된 전문가가 없어요</div>
                <div className="max-w-xs text-xs leading-[1.6] text-text-3">
                  인증 심사를 통과하면 상담 가능한 전문가로 노출돼요.
                </div>
              </div>
            )}
          </section>

          {/* 그 외 전문가 (인증 심사 중) */}
          {otherCards.length > 0 && (
            <section className="mb-8">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="t-section text-ink">그 외 전문가</h2>
                <span className="t-sub font-semibold text-text-3">{otherCards.length}명</span>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {otherCards.map((e, i) => (
                  <ExpertCard key={e.id ?? `${e.name}-${i}`} e={e} index={i} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </>
  );
}
