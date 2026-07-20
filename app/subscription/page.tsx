import Link from "next/link";
import { PageShell } from "@/app/components/PageShell";
import { safeAuth } from "@/lib/safe-auth";
import { loadMeProfile } from "@/lib/me/profile";
import { BILLING_PERIOD_PRICES, periodPrice } from "@/lib/subscriptions/billing-periods";
import { PlanCards, type TierPricing } from "./PlanCards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* 가격 단일 출처: lib/subscriptions/billing-periods.ts (하드코딩 금지) */
const fmtWon = (n: number) => `${n.toLocaleString("ko-KR")}원`;

function tierPricing(tier: "pro" | "expert"): TierPricing {
  const m1 = periodPrice(tier, 1);
  const m12 = periodPrice(tier, 12);
  return {
    monthly: m1?.monthlyEquivalentKrw ?? 0,
    annualMonthly: m12?.monthlyEquivalentKrw ?? 0,
    annualTotal: m12?.totalKrw ?? 0,
    annualDiscountPct: m12?.discountPct ?? 0,
  };
}

const PLUS_MONTHLY = fmtWon(tierPricing("pro").monthly);
const PRO_MONTHLY = fmtWon(tierPricing("expert").monthly);

const FEATURE_ROWS: { label: string; free: string; plus: string; pro: string; proAccent?: boolean }[] = [
  { label: "임장노트 · 지도 · 실거래", free: "무제한", plus: "무제한", pro: "무제한" },
  { label: "AI 요약 · 비교 리포트 생성", free: "월 3회", plus: "무제한", pro: "무제한" },
  { label: "마켓 리포트 발행 (판매)", free: "—", plus: "월 3회 · 수수료 20%", pro: "무제한 · 수수료 15%", proAccent: true },
  { label: "유료 상담 수신 · 동행 임장", free: "—", plus: "—", pro: "포함 (전문가 인증 필수)", proAccent: true },
  { label: "다자 비교 단지 수", free: "2개 (1:1)", plus: "5개", pro: "5개 + PDF 내보내기" },
  { label: "시나리오 저장 개수", free: "1개", plus: "10개", pro: "무제한" },
  { label: "급매·시세 알림 지역", free: "1곳 · 일 1회 요약", plus: "3곳 · 실시간", pro: "10곳 · 실시간" },
  { label: "노트 사진 저장 용량", free: "노트당 10장", plus: "노트당 50장", pro: "무제한 + 원본 화질" },
  { label: "쪽지 발신 (수신은 무제한)", free: "일 5건", plus: "일 30건", pro: "무제한" },
  { label: "광고 노출", free: "표시", plus: "제거", pro: "제거" },
];

const PLAN_LABEL: Record<"free" | "pro" | "expert", string> = {
  free: "무료 플랜",
  pro: "플러스",
  expert: "프로 (전문가)",
};

function PlanBadge({ tier }: { tier: "plus" | "pro" }) {
  return (
    <span
      className={`rounded-full bg-ink px-2 py-0.5 text-[9px] font-extrabold ${
        tier === "plus" ? "text-[#7ea2ff]" : "text-[#f2c94c]"
      }`}
    >
      ✦ {tier === "plus" ? "플러스" : "프로"}
    </span>
  );
}

export default async function SubscriptionPage() {
  const session = await safeAuth();
  const email = session?.user?.email ?? null;
  let currentPlan: "free" | "pro" | "expert" = "free";
  if (email) {
    const profile = await loadMeProfile(email, {
      name: session?.user?.name,
      plan: (session?.user as { plan?: string } | undefined)?.plan,
      role: (session?.user as { role?: string } | undefined)?.role,
    });
    currentPlan = profile.plan;
  }

  return (
    <PageShell breadcrumb="멤버십 상세" wide>
      {/* 히어로 (6l) */}
      <section className="rise-in flex flex-col items-center gap-2 pt-4 text-center">
        <h1 className="text-[26px] font-extrabold tracking-[-0.5px] text-ink md:text-[30px]">
          기록은 무료, 판단은 더 깊게
        </h1>
        <p className="text-[15px] text-text-2">
          임장노트와 지도는 영원히 무료. AI 분석의 깊이를 선택하세요.
        </p>
        {email && (
          <span className="mt-1 rounded-full bg-primary-soft px-3 py-1 text-[12px] font-bold text-primary">
            현재 플랜 · {PLAN_LABEL[currentPlan]}
          </span>
        )}
      </section>

      {/* 요금제 카드 3종 + 월간/연간 토글 (item 13) */}
      <section className="mx-auto mt-8 w-full">
        <PlanCards
          currentPlan={currentPlan}
          pro={tierPricing("pro")}
          expert={tierPricing("expert")}
        />
      </section>

      {/* P2-8: 환불 규정 직링크 — 약관 제8조(청약철회) 앵커 */}
      <p className="rise-in-4 mx-auto mt-4 w-full max-w-[1080px] text-center text-xs text-text-3">
        결제 7일 이내 청약철회(환불) 가능 ·{" "}
        <Link
          href="/legal/terms#refund"
          className="font-bold text-primary underline underline-offset-2"
        >
          환불 규정 안내
        </Link>
      </p>

      {/* 기능 비교표 (9k) */}
      <section className="rise-in-4 card mx-auto mt-8 w-full max-w-[1080px] overflow-x-auto rounded-[20px] px-[22px] py-5">
        <div className="min-w-[640px]">
          <div className="grid grid-cols-[200px_repeat(3,1fr)] items-end gap-2 border-b border-[#f0f3f8] pb-3 pt-1.5">
            <span className="text-[11px] text-text-3">기능 비교</span>
            <div className="text-center">
              <div className="text-sm font-extrabold text-ink">무료</div>
              <div className="text-lg font-extrabold text-ink">0원</div>
            </div>
            <div className="rounded-[10px] bg-[rgba(29,79,216,.05)] py-1.5 text-center">
              <div className="text-sm font-extrabold text-primary">✦ 플러스</div>
              <div className="text-lg font-extrabold text-ink">
                {PLUS_MONTHLY}<span className="text-[11px] text-text-3">/월</span>
              </div>
            </div>
            <div className="text-center">
              <div className="text-sm font-extrabold text-[#c07a3a]">✦ 프로</div>
              <div className="text-lg font-extrabold text-ink">
                {PRO_MONTHLY}<span className="text-[11px] text-text-3">/월</span>
              </div>
            </div>
          </div>
          {FEATURE_ROWS.map((r) => (
            <div
              key={r.label}
              className="grid grid-cols-[200px_repeat(3,1fr)] items-center gap-2 border-b border-[#f0f3f8] py-2.5 text-xs"
            >
              <span className="text-text-2">{r.label}</span>
              <span className={`text-center ${r.free === "—" ? "text-[#adb5bd]" : "text-text-2"}`}>
                {r.free}
              </span>
              <span
                className={`bg-[rgba(29,79,216,.04)] py-1 text-center ${
                  r.plus === "—" ? "text-[#adb5bd]" : "font-bold text-primary"
                }`}
              >
                {r.plus}
              </span>
              <span
                className={`text-center font-bold ${
                  r.pro === "—" ? "font-normal text-[#adb5bd]" : r.proAccent ? "text-[#c07a3a]" : "text-primary"
                }`}
              >
                {r.pro}
              </span>
            </div>
          ))}
          <div className="grid grid-cols-[200px_repeat(3,1fr)] items-center gap-2 py-2.5 text-xs">
            <span className="text-text-2">프로필 인증배지</span>
            <span className="text-center text-[#adb5bd]">—</span>
            <span className="bg-[rgba(29,79,216,.04)] py-1 text-center">
              <PlanBadge tier="plus" />
            </span>
            <span className="text-center">
              <PlanBadge tier="pro" />
            </span>
          </div>
        </div>
      </section>

      {/* 기간별 할인 (9k) */}
      <section className="rise-in-5 card mx-auto mt-4 w-full max-w-[1080px] overflow-x-auto rounded-2xl px-5 py-4">
        <div className="min-w-[560px]">
          <div className="mb-1.5 flex items-baseline justify-between">
            <span className="text-sm font-extrabold text-ink">기간별 할인 (월 환산가)</span>
            <span className="text-[11px] text-text-3">
              일시불 결제 · 중도 해지 시 잔여기간 일할 환불
            </span>
          </div>
          <div className="grid grid-cols-[120px_repeat(4,1fr)] gap-2 border-b border-[#f0f3f8] py-[7px] text-[11px] text-text-3">
            <span />
            {BILLING_PERIOD_PRICES.pro.map((p) => (
              <span key={p.months} className="text-center">
                {p.months === 1 ? "월간" : `${p.months}개월`}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-[120px_repeat(4,1fr)] items-center gap-2 border-b border-[#f0f3f8] py-2.5 text-xs">
            <span className="font-extrabold text-primary">✦ 플러스</span>
            {BILLING_PERIOD_PRICES.pro.map((p) => (
              <span
                key={p.months}
                className={`text-center ${
                  p.months === 12 ? "font-extrabold text-primary" : "font-bold text-text-1"
                }`}
              >
                {fmtWon(p.monthlyEquivalentKrw)}
                {p.discountPct > 0 && (
                  <span className="ml-0.5 text-[10px] font-medium text-text-3">
                    -{Math.round(p.discountPct)}%
                  </span>
                )}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-[120px_repeat(4,1fr)] items-center gap-2 py-2.5 text-xs">
            <span className="font-extrabold text-[#c07a3a]">✦ 프로</span>
            {BILLING_PERIOD_PRICES.expert.map((p) => (
              <span
                key={p.months}
                className={`text-center ${
                  p.months === 12 ? "font-extrabold text-[#c07a3a]" : "font-bold text-text-1"
                }`}
              >
                {fmtWon(p.monthlyEquivalentKrw)}
                {p.discountPct > 0 && (
                  <span className="ml-0.5 text-[10px] font-medium text-text-3">
                    -{Math.round(p.discountPct)}%
                  </span>
                )}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* 배지 노출 예시 (9k) */}
      <section className="rise-in-6 mx-auto mt-4 grid w-full max-w-[1080px] gap-3.5 md:grid-cols-3">
        <div className="card flex flex-col gap-2 rounded-2xl px-[18px] py-4">
          <div className="text-xs font-extrabold text-text-3">배지 노출 — 커뮤니티 글</div>
          <div className="flex items-center gap-2">
            <div className="h-[30px] w-[30px] rounded-full bg-[repeating-linear-gradient(45deg,#e2e8f2,#e2e8f2_5px,#eef2f8_5px,#eef2f8_10px)]" />
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-[13px] font-extrabold text-ink">첫집준비중</span>
                <PlanBadge tier="plus" />
              </div>
              <div className="text-[11px] text-text-3">관양동 · 2시간 전</div>
            </div>
          </div>
          <div className="text-xs text-text-1">공작아파트 3번째 임장 다녀왔어요…</div>
        </div>
        <div className="card flex flex-col gap-2 rounded-2xl px-[18px] py-4">
          <div className="text-xs font-extrabold text-text-3">배지 노출 — 공개 노트</div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="text-[13px] font-extrabold text-ink">동편3 702동 노트</span>
              <PlanBadge tier="pro" />
            </div>
            <span className="text-xs font-extrabold text-primary">82점</span>
          </div>
          <div className="text-[11px] text-text-3">프로(전문가) 노트는 검색·피드에서 상단 정렬</div>
        </div>
        <div className="card flex flex-col gap-2 rounded-2xl px-[18px] py-4">
          <div className="text-xs font-extrabold text-text-3">배지 노출 — 홈 헤더</div>
          <div className="flex items-center gap-1.5">
            <div className="h-[30px] w-[30px] rounded-full bg-[repeating-linear-gradient(45deg,#e2e8f2,#e2e8f2_5px,#eef2f8_5px,#eef2f8_10px)]" />
            <PlanBadge tier="plus" />
          </div>
          <div className="text-[11px] text-text-3">프로필 아바타 옆 상시 표시 · 설정에서 숨김 가능</div>
        </div>
      </section>

      <p className="mx-auto mt-5 w-full max-w-[1080px] text-xs text-text-3">
        언제든 해지 가능 · 결제 7일 이내 전액 환불 · 부가세 포함 · 커뮤니티 글·공개 노트·채팅 등 모든
        닉네임 노출 지점에 동일 배지 적용
      </p>
    </PageShell>
  );
}
