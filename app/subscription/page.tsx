import { PageShell } from "@/app/components/PageShell";
import { PlanCheckoutButton, type CheckoutTier } from "./PlanCheckoutButton";

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

const PLANS: {
  name: string;
  nameTone: string;
  price: string;
  priceSuffix: string;
  dark: boolean;
  features: { ok: boolean; text: string }[];
  cta: string;
  ctaClass: string;
  badge: string | null;
  /** 결제 연결용 구 멤버십 플랜 코드 (membership plans): 플러스=pro, 프로(전문가)=expert */
  checkoutTier: CheckoutTier | null;
}[] = [
  {
    name: "무료",
    nameTone: "text-ink",
    price: "0원",
    priceSuffix: "",
    dark: false,
    features: [
      { ok: true, text: "임장노트 무제한 작성" },
      { ok: true, text: "지도 · 실거래가 조회" },
      { ok: true, text: "AI 요약 월 3회" },
      { ok: false, text: "단지 비교 리포트" },
    ],
    cta: "현재 이용 중",
    ctaClass: "bg-[#f2f4f8] text-text-1",
    badge: null,
    checkoutTier: null,
  },
  {
    name: "플러스",
    nameTone: "text-[#7ea2ff]",
    price: "2,900원",
    priceSuffix: "/월 · 연간 결제",
    dark: true,
    features: [
      { ok: true, text: "무료 기능 전부" },
      { ok: true, text: "AI 요약 · 비교 리포트 무제한" },
      { ok: true, text: "금리·시세 리스크 알림" },
      { ok: true, text: "노트 PDF 내보내기" },
    ],
    cta: "14일 무료 체험",
    ctaClass: "btn-primary btn-cta",
    badge: "가장 인기",
    checkoutTier: "pro",
  },
  {
    name: "프로 (전문가)",
    nameTone: "text-[#c07a3a]",
    price: "19,000원",
    priceSuffix: "/월",
    dark: false,
    features: [
      { ok: true, text: "플러스 기능 전부" },
      { ok: true, text: "리포트 발행 · 판매 (수수료 15%)" },
      { ok: true, text: "전문가 배지 · 상담 수신" },
      { ok: true, text: "지역 통계 대시보드" },
    ],
    cta: "전문가 인증 신청",
    ctaClass: "border-[1.5px] border-ink bg-surface text-ink",
    badge: null,
    checkoutTier: "expert",
  },
];

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

export default function SubscriptionPage() {
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
        <div className="mt-2 inline-flex gap-1 rounded-full border border-line bg-surface p-1 text-xs md:text-[13px]">
          <span className="rounded-full px-3 py-1.5 text-text-3 md:px-4">월간</span>
          <span className="rounded-full px-3 py-1.5 text-text-3 md:px-4">3개월 -10%</span>
          <span className="rounded-full px-3 py-1.5 text-text-3 md:px-4">6개월 -15%</span>
          <span className="rounded-full bg-ink px-3 py-1.5 font-bold text-white md:px-4">
            12개월 -20%
          </span>
        </div>
      </section>

      {/* 요금제 카드 3종 (6l) */}
      <section className="mx-auto mt-8 grid w-full max-w-[1080px] gap-5 md:grid-cols-3">
        {PLANS.map((p, i) => (
          <div
            key={p.name}
            className={`rise-in-${i + 1} relative flex flex-col gap-4 rounded-3xl p-7 ${
              p.dark
                ? "bg-[rgba(25,31,40,.96)] shadow-[0_24px_60px_rgba(16,28,54,.28)] md:-translate-y-2"
                : "card"
            }`}
          >
            {p.badge && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3.5 py-[5px] text-[11px] font-extrabold text-white shadow-[0_6px_16px_rgba(29,79,216,.4)]">
                {p.badge}
              </span>
            )}
            <div className={`text-[15px] font-extrabold ${p.nameTone}`}>{p.name}</div>
            <div className="flex items-baseline gap-1.5">
              <span className={`text-[32px] font-extrabold ${p.dark ? "text-white" : "text-ink"}`}>
                {p.price}
              </span>
              {p.priceSuffix && (
                <span className={`text-[13px] ${p.dark ? "text-ai-muted" : "text-text-3"}`}>
                  {p.priceSuffix}
                </span>
              )}
            </div>
            <div
              className={`flex flex-col gap-[9px] text-[13px] leading-[1.5] ${
                p.dark ? "text-ai-text" : "text-text-1"
              }`}
            >
              {p.features.map((f) => (
                <div key={f.text} className={`flex gap-2 ${f.ok ? "" : "text-[#adb5bd]"}`}>
                  <span className={f.ok ? `font-extrabold ${p.dark ? "text-[#7ea2ff]" : "text-primary"}` : ""}>
                    {f.ok ? "✓" : "—"}
                  </span>
                  {f.text}
                </div>
              ))}
            </div>
            <div className="flex-1" />
            {p.checkoutTier ? (
              <PlanCheckoutButton tier={p.checkoutTier} label={p.cta} className={p.ctaClass} />
            ) : (
              <button
                type="button"
                disabled
                className={`rounded-[14px] p-[13px] text-center text-sm font-bold ${p.ctaClass}`}
              >
                {p.cta}
              </button>
            )}
          </div>
        ))}
      </section>

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
                2,900원<span className="text-[11px] text-text-3">/월</span>
              </div>
            </div>
            <div className="text-center">
              <div className="text-sm font-extrabold text-[#c07a3a]">✦ 프로</div>
              <div className="text-lg font-extrabold text-ink">
                19,000원<span className="text-[11px] text-text-3">/월</span>
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
            <span className="text-center">월간</span>
            <span className="text-center">3개월 -10%</span>
            <span className="text-center">6개월 -15%</span>
            <span className="text-center">12개월 -20%</span>
          </div>
          <div className="grid grid-cols-[120px_repeat(4,1fr)] items-center gap-2 border-b border-[#f0f3f8] py-2.5 text-xs">
            <span className="font-extrabold text-primary">✦ 플러스</span>
            <span className="text-center font-bold text-text-1">2,900원</span>
            <span className="text-center font-bold text-text-1">2,610원</span>
            <span className="text-center font-bold text-text-1">2,465원</span>
            <span className="text-center font-extrabold text-primary">2,320원</span>
          </div>
          <div className="grid grid-cols-[120px_repeat(4,1fr)] items-center gap-2 py-2.5 text-xs">
            <span className="font-extrabold text-[#c07a3a]">✦ 프로</span>
            <span className="text-center font-bold text-text-1">19,000원</span>
            <span className="text-center font-bold text-text-1">17,100원</span>
            <span className="text-center font-bold text-text-1">16,150원</span>
            <span className="text-center font-extrabold text-[#c07a3a]">15,200원</span>
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
