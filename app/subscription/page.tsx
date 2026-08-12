import Link from "next/link";
import { PageShell } from "@/app/components/PageShell";
import { safeAuth } from "@/lib/safe-auth";
import { loadMeProfile } from "@/lib/me/profile";
import { BILLING_PERIOD_PRICES, periodPrice, WEEKLY_PASS } from "@/lib/subscriptions/billing-periods";
import { PlanCards, type TierPricing } from "./PlanCards";
import { PlanCheckoutButton } from "./PlanCheckoutButton";
import {
  getBusinessInfo,
  isBusinessDisclosureComplete,
} from "@/lib/brand/business-info";
import { getStripe } from "@/lib/billing/stripe";
import { isKakaoPayConfigured } from "@/lib/payments/kakaopay";
import { isTossPaymentsConfigured } from "@/lib/payments/toss-config";
import { BillingPanel } from "./BillingPanel";
import { SETTLEMENT } from "@/lib/creator/sales";
import { PLAN_FEATURE_MATRIX } from "@/lib/subscriptions/plans";
import { buildPageMetadata } from "@/lib/seo/page-metadata";
import { faqJsonLd, jsonLdScript, type FaqItem } from "@/lib/seo/jsonld";
import { ComplianceNotice } from "@/app/components/ComplianceNotice";

/* 고도화 32 — 구독 FAQ. 사실만 적는다: 결제 개통 여부와 무관하게 참인 문장으로
   쓰고(조건부 서술), 수치·규정은 약관·구현과 대조했다. 화면과 JSON-LD 가 같은
   배열을 쓴다. */
const SUBSCRIPTION_FAQ: FaqItem[] = [
  {
    q: "무료로 쓸 수 있는 기능은 무엇인가요?",
    a: "임장노트 작성·저장, 지도 비교, 실거래 조회는 계속 무료입니다. 유료 플랜은 AI 분석의 깊이와 월 사용 한도를 넓혀 줍니다.",
  },
  {
    q: "결제는 어떻게 하나요?",
    a: "월간 또는 연간 이용권 방식입니다. 결제가 아직 열려 있지 않은 기간에는 '오픈 알림 받기'로 등록해 두면 열리는 즉시 알림을 드립니다. 포인트 상점에서 포인트로 PRO 이용권을 교환할 수도 있습니다.",
  },
  {
    q: "이용권은 자동으로 갱신되나요?",
    a: "카카오페이·포인트 교환 이용권은 기간제라 자동으로 갱신·재청구되지 않으며, 만료 7일 전과 1일 전에 알림을 드립니다. 카드 정기결제는 해지 전까지 자동 갱신됩니다.",
  },
  {
    q: "해지·환불은 어떻게 하나요?",
    a: "결제 후 7일 이내에는 청약철회로 전액 환불됩니다(이용약관 제8조). 해지·환불 접수는 고객센터 1:1 문의로 받고 있습니다.",
  },
  {
    q: "플랜 배지는 어디에 표시되나요?",
    a: "커뮤니티 글·공개 노트·채팅 등 닉네임이 노출되는 모든 지점에 동일하게 표시되며, 설정에서 숨길 수 있습니다.",
  },
];

export const metadata = buildPageMetadata({
  title: "요금제",
  description:
    "무료·프로·전문가 플랜의 기능 차이와 월간/연간 가격을 비교합니다.",
  path: "/subscription",
});

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* 가격 단일 출처: lib/subscriptions/billing-periods.ts — 화면에 금액을 하드코딩하지 않는다 */
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
const FEE_PCT = `${Math.round(SETTLEMENT.platformFeeRate * 100)}%`;

/* 웹25 — 비교표는 PLAN_FEATURE_MATRIX(access.ts FEATURE_RULES 와 동일화된 단일
   출처)에서 유도한다. 예전에는 이 파일에 손으로 적은 표가 따로 있었고, 코드
   어디에도 집행 로직이 없는 한도를 광고하고 있었다 — "쪽지 일 5건/30건",
   "노트 사진 노트당 50장"(실제 코드는 전 플랜 10장), "알림 지역 3곳·실시간",
   "시나리오 저장 10개", "다자 비교 5개"(실제 비교 트레이 한도는 2/10/무제한),
   "플러스 AI 무제한"(실제 월 30~50회). 기능 없는 약속은 버그다 — 코드가 실제로
   집행하는 한도만 싣는다. 수수료도 SETTLEMENT.platformFeeRate 단일 출처다
   (예전 20%/15% 표기는 실제 7%와 달라 허위 고지였다). */
const FEATURE_ROWS: { label: string; free: string; plus: string; pro: string; proAccent?: boolean }[] = [
  { label: "임장노트 · 지도 · 실거래", free: "무제한", plus: "무제한", pro: "무제한" },
  ...PLAN_FEATURE_MATRIX.filter((r) => r.feature !== "리포트 판매").map((r) => ({
    label: r.feature,
    free: r.free === "불가" ? "—" : r.free,
    plus: r.pro === "불가" ? "—" : r.pro,
    pro: r.expert === "불가" ? "—" : r.expert,
  })),
  { label: "마켓 리포트 발행 (판매)", free: "—", plus: `가능 · 수수료 ${FEE_PCT}`, pro: `우선 노출 · 수수료 ${FEE_PCT}`, proAccent: true },
  { label: "유료 상담 수신 · 동행 임장", free: "—", plus: "—", pro: "포함 (전문가 인증 필수)", proAccent: true },
];

const PLAN_LABEL: Record<"free" | "pro" | "expert", string> = {
  free: "무료 플랜",
  pro: "플러스",
  expert: "프로 (전문가)",
};

function PlanBadge({ tier }: { tier: "plus" | "pro" }) {
  return (
    <span
      className={`rounded-full bg-ink chip-pad text-[9px] font-extrabold ${
        tier === "plus" ? "text-ai-accent" : "text-[#f2c94c]"
      }`}
    >
      ✦ {tier === "plus" ? "플러스" : "프로"}
    </span>
  );
}

export default async function SubscriptionPage({
  searchParams,
}: {
  searchParams?: Promise<{ plan?: string; billing?: string }>;
}) {
  // 결제 실패 페이지의 "다시 시도하기"가 plan/billing 쿼리를 들고 돌아온다 —
  // 고른 주기를 다시 고르게 하지 않도록 토글 초기값으로 반영한다.
  const sp = (await searchParams) ?? {};
  /* 항목 33 — 결제가 실제로 열릴 수 있는 상태인지 서버에서 판정한다.
     사업자 고지(주소·통신판매업 번호)가 비어 있으면 checkout 라우트들이 전부
     503 을 내고, PSP(Stripe·카카오페이) 키가 없어도 마찬가지다. 그 상태에서
     결제 버튼을 그리는 건 눌러야만 알 수 있는 거짓 입구다 — 대신 "결제 준비
     중 + 오픈 알림 받기"로 구매 의사를 기록한다. */
  /* 결제 개통 판정 — 토스 포함(빠져 있어서 키를 넣어도 '오픈 알림'만 떴다).
     - 라이브: 사업자 고지 완비(주소·통판번호·유선번호) + PSP 1개 이상.
     - 토스 **테스트 키**: 승인이 가상이라 실청구가 없고(환경 가이드), 상점
       심사역도 운영 도메인에서 테스트 결제를 끝까지 돌려 본다(confirm 라우트
       주석) — 고지 env 완비 전에도 연다. 라이브 키 전환 시 이 우회는 사라지고
       고지 완비가 다시 필수다. */
  const tossTestMode =
    isTossPaymentsConfigured() &&
    (process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY?.trim() ?? "").startsWith("test_ck_");
  const paymentsReady =
    (isBusinessDisclosureComplete(getBusinessInfo()) &&
      (getStripe() !== null || isKakaoPayConfigured() || isTossPaymentsConfigured())) ||
    tossTestMode;
  const initialBilling = sp.billing === "annual" ? ("annual" as const) : ("monthly" as const);
  const session = await safeAuth();
  const email = session?.user?.email ?? null;
  /* 관리자 배지 — 운영 계정은 플랜 대신 "관리자"로 표기한다. */
  const isAdminViewer = (session?.user as { role?: string } | undefined)?.role === "admin";
  let currentPlan: "free" | "pro" | "expert" = "free";
  if (email) {
    const profile = await loadMeProfile(email, {
      name: session?.user?.name,
      plan: (session?.user as { plan?: string } | undefined)?.plan,
      role: (session?.user as { role?: string } | undefined)?.role,
    });
    currentPlan = profile.plan;
  }

  /* 항목 46d — 요금제를 Product/Offer 로 기술. 가격은 billing-periods 단일
     출처에서만 오고, availability 는 결제 개통 여부 사실을 그대로 싣는다
     (미개통인데 InStock 이라 적으면 구조화 데이터가 거짓이 된다). */
  const availability = paymentsReady
    ? "https://schema.org/InStock"
    : "https://schema.org/PreOrder";
  const plansJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "누구집 멤버십 요금제",
    itemListElement: (["pro", "expert"] as const).map((tier, i) => {
      const p = tierPricing(tier);
      return {
        "@type": "ListItem",
        position: i + 1,
        item: {
          "@type": "Product",
          name: tier === "pro" ? "누구집 PRO 멤버십" : "누구집 EXPERT 멤버십",
          description:
            tier === "pro"
              ? "AI 임장노트 정리·분석 확장, 광고 제거 등 개인 이용자용 멤버십"
              : "전문가 등록·상담 기능을 포함한 전문가용 멤버십",
          offers: [
            {
              "@type": "Offer",
              price: p.monthly,
              priceCurrency: "KRW",
              availability,
              url: "https://nuguzip.com/subscription",
            },
            /* 주간권(단건) — 플러스 전용. 가격은 billing-periods 단일 출처. */
            ...(tier === WEEKLY_PASS.tier
              ? [
                  {
                    "@type": "Offer",
                    price: WEEKLY_PASS.totalKrw,
                    priceCurrency: "KRW",
                    availability,
                    url: "https://nuguzip.com/subscription?billing=weekly",
                  },
                ]
              : []),
            ...(p.annualTotal > 0
              ? [
                  {
                    "@type": "Offer",
                    price: p.annualTotal,
                    priceCurrency: "KRW",
                    availability,
                    url: "https://nuguzip.com/subscription?billing=annual",
                  },
                ]
              : []),
          ],
        },
      };
    }),
  };

  return (
    <PageShell breadcrumb="멤버십 상세" wide>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(plansJsonLd) }}
      />
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
            현재 플랜 · {isAdminViewer ? "관리자 (모든 기능 무제한)" : PLAN_LABEL[currentPlan]}
          </span>
        )}
      </section>

      {/* 요금제 카드 3종 + 월간/연간 토글 (item 13) */}
      <section className="mx-auto mt-8 w-full">
        <PlanCards
          currentPlan={currentPlan}
          pro={tierPricing("pro")}
          expert={tierPricing("expert")}
          initialBilling={initialBilling}
          paymentsReady={paymentsReady}
        />
      </section>

      {/* 플러스 주간권 — 1회성 단건 결제(자동갱신 없음). 운영자 확정 2026-08-12:
          토스 심사 회신 A-1(a) 의 단건 상품. 가격·기간은 WEEKLY_PASS 단일 출처. */}
      <section className="rise-in-4 mx-auto mt-5 w-full max-w-[1080px]">
        <div className="card flex flex-col items-center gap-4 rounded-3xl p-6 md:flex-row md:justify-between">
          <div className="flex flex-col gap-1 text-center md:text-left">
            <div className="text-[15px] font-extrabold text-ink">
              {WEEKLY_PASS.label} · {WEEKLY_PASS.totalKrw.toLocaleString("ko-KR")}원
            </div>
            <p className="text-[12px] leading-relaxed text-text-3">
              {WEEKLY_PASS.days}일 동안 플러스 기능 전체 이용 · 1회성 단건 결제(자동
              반복청구 없음) · 기간이 끝나면 자동으로 무료 플랜으로 돌아가며 추가
              청구가 없습니다
            </p>
          </div>
          {paymentsReady && (
            <div className="w-full shrink-0 md:w-[180px]">
              <PlanCheckoutButton
                tier="pro"
                billing="weekly"
                label="주간권 구매"
                className="w-full bg-ink text-white"
              />
            </div>
          )}
        </div>
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

      {/* E1 — 구독 관리·결제 내역. `/my` 가 "구독 페이지에서 관리해요"라고 보내던 목적지.
          로그인하지 않았으면 보여 줄 사실이 없으므로 아예 렌더하지 않는다. */}
      {email && <BillingPanel email={email} currentPlan={currentPlan} />}

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
              <div className="text-sm font-extrabold text-warning">✦ 프로</div>
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
              <span className={`text-center ${r.free === "—" ? "text-text-3" : "text-text-2"}`}>
                {r.free}
              </span>
              <span
                className={`bg-[rgba(29,79,216,.04)] py-1 text-center ${
                  r.plus === "—" ? "text-text-3" : "font-bold text-primary"
                }`}
              >
                {r.plus}
              </span>
              <span
                className={`text-center font-bold ${
                  r.pro === "—" ? "font-normal text-text-3" : r.proAccent ? "text-warning" : "text-primary"
                }`}
              >
                {r.pro}
              </span>
            </div>
          ))}
          <div className="grid grid-cols-[200px_repeat(3,1fr)] items-center gap-2 py-2.5 text-xs">
            <span className="text-text-2">프로필 인증배지</span>
            <span className="text-center text-text-3">—</span>
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
              일시불 결제 · 중도 해지 시 잔여기간 일할 환불(고객센터 접수)
            </span>
          </div>
          <div className="grid grid-cols-[120px_repeat(2,1fr)] gap-2 border-b border-[#f0f3f8] py-[7px] text-[11px] text-text-3">
            <span />
            {BILLING_PERIOD_PRICES.pro.map((p) => (
              <span key={p.months} className="text-center">
                {p.months === 1 ? "월간" : `${p.months}개월`}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-[120px_repeat(2,1fr)] items-center gap-2 border-b border-[#f0f3f8] py-2.5 text-xs">
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
          <div className="grid grid-cols-[120px_repeat(2,1fr)] items-center gap-2 py-2.5 text-xs">
            <span className="font-extrabold text-warning">✦ 프로</span>
            {BILLING_PERIOD_PRICES.expert.map((p) => (
              <span
                key={p.months}
                className={`text-center ${
                  p.months === 12 ? "font-extrabold text-warning" : "font-bold text-text-1"
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

      {/* 배지 노출 예시 (9k) — 카드 안의 닉네임·지역·점수는 배지 위치를 보여 주려고
          꾸민 그림이다. 라벨에 "예시"가 없어서 실제 이웃의 글·노트로 읽힐 수 있었다.
          제목마다 예시임을 적는다(내용 자체는 그대로 두되, 사실 주장이 되지 않게). */}
      <section className="rise-in-6 mx-auto mt-4 grid w-full max-w-[1080px] gap-3.5 md:grid-cols-3">
        <div className="card flex flex-col gap-2 rounded-2xl px-[18px] py-4">
          <div className="text-xs font-extrabold text-text-3">배지 노출 예시 — 커뮤니티 글</div>
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
          <div className="text-xs font-extrabold text-text-3">배지 노출 예시 — 공개 노트</div>
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
          <div className="text-xs font-extrabold text-text-3">배지 노출 예시 — 홈 헤더</div>
          <div className="flex items-center gap-1.5">
            <div className="h-[30px] w-[30px] rounded-full bg-[repeating-linear-gradient(45deg,#e2e8f2,#e2e8f2_5px,#eef2f8_5px,#eef2f8_10px)]" />
            <PlanBadge tier="plus" />
          </div>
          <div className="text-[11px] text-text-3">프로필 아바타 옆 상시 표시 · 설정에서 숨김 가능</div>
        </div>
      </section>

      {/* 고도화 32 — 구독 FAQ. 결제 수단·환불·해지가 화면 곳곳에 흩어져 있던
          것을 한 자리에 모은다. 아래 JSON-LD 는 이 배열 그대로에서 생성한다
          (화면에 없는 질문을 스키마에만 넣지 않는다 — faqJsonLd 규칙). */}
      <section className="rise-in-4 card mx-auto mt-8 w-full max-w-[1080px] rounded-[20px] px-[22px] py-5">
        <h2 className="text-[15px] font-extrabold text-ink">자주 묻는 질문</h2>
        <div className="mt-3 flex flex-col gap-3">
          {SUBSCRIPTION_FAQ.map((f) => (
            <div key={f.q} className="border-l-2 border-line pl-3">
              <div className="text-[13px] font-bold text-text-1">{f.q}</div>
              <p className="mt-0.5 text-[12px] leading-[1.7] text-text-3">{f.a}</p>
            </div>
          ))}
        </div>
      </section>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(faqJsonLd(SUBSCRIPTION_FAQ)) }}
      />

      <p className="mx-auto mt-5 w-full max-w-[1080px] text-xs text-text-3">
        {/* "언제든 해지 가능"만 적어 두면 화면 어딘가에 해지 버튼이 있다는 뜻으로 읽힌다.
            셀프서비스 해지는 아직 없으므로 실제 접수 경로를 함께 적는다(E1). */}
      <div className="mx-auto mt-4 w-full max-w-[1080px]">
        {/* 수익 문구 미기재 방침 + 서비스 제공기간(무형재화 판매정책 필수 표기) */}
        <ComplianceNotice variant="payment" />
      </div>

        해지·환불은 고객센터 1:1 문의로 접수 · 결제 7일 이내 전액 환불 · 부가세 포함 · 커뮤니티
        글·공개 노트·채팅 등 모든 닉네임 노출 지점에 동일 배지 적용
      </p>
    </PageShell>
  );
}
