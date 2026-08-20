import type { Metadata } from "next";
import Link from "next/link";
import { listPayments, type PaymentRecord } from "@/lib/payments/store";
import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/log";
import { CancelPaymentButton } from "./CancelPaymentButton";
import { NotifyPreorderButton } from "./NotifyPreorderButton";

export const metadata: Metadata = {
  title: "결제 연동 | 누구집 관리자",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/* ============================================================
   관리자 · 토스페이먼츠 결제 연동 현황 + 테스트 체크리스트.

   층위가 다른 세 가지를 한 화면에 정직하게 모은다:
   1) 연동 상태 — 이 배포에 실제로 꽂혀 있는 키의 환경(test/live/미설정)
   2) 최근 결제 기록 — payments 테이블 실데이터(조회 실패는 실패라고 표기)
   3) 사람 절차 — 웹훅 등록·위젯 어드민·테스트 시나리오 등 코드 밖의 일

   상점 정보(공개 가능 범위): 상호 우리동네이야기 · MID nuguzibowg.
   시크릿 값은 어떤 것도 이 화면에 찍지 않는다 — 키는 환경(prefix)만 판정한다.
   ============================================================ */

type KeyEnv = "test" | "live" | "missing" | "invalid";

function keyEnv(v: string | undefined, prefixTest: string, prefixLive: string): KeyEnv {
  const k = v?.trim();
  if (!k) return "missing";
  if (k.startsWith(prefixTest)) return "test";
  if (k.startsWith(prefixLive)) return "live";
  return "invalid";
}

const ENV_LABEL: Record<KeyEnv, { text: string; cls: string }> = {
  test: { text: "테스트", cls: "bg-[rgba(245,158,11,.14)] text-[#b45309]" },
  live: { text: "라이브", cls: "bg-success-soft text-success" },
  missing: { text: "미설정", cls: "bg-[rgba(127,140,158,.14)] text-text-3" },
  invalid: { text: "형식 오류", cls: "bg-danger-soft text-danger" },
};

const STATUS_LABEL: Record<PaymentRecord["status"], { text: string; cls: string }> = {
  requested: { text: "요청됨", cls: "text-text-3" },
  paid: { text: "결제완료", cls: "text-success" },
  failed: { text: "실패", cls: "text-danger" },
  cancelled: { text: "취소", cls: "text-text-3" },
  refunded: { text: "환불", cls: "text-[#b45309]" },
};

function fmtWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  const d = new Date(t);
  return `${d.getMonth() + 1}.${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** 이메일 마스킹 — 어드민이라도 목록 화면에 전체 주소를 깔 필요는 없다 */
function maskEmail(email: string | null): string {
  if (!email) return "—";
  const [id, domain] = email.split("@");
  if (!domain) return "***";
  return `${id.slice(0, 2)}***@${domain}`;
}

export default async function AdminPaymentsPage() {
  const clientEnv = keyEnv(process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY, "test_ck_", "live_ck_");
  const secretEnv = keyEnv(process.env.TOSS_SECRET_KEY, "test_sk_", "live_sk_");
  const paired =
    clientEnv !== "missing" && secretEnv !== "missing" && clientEnv === secretEnv;

  let payments: PaymentRecord[] = [];
  let paymentsFailed = false;
  try {
    payments = (await listPayments(null)).slice(0, 20);
  } catch (e) {
    paymentsFailed = true;
    logger.error("[admin/payments] 결제 기록 조회 실패:", e);
  }

  /* 웹26 — 사전등록 → 결제 전환. 사전등록(plan_preorder_interest) 이메일 중
     paid 결제 이메일과 겹치는 수를 센다. 조회 실패는 실패라고 표기(0 위장 금지). */
  let preorderStats: {
    registered: number;
    uniqueEmails: number;
    anonymous: number;
    converted: number;
  } | null = null;
  let preorderFailed = false;
  try {
    const sb = getServiceSupabase();
    if (sb) {
      const [interestR, paidR] = await Promise.all([
        sb
          .from("platform_activity_events")
          .select("user_email")
          .eq("event_name", "plan_preorder_interest")
          .limit(5000),
        sb.from("payments").select("user_email").eq("status", "paid").limit(5000),
      ]);
      if (interestR.error || paidR.error) {
        preorderFailed = true;
      } else {
        const rows = interestR.data ?? [];
        const emails = new Set(
          rows
            .map((r) => (r.user_email ?? "").trim().toLowerCase())
            .filter((v) => v.includes("@")),
        );
        const paidEmails = new Set(
          (paidR.data ?? [])
            .map((r) => (r.user_email ?? "").trim().toLowerCase())
            .filter(Boolean),
        );
        preorderStats = {
          registered: rows.length,
          uniqueEmails: emails.size,
          anonymous: rows.filter((r) => !r.user_email).length,
          converted: [...emails].filter((e) => paidEmails.has(e)).length,
        };
      }
    }
  } catch (e) {
    preorderFailed = true;
    logger.error("[admin/payments] 사전등록 전환 조회 실패:", e);
  }

  const rows: { label: string; env: KeyEnv; note: string }[] = [
    {
      label: "클라이언트 키 (NEXT_PUBLIC_TOSS_CLIENT_KEY)",
      env: clientEnv,
      note: "위젯·결제창 SDK 초기화 — 브라우저 노출 가능(공개 키)",
    },
    {
      label: "시크릿 키 (TOSS_SECRET_KEY)",
      env: secretEnv,
      note: "승인·조회·웹훅 재검증 — 서버 전용, 절대 클라이언트 금지",
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[20px] font-extrabold text-ink">결제 연동 (토스페이먼츠)</h1>
        <p className="mt-1 text-[13px] text-text-2">
          상호 우리동네이야기 · MID <b className="text-ink">nuguzibowg</b> · 전자결제
          심사 접수일 2026-08-03. 심사 결과는 이 시스템이 감지할 수 없다 — 승인
          통보를 받으면 아래 체크리스트의 &ldquo;라이브 전환&rdquo;을 진행할 것.
        </p>
      </div>

      {/* 1) 키 상태 */}
      <section className="card rounded-2xl p-5">
        <h2 className="text-[15px] font-extrabold text-ink">키 상태 (이 배포 기준)</h2>
        <div className="mt-3 flex flex-col gap-2">
          {rows.map((r) => (
            <div key={r.label} className="flex items-center justify-between gap-3 text-[13px]">
              <div className="min-w-0">
                <div className="font-bold text-text-1">{r.label}</div>
                <div className="text-[11px] text-text-3">{r.note}</div>
              </div>
              <span
                className={`shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-extrabold ${ENV_LABEL[r.env].cls}`}
              >
                {ENV_LABEL[r.env].text}
              </span>
            </div>
          ))}
        </div>
        {!paired && clientEnv !== "missing" && secretEnv !== "missing" && (
          <p className="mt-3 rounded-xl bg-danger-soft px-3.5 py-2.5 text-[12px] font-bold text-danger">
            클라이언트/시크릿 키의 환경(test/live)이 서로 다릅니다 — 결제창은 떠도
            승인이 전부 실패합니다. 같은 환경의 키 짝으로 맞춰 주세요.
          </p>
        )}
        {clientEnv === "missing" && (
          <p className="mt-3 text-[12px] text-text-3">
            Vercel → Settings → Environment Variables 에 두 키를 추가한 뒤
            재배포하면 구독 결제 버튼이 토스 결제위젯으로 연결됩니다.
          </p>
        )}
      </section>

      {/* 2) 사람 절차 체크리스트 */}
      <section className="card rounded-2xl p-5">
        <h2 className="text-[15px] font-extrabold text-ink">
          연동 체크리스트{" "}
          <span className="text-[11px] font-medium text-text-3">
            코드 밖에서 해야 하는 일 — 완료 여부는 이 시스템이 감지할 수 없어
            체크박스를 그리지 않는다
          </span>
        </h2>
        <ol className="mt-3 list-decimal space-y-2.5 pl-5 text-[13px] leading-[1.7] text-text-2">
          <li>
            <b className="text-ink">테스트 키 발급·설정</b> —{" "}
            <a
              href="https://developers.tosspayments.com"
              className="font-bold text-primary underline"
              target="_blank"
              rel="noreferrer"
            >
              개발자센터
            </a>{" "}
            API 키에서 test_ck_/test_sk_ 쌍 확인 → Vercel 환경변수 설정(키 값은
            채팅·문서에 남기지 말 것).
          </li>
          <li>
            <b className="text-ink">웹훅 등록</b> — 개발자센터 → 웹훅 → URL{" "}
            <code className="rounded bg-[#f2f4f8] px-1.5 py-0.5 text-[12px]">
              https://nuguzip.com/api/payments/toss/webhook
            </code>{" "}
            · 이벤트 <b>PAYMENT_STATUS_CHANGED</b> 구독. 수신부는 페이로드를 믿지
            않고 결제 조회 API 로 재검증한 뒤 반영한다(멱등).
          </li>
          <li>
            <b className="text-ink">테스트 결제 시나리오</b> — /subscription →
            플랜 선택 → 결제위젯에서 카드/토스페이로 진행(테스트 키는 실청구
            없음) → /payment/success 확인 → 이 화면 아래 기록에 결제완료가
            남는지 → 마이페이지 플랜 반영 확인. 카카오페이는 테스트 환경
            미지원(라이브 전환 후 확인).
          </li>
          <li>
            <b className="text-ink">위젯 어드민(계약 승인 후)</b> —{" "}
            <a
              href="https://dashboard.tosspayments.com/payment-widget-service/"
              className="font-bold text-primary underline"
              target="_blank"
              rel="noreferrer"
            >
              상점관리자 결제위젯
            </a>
            에서 결제수단·UI·약관을 코드 수정 없이 관리. 별도 UI 를 만들면
            variantKey 를 체크아웃 코드에 지정.
          </li>
          <li>
            <b className="text-ink">라이브 전환</b> — 심사 승인 후 두 키를{" "}
            <b>같이</b> live_ 쌍으로 교체. 운영에 test 키가 남으면 confirm
            가드가 결제를 중단한다(청구 없는 가짜 성공 방지). 자동결제(빌링)는
            배선 완료(카드 등록·빌링키 발급·갱신 크론·해지·BILLING_DELETED 웹훅,
            2026-08-14) — 전자계약 승인 후 Vercel 에{" "}
            <code>NEXT_PUBLIC_TOSS_BILLING_ENABLED=1</code> 을 넣으면 열린다.
            그 전까지 등록 화면·API 는 &ldquo;준비 중&rdquo;을 사실대로 응답
            (docs/toss-integration-audit.md E절).
          </li>
          <li>
            <b className="text-ink">세금 파라미터</b> — 구독은 과세 상품이라
            taxFreeAmount 전달이 필요 없다(과세 상점 기준 vat 자동 계산). 면세
            상품을 팔게 되면 결제·취소·현금영수증 요청에 taxFreeAmount 를 함께
            보내야 한다.
          </li>
        </ol>
      </section>

      {/* 웹3 — 사전등록 오픈 알림. "결제가 열리면 알려드릴게요" 약속(PreOrderCta)의
          이행 수단. 자동이 아니라 버튼인 이유: 지금 열린 건 테스트 결제라,
          "열렸다"고 선언할 시점(라이브 전환)은 운영자가 안다. 멱등 — 발송된
          사람은 다시 보내지 않는다. */}
      <section className="card rounded-2xl p-5">
        <h2 className="text-[15px] font-extrabold text-ink">사전등록 오픈 알림</h2>
        <p className="mt-1.5 text-[12px] leading-[1.7] text-text-2">
          결제 미개통 기간에 &ldquo;오픈 알림 받기&rdquo;로 등록한 사용자에게 받은편지함
          알림을 1회 발송합니다. <b className="text-ink">라이브 키 전환 후</b> 누르는 것을
          권장합니다 — 테스트 결제 상태에서 보내면 실결제가 없는 화면으로 안내하게 됩니다.
        </p>
        {/* 웹26 — 등록·전환 실측. 전환 = 등록 이메일 ∩ paid 결제 이메일. */}
        {preorderFailed ? (
          <p className="mt-3 text-[12px] text-text-3">
            사전등록·전환 수를 지금 불러오지 못했어요 — 0이 아니라 조회 실패입니다.
          </p>
        ) : preorderStats ? (
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-text-2">
            <span>
              등록 <b className="text-ink">{preorderStats.registered}</b>건
            </span>
            <span>
              이메일 확인 <b className="text-ink">{preorderStats.uniqueEmails}</b>명
              {preorderStats.anonymous > 0 && ` (비로그인 ${preorderStats.anonymous}건 제외)`}
            </span>
            <span>
              결제 전환 <b className="text-ink">{preorderStats.converted}</b>명
              {preorderStats.uniqueEmails > 0 &&
                ` (${((preorderStats.converted / preorderStats.uniqueEmails) * 100).toFixed(0)}%)`}
            </span>
          </div>
        ) : null}
        <div className="mt-3">
          <NotifyPreorderButton />
        </div>
      </section>

      {/* 3) 최근 결제 기록 — 실데이터 */}
      <section className="card rounded-2xl p-5">
        <h2 className="text-[15px] font-extrabold text-ink">
          최근 결제 기록{" "}
          <span className="text-[11px] font-medium text-text-3">최근 20건 · 전 제공사</span>
        </h2>
        {paymentsFailed ? (
          <p className="mt-3 text-[13px] text-text-3">
            결제 기록을 지금 불러오지 못했어요 — 기록이 없는 게 아니라 조회가
            실패했습니다. 새로고침해 주세요.
          </p>
        ) : payments.length === 0 ? (
          <p className="mt-3 text-[13px] text-text-3">
            아직 결제 기록이 없어요. 테스트 결제를 진행하면 여기에 남습니다.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-[12px]">
              <thead>
                <tr className="border-b border-line text-[11px] text-text-3">
                  <th className="py-2 pr-3 font-semibold">시각</th>
                  <th className="py-2 pr-3 font-semibold">주문번호</th>
                  <th className="py-2 pr-3 font-semibold">사용자</th>
                  <th className="py-2 pr-3 font-semibold">플랜</th>
                  <th className="py-2 pr-3 text-right font-semibold">금액</th>
                  <th className="py-2 pr-3 font-semibold">상태</th>
                  <th className="py-2 text-right font-semibold">처리</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="border-b border-line last:border-0">
                    <td className="py-2 pr-3 text-text-3">{fmtWhen(p.paidAt ?? p.requestedAt)}</td>
                    <td className="max-w-[180px] truncate py-2 pr-3 font-mono text-[11px] text-text-2">
                      {p.orderId}
                    </td>
                    <td className="py-2 pr-3 text-text-2">{maskEmail(p.userEmail)}</td>
                    <td className="py-2 pr-3 font-bold text-ink">
                      {p.plan}
                      <span className="ml-1 text-[10px] font-medium text-text-3">
                        {p.billing === "annual" ? "연간" : "월간"}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-right t-num text-ink">
                      {p.amount.toLocaleString("ko-KR")}원
                    </td>
                    <td className={`py-2 pr-3 font-extrabold ${STATUS_LABEL[p.status].cls}`}>
                      {STATUS_LABEL[p.status].text}
                    </td>
                    <td className="py-2 text-right">
                      {/* 청약철회(7일) 처리 — paid + 토스 결제키 실재 건만 */}
                      {p.status === "paid" &&
                      p.providerPaymentKey &&
                      p.providerPaymentKey !== "MOCK-PAYMENT-KEY" ? (
                        <CancelPaymentButton
                          orderId={p.orderId}
                          amount={p.amount}
                          billing={p.billing}
                          paidAt={p.paidAt ?? p.requestedAt}
                        />
                      ) : (
                        <span className="text-[11px] text-text-3">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-[11px] text-text-3">
          수익 합계·MRR 은{" "}
          <Link href="/admin/revenue" className="font-bold text-primary underline">
            수익 대시보드
          </Link>
          에서 · 결제 원장은 토스{" "}
          <a
            href="https://app.tosspayments.com"
            className="font-bold text-primary underline"
            target="_blank"
            rel="noreferrer"
          >
            상점관리자
          </a>
          가 최종 기준이다.
        </p>
      </section>
    </div>
  );
}
