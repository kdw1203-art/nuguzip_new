import Link from "next/link";
import {
  loadBillingHistory,
  PAYMENT_STATUS_LABEL,
  PAYMENT_PLAN_LABEL,
} from "@/lib/subscriptions/billing-history";

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

  return (
    <section className="rise-in-3 card mx-auto mt-8 w-full max-w-[1080px] rounded-[20px] px-[22px] py-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-extrabold text-ink">구독 관리 · 결제 내역</h2>
        <span className="text-[11px] text-text-3">
          현재 플랜 · {PAYMENT_PLAN_LABEL[currentPlan] ?? currentPlan}
        </span>
      </div>

      <div className="mt-3 overflow-x-auto">
        {!ok ? (
          /* 조회 실패를 "내역 없음"으로 보여 주면, 결제한 사람이 자기 기록이
             사라졌다고 오해한다. 두 상태는 반드시 구분한다. */
          <div className="rounded-xl bg-[rgba(242,201,76,.08)] px-4 py-5 text-[12px] text-text-2">
            결제 내역을 지금 불러오지 못했어요. 잠시 후 새로고침해 주세요 — 결제 기록이
            사라진 것은 아닙니다.
          </div>
        ) : payments.length === 0 ? (
          <div className="rounded-xl bg-[rgba(0,0,0,.02)] px-4 py-6 text-center text-[12px] text-text-3">
            아직 결제 내역이 없어요.
            <br />
            결제가 완료되면 금액·이용 기간·영수증 링크가 여기에 쌓입니다.
          </div>
        ) : (
          <div className="min-w-[620px]">
            <div className="grid grid-cols-[130px_100px_80px_90px_110px_1fr] gap-2 border-b border-[#f0f3f8] pb-2 text-[11px] text-text-3">
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
                className="grid grid-cols-[130px_100px_80px_90px_110px_1fr] items-center gap-2 border-b border-[#f0f3f8] py-2.5"
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

      {/* 해지·플랜 변경 — 셀프서비스 버튼이 없다는 사실을 감추지 않는다.
          "해지하기" 버튼을 두고 문의 폼으로 보내면 그건 버튼이 아니라 미끼다. */}
      <div className="mt-4 flex flex-col gap-1.5 rounded-xl bg-[rgba(29,79,216,.04)] px-4 py-3">
        <div className="text-[12px] font-extrabold text-ink">플랜 변경 · 해지 · 환불</div>
        <p className="text-[11px] leading-[1.7] text-text-2">
          현재 화면에서 바로 해지하는 버튼은 없습니다. 해지·환불 요청은{" "}
          <Link
            href="/support"
            className="font-bold text-primary underline underline-offset-2"
          >
            고객센터 1:1 문의
          </Link>
          의 <b>결제·환불</b> 카테고리로 접수해 주세요. 접수 내용은 담당자에게 바로
          전달되며, 처리 기준은{" "}
          <Link
            href="/legal/terms#refund"
            className="font-bold text-primary underline underline-offset-2"
          >
            약관 제8조(청약철회·환불)
          </Link>
          를 따릅니다.
        </p>
        <p className="text-[11px] leading-[1.7] text-text-3">
          상위 플랜으로 올리는 것은 위 요금제 카드에서 바로 결제하면 적용됩니다.
        </p>
      </div>
    </section>
  );
}
