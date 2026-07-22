import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/app/components/PageShell";
import { Icon } from "@/app/components/Icon";
import { ExampleBadge } from "@/app/components/ExampleBadge";
import { safeAuth } from "@/lib/safe-auth";
import type { PurposeId } from "@/lib/onboarding/personalization";
import {
  loadRecommendations,
  EXAMPLE_ITEM,
  type RecItem,
  type PersonalizationSummary,
} from "./recommend-data";

/* D17 — 맞춤 단지·지역 추천 (추천 이유 설명)
   로그인 사용자의 관심지역·예산·목적을 기존 시세 스냅샷과 매칭해 룰 기반으로 추천한다.
   실데이터가 없으면(이 환경: service-role 미설정) 예시 1건 + 개인화 안내를 보여준다.
   데이터 소스: getOnboardingPersonalization · getAllRegionSnapshots · regionIdForName */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "맞춤 추천 · 누구집",
  description:
    "관심지역·예산·목적에 맞춘 단지·지역 추천과 추천 이유를 확인하세요. 데이터가 쌓일수록 더 정교해집니다.",
};

const PURPOSE_LABEL: Record<PurposeId, string> = {
  live: "실거주",
  invest: "투자",
  jeonse: "전세",
};

const deltaClass: Record<RecItem["tone"], string> = {
  up: "delta-up",
  down: "delta-down",
  flat: "delta-flat",
};

/* ── 비로그인 안내 ── */
function LoginPrompt() {
  return (
    <div className="mx-auto flex max-w-[560px] flex-col items-center gap-3 py-6">
      <div className="card glass flex w-full flex-col items-center gap-3 rounded-[20px] px-5 py-9 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-primary">
          <Icon name="sparkles" size={24} />
        </div>
        <div className="text-base font-extrabold text-ink">
          관심지역을 설정하고 맞춤 추천을 받아보세요
        </div>
        <div className="text-[13px] leading-[1.7] text-text-3">
          로그인 후 관심지역·예산·목적을 알려주시면, 시세 흐름과 예산에 맞는
          단지·지역을 <b>추천 이유와 함께</b> 골라드려요.
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
          <Link href="/login?callbackUrl=/recommend" className="btn-primary btn-md no-underline">
            로그인하고 시작하기
          </Link>
          <Link href="/welcome" className="btn-soft btn-md no-underline">
            관심지역 설정하기
          </Link>
        </div>
      </div>
    </div>
  );
}

/* ── 개인화 요약 칩 (관심지역·예산·목적) ── */
function PersonalizationChips({ p }: { p: PersonalizationSummary | null }) {
  const chips: string[] = [];
  for (const r of p?.regions ?? []) chips.push(r);
  if (p?.budget) chips.push(p.budget.label ? `${p.budget.label}` : p.budget.type === "jeonse" ? "전세" : "매매");
  if (p?.purpose) chips.push(PURPOSE_LABEL[p.purpose]);
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[12px] font-semibold text-text-3">내 조건</span>
      {chips.map((c, i) => (
        <span key={`${c}-${i}`} className="chip chip-tag px-2.5 py-1 text-[12px]">
          {c}
        </span>
      ))}
      <Link href="/welcome" className="text-[12px] font-semibold text-primary no-underline">
        수정 ›
      </Link>
    </div>
  );
}

/* ── 추천 카드 ── */
function RecCard({ item }: { item: RecItem }) {
  const inner = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[15px] font-extrabold text-ink">{item.name}</span>
            {item.example && <ExampleBadge />}
          </div>
          <div className="mt-0.5 text-[12px] text-text-3">
            {item.city ? `${item.city} · ` : ""}
            {item.tradeCount != null
              ? `최근 거래 ${item.tradeCount.toLocaleString("ko-KR")}건`
              : "시세 집계 지역"}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[15px] font-extrabold text-ink">
            {item.priceLabel ?? "시세 준비중"}
          </div>
          <div className={`text-[12px] ${deltaClass[item.tone]}`}>전월비 {item.delta}</div>
        </div>
      </div>

      {/* 추천 이유 */}
      <div className="mt-3 flex items-start gap-1.5 border-t border-line pt-3">
        <Icon name="sparkles" size={14} className="mt-0.5 shrink-0 text-primary" />
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-[11px] font-bold text-primary">추천 이유</span>
          <div className="flex flex-wrap gap-1">
            {item.reasons.map((r, i) => (
              <span key={`${r}-${i}`} className="chip chip-soft px-2 py-0.5 text-[11px]">
                {r}
              </span>
            ))}
          </div>
        </div>
      </div>
    </>
  );

  if (item.example) {
    // 예시 카드는 링크 없이 정적 표시
    return <div className="card card-pad rounded-[16px]">{inner}</div>;
  }
  return (
    <Link
      href={`/region/${item.regionId}`}
      className="card card-hover card-pad rounded-[16px] no-underline"
    >
      {inner}
    </Link>
  );
}

/* ── 실데이터 0건 안내 (예시 1건 동반) ── */
function EmptyState({
  personalization,
  hasMarketData,
}: {
  personalization: PersonalizationSummary | null;
  hasMarketData: boolean;
}) {
  const hasInterest = (personalization?.regions.length ?? 0) > 0;
  const hasBudget = !!personalization?.budget;
  const configured = hasInterest || hasBudget;

  const headline = !configured
    ? "관심지역·예산을 설정하면 맞춤 추천이 시작돼요"
    : !hasMarketData
      ? "시세 데이터가 쌓이면 맞춤 추천을 보여드려요"
      : "조건에 맞는 추천을 준비하고 있어요";

  const body = !configured
    ? "관심지역과 예산·목적을 알려주시면, 예산에 맞고 시세 흐름이 좋은 지역을 추천 이유와 함께 골라드려요."
    : "관심지역이 설정되어 있어요. 해당 지역의 시세·거래 데이터가 충분히 모이면 자동으로 맞춤 추천이 채워집니다.";

  return (
    <div className="flex flex-col gap-4">
      <div className="card glass flex flex-col items-center gap-3 rounded-[18px] px-5 py-8 text-center">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary-soft text-primary">
          <Icon name="compass" size={22} />
        </div>
        <div className="text-[15px] font-extrabold text-ink">{headline}</div>
        <div className="max-w-[440px] text-[13px] leading-[1.7] text-text-3">{body}</div>
        <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
          <Link href="/welcome" className="btn-primary btn-md no-underline">
            {hasInterest ? "관심지역 수정" : "관심지역 설정"}
          </Link>
          <Link href="/map" className="btn-soft btn-md no-underline">
            지역 시세 둘러보기
          </Link>
        </div>
      </div>

      {/* 예시 카드 1건 (더미데이터 정책: 예시는 최대 1개) */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-1.5 px-1">
          <span className="text-[13px] font-bold text-text-2">추천 카드 예시</span>
          <span className="text-[12px] text-text-3">— 실제 데이터가 쌓이면 이렇게 보여요</span>
        </div>
        <RecCard item={EXAMPLE_ITEM} />
      </div>
    </div>
  );
}

export default async function RecommendPage() {
  const session = await safeAuth();
  const email = session?.user?.email;

  if (!email) {
    return (
      <PageShell breadcrumb="맞춤 추천" title="맞춤 추천">
        <LoginPrompt />
      </PageShell>
    );
  }

  const { items, personalization, hasMarketData } = await loadRecommendations(email);

  return (
    <PageShell breadcrumb="맞춤 추천" title="맞춤 단지·지역 추천">
      <div className="mx-auto flex max-w-[860px] flex-col gap-4">
        <p className="text-[13px] leading-[1.7] text-text-3">
          관심지역·예산·목적과 최근 시세 흐름을 맞춰 지역을 추천하고, 각 카드에{" "}
          <b className="text-text-1">추천 이유</b>를 함께 보여드려요.
        </p>

        <PersonalizationChips p={personalization} />

        {items.length > 0 ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {items.map((item) => (
              <RecCard key={item.regionId} item={item} />
            ))}
          </div>
        ) : (
          <EmptyState personalization={personalization} hasMarketData={hasMarketData} />
        )}

        <p className="mt-1 text-[11px] leading-[1.6] text-text-3">
          추천은 관심지역 매칭·예산 적합도·최근 매매 변동·거래량을 종합한 룰 기반 결과이며,
          투자 판단의 참고 자료입니다. 실제 시세·수익과 다를 수 있어요.
        </p>
      </div>
    </PageShell>
  );
}
