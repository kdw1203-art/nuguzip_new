import Link from "next/link";
import {
  loadBillingHistory,
  PAYMENT_STATUS_LABEL,
  PAYMENT_PLAN_LABEL,
} from "@/lib/subscriptions/billing-history";
import { CancelRequestButton } from "./CancelRequestButton";
import { BillingAutopayCard } from "./BillingAutopayCard";
import { isTossBillingEnabled } from "@/lib/payments/toss-billing";
import { getLiveSubscriptionByEmail, toPublic } from "@/lib/payments/billing-store";

/**
 * 구독 관리 · 결제 내역 (E1)
 *
 * 이 패널을 만든 이유는 기능이 모자라서가 아니라 **약속이 어긋나 있었기** 때문이다.
 * `/my` 는 유료 사용자에게 "결제일·플랜 변경·해지는 구독 페이지에서 관리해요"라고
 * 적어 두고 `/subscription` 으로 보냈는데, 그 페이지에는 요금제 카드와 비교표뿐이라
 * 결제일도, 플랜 변경도, 해지도 없었다. 보내 놓고 없는 것을 찾게 만드는 화면이었다.
 *
 * 그래서 없는 기능을 지어내지 않고, **있는 사실만** 이 자리에 모은다.
 *  1) 현재 플랜 — `profiles.plan` 이 단일 출처.
 *  2) 결제 내역 — `public.payments`. 현재 0행이므로 빈 상태 문구가 기본 화면이다.
 *  3) 해지·환불 경로 — 자동 해지 버튼은 없다. 있는 척하지 않고 실제로 동작하는
 *     경로(고객센터 1:1 문의 · "결제·환불" 카테고리)로 연결한다.
 *
 * **갱신일(만료일)을 표시하지 않는 이유**: 저장되는 곳이 없다.
 * `lib/billing/apply-plan-from-stripe.ts` 의 `applyPlanToUserByEmail()` 은
 * `profiles.plan` 만 갱신하고 만료 시각을 쓰지 않으며, `membership_expires_at`
 * 류의 컬럼은 레포 전체에 0건이다. 근거 없는 날짜를 "다음 결제일"이라고 적으면
 * 그건 화면이 아니라 허위 고지가 된다. 결제 시 선택한 기간은 아래 내역의
 * `billing` 값으로만 사실대로 보여 준다.
 */

const cell = "text-[12px] text-text-2";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  return new Date(t).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtWon(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return "—";
  return `${n.toLocaleString("ko-KR")}원`;
}

function fmtBilling(billing: string | null): string {
  if (!billing) return "—";
  const n = Number(billing);
  if (Number.isFinite(n) && n > 0) return n === 1 ? "월간" : `${n}개월`;
  if (billing === "weekly") return "주간권(7일)";
  if (billing === "monthly") return "월간";
  if (billing === "annual" || billing === "yearly") return "연간";
  return billing;
}

export async function BillingPanel({
  email,
  currentPlan,
}: {
  email: string;
  currentPlan: "free" | "pro" | "expert";
}) {
  const { ok, payments } = await loadBillingHistory(email, 10);

  /* 자동결제(토스 빌링) 구독 — 있으면 상태·다음 결제일·해지 버튼을 보여 준다.
     next_charge_at 은 billing_subscriptions 에 실제로 저장되는 값이라 "근거 없는
     날짜" 문제가 없다(단건 결제의 갱신일 미표시 원칙은 그대로 — 아래 안내 참고).
     빌링 미개방(전자계약 전) 상태에서는 조회 자체가 빈손이라 아무것도 안 그린다. */
  const liveAutopay = await getLiveSubscriptionByEmail(email.trim().toLowerCase()).catch(
    () => null,
  );
  const autopay = liveAutopay ? toPublic(liveAutopay) : null;
  const billingOpen = isTossBillingEnabled();

  return (
    <section className="rise-in-3 card mx-auto mt-8 w-full max-w-[1080px] rounded-[20px] px-[22px] py-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="t-section text-ink">구독 관리 · 결제 내역</h2>
        <span className="t-sub text-text-3">
          현재 플랜 · {PAYMENT_PLAN_LABEL[currentPlan] ?? currentPlan}
        </span>
      </div>

      <div className="mt-3 overflow-x-auto">
        {!ok ? (
          /* 조회 실패를 "내역 없음"으로 보여 주면, 결제한 사람이 자기 기록이
             사라졌다고 오해한다. 두 상태는 반드시 구분한다. */
          <div className="rounded-xl bg-[rgba(242,201,76,.08)] px-4 py-5 t-sub text-text-2">
            결제 내역을 지금 불러오지 못했어요. 잠시 후 새로고침해 주세요 — 결제 기록이
            사라진 것은 아닙니다.
          </div>
        ) : payments.length === 0 ? (
          <div className="rounded-xl bg-[rgba(0,0,0,.02)] px-4 py-6 text-center t-sub text-text-3">
            아직 결제 내역이 없어요.
            <br />
            결제가 완료되면 금액·이용 기간·영수증 링크가 여기에 쌓입니다.
          </div>
        ) : (
          <div className="min-w-[620px]">
            <div className="grid grid-cols-[130px_100px_80px_90px_110px_1fr] gap-2 border-b border-divider pb-2 t-sub text-text-3">
              <span>결제 요청일</span>
              <span>플랜</span>
              <span>기간</span>
              <span>금액</span>
              <span>상태</span>
              <span>영수증</span>
            </div>
            {payments.map((p) => (
              <div
                key={p.id}
                className="grid grid-cols-[130px_100px_80px_90px_110px_1fr] items-center gap-2 border-b border-divider py-2.5"
              >
                <span className={cell}>{fmtDate(p.requestedAt)}</span>
                <span className={cell}>
                  {p.plan ? (PAYMENT_PLAN_LABEL[p.plan] ?? p.plan) : "—"}
                </span>
                <span className={cell}>{fmtBilling(p.billing)}</span>
                <span className={`${cell} font-bold text-ink`}>{fmtWon(p.amount)}</span>
                <span className={cell}>
                  {p.status ? (PAYMENT_STATUS_LABEL[p.status] ?? p.status) : "—"}
                </span>
                <span className={cell}>
                  {p.receiptUrl ? (
                    <a
                      href={p.receiptUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-bold text-primary underline underline-offset-2"
                    >
                      영수증 보기
                    </a>
                  ) : (
                    <span className="text-text-3">—</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 자동결제 이용 중이면 상태 카드(다음 결제일·해지)를 먼저 보여 준다 */}
      {autopay && (
        <div className="mt-4">
          <BillingAutopayCard
            plan={autopay.plan}
            billing={autopay.billing}
            amount={autopay.amount}
            status={autopay.status}
            cardCompany={autopay.cardCompany}
            cardNumberMasked={autopay.cardNumberMasked}
            nextChargeAt={autopay.nextChargeAt}
          />
        </div>
      )}

      {/* 해지 요청 — 단건 결제는 자동 갱신이 없어 "다음 결제 예정일" 자체가 없다.
          자동결제 이용자는 위 카드에 실제 저장값(next_charge_at)이 표시된다. */}
      <div className="mt-4 flex flex-col gap-2 rounded-xl bg-[rgba(29,79,216,.04)] px-4 py-3">
        <div className="t-sub font-extrabold text-ink">플랜 변경 · 해지 · 환불</div>
        <p className="t-sub text-text-2">
          유료 플랜 해지는 아래 <b>해지 요청하기</b>로 접수하거나{" "}
          <Link
            href="/support?category=payment"
            className="font-bold text-primary underline underline-offset-2"
          >
            고객센터
          </Link>
          로 남겨 주세요. 접수 후 <b>영업일 1일 이내</b> 확인 안내. 처리 기준은{" "}
          <Link
            href="/legal/terms#refund"
            className="font-bold text-primary underline underline-offset-2"
          >
            약관 제8조
          </Link>
          .{" "}
          <b>
            단건 결제는 자동 반복청구가 없어 다음 결제 예정일이 없습니다
            {autopay ? " — 자동결제는 위 카드에 다음 결제일이 표시됩니다" : ""}.
          </b>
        </p>
        {billingOpen && !autopay && currentPlan !== "free" && (
          <p className="t-sub text-text-2">
            매번 결제하기 번거롭다면{" "}
            <Link
              href={`/subscription/billing?tier=${currentPlan}&billing=monthly`}
              className="font-bold text-primary underline underline-offset-2"
            >
              자동결제 등록
            </Link>
            으로 전환할 수 있어요.
          </p>
        )}
        {currentPlan !== "free" && <CancelRequestButton currentPlan={currentPlan} />}
        <p className="t-sub text-text-3">
          상위 플랜으로 올리는 것은 위 요금제 카드에서 바로 결제하면 적용됩니다.
        </p>
      </div>
    </section>
  );
}
