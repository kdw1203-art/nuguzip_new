"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ExpertCard, type ExpertCardData } from "./ExpertCard";
import { EXPERT_SUBCATEGORIES, findSub, matchSubcategory } from "@/lib/subcategories";
import { EXPERT_TYPES, findExpertType } from "@/lib/experts/taxonomy";
import { responseTimeLabel } from "@/lib/experts/review-rules";
import { Icon } from "@/app/components/Icon";

/**
 * /town/experts 클라이언트 셸 (953 개편).
 *
 * 서버(ISR)는 전량(상한 200)을 SSR 로 그리고, ?type/?sub/?region/?sort 는 마운트 후
 * location.search 에서 읽는다. 칩은 pushState 버튼(useSearchParams 는 프리렌더 HTML
 * 에서 서브트리를 지운다 — /town/news 실측 교훈).
 *
 * 953 에서 바뀐 것
 *  · 자격 유형 필터(?type=) 추가 — "세무사만" 처럼 자격으로 고르는 흐름이 없었다.
 *  · 정렬에 후기 평점순·응답 빠른 순 추가 — 후기(expert_reviews)·응답률 컬럼이
 *    953 부터 실제 값을 가진다. 기본은 추천순(인증 → 평점 → 완료 상담 → 최근).
 *  · 카드 안 상세 모달 제거(상세 페이지로 통일).
 *
 * 개인정보: 서버가 넘기는 것은 아래 ExpertPublicRow(슬림 DTO)뿐이다.
 */

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
  responseRate: number;
  experience: string;
  responseTime: string;
  isVerified: boolean;
  organization: string | null;
  contactPhone: string | null;
  contactKakao: string | null;
  brokerRegistrationNo: string | null;
  createdAt: string;
};

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
  const type = findExpertType(e.category);
  return {
    id: e.id,
    name: e.name,
    title: e.title,
    typeLabel: type?.label ?? e.category,
    initial: initialOf(e.name),
    regionLine: [e.regions.slice(0, 2).join("·") || "전국", e.experience ? `경력 ${e.experience}` : null]
      .filter(Boolean)
      .join(" · "),
    regions: e.regions,
    tags: e.specialties.filter(Boolean).slice(0, 3),
    rating: e.rating,
    reviews: e.reviews,
    consultations: e.consultations,
    responseLabel: responseTimeLabel(null, e.responseTime),
    introduction: e.introduction,
    consultFeeLabel: fee(e.consultationFee),
    verified: e.isVerified,
    actionable: e.isVerified,
    pendingLabel: e.isVerified ? null : "인증 심사 중",
    organization: e.organization,
    brokerRegistrationNo: e.brokerRegistrationNo,
  };
}

type Sort = "recommended" | "rating" | "consult" | "response" | "recent";
type Filter = { type: string; sub: string; region: string; sort: Sort };
const DEFAULT: Filter = { type: "all", sub: "all", region: "all", sort: "recommended" };
const SORTS: Array<{ id: Sort; label: string }> = [
  { id: "recommended", label: "추천순" },
  { id: "rating", label: "후기 평점순" },
  { id: "consult", label: "상담 많은 순" },
  { id: "response", label: "응답 빠른 순" },
  { id: "recent", label: "최근 등록순" },
];

function readFilter(): Filter {
  const usp = new URLSearchParams(window.location.search);
  const sortRaw = usp.get("sort");
  const sort = SORTS.some((s) => s.id === sortRaw) ? (sortRaw as Sort) : "recommended";
  const typeRaw = usp.get("type");
  return {
    type: typeRaw && findExpertType(typeRaw) ? findExpertType(typeRaw)!.id : "all",
    sub: findSub(EXPERT_SUBCATEGORIES, usp.get("sub") ?? undefined).id,
    region: (usp.get("region") ?? "all").trim() || "all",
    sort,
  };
}

function sortRows(rows: ExpertPublicRow[], sort: Sort): ExpertPublicRow[] {
  const byRecent = (a: ExpertPublicRow, b: ExpertPublicRow) => b.createdAt.localeCompare(a.createdAt);
  return [...rows].sort((a, b) => {
    if (a.isVerified !== b.isVerified) return a.isVerified ? -1 : 1;
    switch (sort) {
      case "rating": {
        /* 후기 없는 프로필은 평점 0 이 아니라 "미평가" — 뒤로 보내되 서로는 최근순 */
        const ar = a.reviews > 0 ? a.rating : -1;
        const br = b.reviews > 0 ? b.rating : -1;
        if (ar !== br) return br - ar;
        if (a.reviews !== b.reviews) return b.reviews - a.reviews;
        return byRecent(a, b);
      }
      case "consult":
        return b.consultations - a.consultations || byRecent(a, b);
      case "response":
        return b.responseRate - a.responseRate || b.consultations - a.consultations || byRecent(a, b);
      case "recent":
        return byRecent(a, b);
      default: {
        const ar = a.reviews > 0 ? a.rating : 0;
        const br = b.reviews > 0 ? b.rating : 0;
        return br - ar || b.consultations - a.consultations || byRecent(a, b);
      }
    }
  });
}

export function ExpertsClient({ items, truncated }: { items: ExpertPublicRow[]; truncated: boolean }) {
  // SSR/첫 하이드레이션은 필터 없음 — 프리렌더 HTML 과 정확히 일치.
  const [filter, setFilter] = useState<Filter>(DEFAULT);

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
    if (next.type !== "all") usp.set("type", next.type);
    if (next.sub !== "all") usp.set("sub", next.sub);
    if (next.region !== "all") usp.set("region", next.region);
    if (next.sort !== "recommended") usp.set("sort", next.sort);
    const s = usp.toString();
    window.history.pushState(null, "", s ? `/town/experts?${s}` : "/town/experts");
  };

  const sub = findSub(EXPERT_SUBCATEGORIES, filter.sub);

  /* 유형·지역 칩은 전량 기준 빈도순 — 실제 전문가가 있는 값만 칩이 된다 */
  const typeCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of items) {
      const t = findExpertType(e.category)?.id ?? "other";
      m.set(t, (m.get(t) ?? 0) + 1);
    }
    return m;
  }, [items]);
  const regionKeys = useMemo(() => {
    const freq = new Map<string, number>();
    for (const e of items) {
      for (const r of e.regions.map(regionKeyOf).filter(Boolean)) freq.set(r, (freq.get(r) ?? 0) + 1);
    }
    return [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k]) => k);
  }, [items]);

  let list = items;
  if (filter.type !== "all") list = list.filter((e) => (findExpertType(e.category)?.id ?? "other") === filter.type);
  if (sub.id !== "all") list = list.filter((e) => matchSubcategory(sub, [e.category, e.title, ...e.specialties]));
  if (filter.region !== "all") list = list.filter((e) => e.regions.some((r) => regionKeyOf(r) === filter.region));
  const cards = sortRows(list, filter.sort).map(toCard);
  const verifiedCards = cards.filter((c) => c.verified);
  const otherCards = cards.filter((c) => !c.verified);
  const filtersActive = filter.type !== "all" || sub.id !== "all" || filter.region !== "all" || filter.sort !== "recommended";
  const chipCls = (active: boolean) =>
    `chip press shrink-0 px-3 py-1.5 t-sub ${active ? "chip-active" : "border border-line bg-surface text-text-2"}`;

  return (
    <>
      {/* ---------- 필터 (pushState — 서버 왕복 없음) ---------- */}
      <div className="rise-in-1 mb-4 flex flex-col gap-2">
        {/* 자격 유형 */}
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label="자격 유형">
          <button type="button" onClick={() => apply({ type: "all" })} aria-pressed={filter.type === "all"} className={chipCls(filter.type === "all")}>
            모든 자격
          </button>
          {EXPERT_TYPES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => apply({ type: t.id })}
              aria-pressed={filter.type === t.id}
              className={chipCls(filter.type === t.id)}
            >
              {t.label}
              {(typeCounts.get(t.id) ?? 0) > 0 && <span className="ml-1 opacity-70">{typeCounts.get(t.id)}</span>}
            </button>
          ))}
        </div>
        {/* 상담 분야 */}
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label="상담 분야">
          {EXPERT_SUBCATEGORIES.map((c) => (
            <button key={c.id} type="button" onClick={() => apply({ sub: c.id })} aria-pressed={sub.id === c.id} className={chipCls(sub.id === c.id)}>
              {c.id === "all" ? "모든 분야" : c.label}
            </button>
          ))}
        </div>
        {/* 지역 · 정렬 */}
        {items.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {regionKeys.length > 0 && (
              <>
                <button type="button" onClick={() => apply({ region: "all" })} aria-pressed={filter.region === "all"} className={chipCls(filter.region === "all")}>
                  전체 지역
                </button>
                {regionKeys.map((r) => (
                  <button key={r} type="button" onClick={() => apply({ region: r })} aria-pressed={filter.region === r} className={chipCls(filter.region === r)}>
                    {r}
                  </button>
                ))}
                <span className="mx-1 h-4 w-px bg-line" />
              </>
            )}
            <label className="inline-flex items-center gap-1.5 t-sub text-text-2">
              <span className="text-text-3">정렬</span>
              <select
                value={filter.sort}
                onChange={(e) => apply({ sort: e.target.value as Sort })}
                className="rounded-lg border border-line bg-surface px-2 py-1 t-sub font-semibold text-ink outline-none focus:border-primary"
              >
                {SORTS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            {filtersActive && (
              <button type="button" onClick={() => apply(DEFAULT)} className="ml-auto inline-flex items-center gap-1 t-sub font-semibold text-primary">
                <Icon name="x" size={12} /> 필터 초기화
              </button>
            )}
          </div>
        )}
      </div>

      {truncated && (
        <p className="mb-3 t-sub text-text-3">
          등록 전문가가 조회 상한에 도달해 일부가 잘렸을 수 있어요 — 필터 결과가 실제보다 적게 보일 수 있습니다.
        </p>
      )}

      {/* ---------- 결과 ---------- */}
      {cards.length === 0 ? (
        <div className="rise-in-2 card flex flex-col items-center gap-3 rounded-[18px] px-6 py-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-navy text-on-dark">
            <Icon name="search" size={22} />
          </div>
          <p className="t-body font-bold text-ink">
            {!filtersActive
              ? "인증 전문가가 아직 없어요"
              : `조건에 맞는 전문가가 아직 없어요`}
          </p>
          <p className="max-w-xs t-sub text-text-3">
            {!filtersActive
              ? "베타 기간이라 공급이 적어요. 인증 심사가 끝나는 대로 여기에 올라옵니다. 그동안은 견적 요청을 남겨 두거나, 임장노트·단지 Q&A 로 판단을 이어가세요."
              : "다른 자격·분야·지역을 보거나, 견적 요청을 남겨 두면 인증 전문가가 먼저 제안을 보내요."}
          </p>
          <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
            {filtersActive && (
              <button type="button" onClick={() => apply(DEFAULT)} className="btn-soft btn-sm">
                필터 초기화
              </button>
            )}
            <Link href="/notes" className="btn-soft btn-sm no-underline">
              공개 임장노트 보기
            </Link>
            <Link href="/qna" className="btn-soft btn-sm no-underline">
              단지 Q&A에 질문하기
            </Link>
          </div>
        </div>
      ) : (
        <>
          <section className="mb-8">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="t-section text-ink">인증 전문가</h2>
              <span className="t-sub font-semibold text-text-3">{verifiedCards.length}명</span>
            </div>
            {verifiedCards.length > 0 ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {verifiedCards.map((e, i) => (
                  <ExpertCard key={e.id ?? `${e.name}-${i}`} e={e} index={i} />
                ))}
              </div>
            ) : (
              <div className="card flex flex-col items-center gap-2 rounded-[18px] px-6 py-10 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-navy text-on-dark">
                  <Icon name="shield" size={22} />
                </div>
                <div className="t-body font-bold text-text-1">아직 인증된 전문가가 없어요</div>
                <div className="max-w-xs t-sub text-text-3">인증 심사를 통과하면 상담 가능한 전문가로 노출돼요. 아래 심사 중 프로필은 상담을 받지 않아요.</div>
              </div>
            )}
          </section>

          {otherCards.length > 0 && (
            <section className="mb-8">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="t-section text-ink">인증 심사 중</h2>
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
