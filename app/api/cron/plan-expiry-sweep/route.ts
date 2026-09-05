import { NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron/authorize";
import { getServiceSupabase } from "@/lib/supabase/service";
import { appendInboxNotification } from "@/lib/notifications/inbox";
import { listLiveBillingEmails } from "@/lib/payments/billing-store";
import { ingestErrorMessage, logIngest } from "@/lib/market/store";
import { logger } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 구독 만료 스윕 — 일회성 결제(카카오페이·토스·포인트 교환)로 부여된 유료 플랜을
 * `plan_expires_at` 이 지나면 무료 플랜으로 강등한다. 하루 1회(etl.yml alerts 잡).
 *
 * - 대상: 유료 플랜(free/basic 제외) AND plan_expires_at < now()
 * - Stripe 구독은 applyPlanToUserByEmail 이 만료를 null 로 저장하므로 애초에
 *   스윕 대상이 아니다 (해지·미납 강등은 웹훅 담당).
 * - 강등 값은 'free' — 이 코드베이스가 app_users.plan 에 쓰는 무료 플랜 값이다
 *   (가입·웹훅 강등 모두 'free' 를 쓴다. 'basic' 은 표시용 tier 별칭으로,
 *   조회 측 normalize 가 둘 다 무료로 취급하지만 쓰기는 'free' 로 통일한다).
 * - 실행 기록은 다른 크론과 같은 ingest-log(market_ingest_log)에 남긴다.
 *
 * 보호: lib/cron/authorize.ts (CRON_SECRET 헤더 · 관리자 세션)
 * (attendance-reminders 와 같은 규칙).
 */

/**
 * 만료 사전 알림 (항목 31). 카카오페이·포인트 이용권은 일회성이라 자동 갱신이
 * 없다 — 사후("끝났어요")만 알리면 코호트 전원이 30일차에 기본값으로 이탈한다.
 * T-7 · T-1 에 미리 알리고 재구매 경로(/subscription)를 같이 준다.
 * 하루 1회 크론 × 하루 폭 창이라 사용자마다 창당 한 번 걸린다(중복 발송 없음).
 * 실패해도 강등 스윕에는 영향을 주지 않는다(fail-soft).
 */
async function sendPreExpiryReminders(
  sb: NonNullable<ReturnType<typeof getServiceSupabase>>,
  nowIso: string,
): Promise<number> {
  let reminded = 0;
  try {
    /* 자동결제(토스 빌링) 이용자는 제외 — 만료 전에 카드로 자동 갱신되므로
       "만료돼요, 연장하세요" 알림은 그 사람에게 거짓 안내다(갱신이 실패하면
       billing-renewals 크론이 별도의 실패 알림을 보낸다). */
    const autopayEmails = await listLiveBillingEmails().catch(() => new Set<string>());
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    const windows = [
      {
        from: new Date(now + 6 * day).toISOString(),
        to: new Date(now + 7 * day).toISOString(),
        title: "이용권이 7일 뒤 만료돼요",
        body: "지금 쓰시는 이용권이 일주일 뒤 끝나요. 만료 전에 연장하면 이용이 끊기지 않아요.",
        /* [966] 7일짜리 주간권은 구매 다음 날 이 창에 걸린다 — "7일 뒤 만료" 는 그 사람에게
           방금 산 것을 다시 사라는 말이다. 총 기간이 8일 미만인 이용권은 T-7 을 건너뛴다. */
        minSpanDays: 8,
      },
      {
        from: nowIso,
        to: new Date(now + 1 * day).toISOString(),
        title: "이용권이 내일 만료돼요",
        body: "이용권이 24시간 안에 끝나요. 지금 연장하면 그대로 이어서 쓸 수 있어요.",
        minSpanDays: 0,
      },
    ];
    for (const w of windows) {
      const { data: upcoming, error: upcomingError } = await sb
        .from("app_users")
        .select("email, plan_expires_at, updated_at")
        .not("plan", "in", '("free","basic")')
        .not("plan_expires_at", "is", null)
        .gte("plan_expires_at", w.from)
        .lt("plan_expires_at", w.to)
        .limit(500);
      if (upcomingError) {
        logger.warn("[plan-expiry-sweep] 사전 알림 대상 조회 실패", upcomingError.message);
        continue;
      }
      for (const row of upcoming ?? []) {
        const email = String(row.email ?? "").trim();
        if (!email) continue;
        if (autopayEmails.has(email.toLowerCase())) continue; // 자동 갱신 예정 — 알림 부적절
        if (w.minSpanDays > 0) {
          /* 이용권 총 기간 추정 = 만료 - 마지막 갱신(updated_at: applyPlan 이 쓴다).
             8일 미만이면 주간권 — T-7 은 보내지 않는다. */
          const exp = Date.parse(String(row.plan_expires_at ?? ""));
          const upd = Date.parse(String(row.updated_at ?? ""));
          if (Number.isFinite(exp) && Number.isFinite(upd) && exp - upd < w.minSpanDays * day) continue;
        }
        try {
          await appendInboxNotification({
            userEmail: email,
            title: w.title,
            body: w.body,
            actionUrl: "/subscription",
          });
          reminded += 1;
        } catch (notifyErr) {
          logger.warn("[plan-expiry-sweep] 사전 알림 실패", notifyErr);
        }
      }
    }
  } catch (remindErr) {
    logger.warn("[plan-expiry-sweep] 사전 알림 단계 실패", remindErr);
  }
  return reminded;
}

/**
 * 버려진 결제 시도 정리 (2026-08-25).
 *
 * 실측: payments 에 `requested` 로 만들어진 뒤 아무 콜백도 오지 않아 그대로
 * 남은 주문이 있었다(08-25 11:55 요청분이 9시간 넘게 requested). 토스 결제창은
 * 유효시간이 지나면 실패 웹훅이 오지만, 사용자가 창을 그냥 닫으면 그 웹훅조차
 * 오지 않는다 — 장부에 영원히 "진행 중"으로 남는다.
 *
 * `failed` 로 적으면 안 된다. 거절과 미완료는 다른 사실이고, 합치면 실패율
 * 지표가 거짓말을 한다. 이미 스키마에 있는 `cancelled` 로 적는다.
 */
const ABANDON_AFTER_MIN = 45;

async function sweepAbandonedPayments(
  sb: NonNullable<ReturnType<typeof getServiceSupabase>>,
): Promise<number> {
  try {
    const cutoff = new Date(Date.now() - ABANDON_AFTER_MIN * 60_000).toISOString();
    const { data, error } = await sb
      .from("payments")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
      .eq("status", "requested")
      .lt("requested_at", cutoff)
      .select("order_id");
    if (error) throw new Error(error.message);
    const n = data?.length ?? 0;
    if (n > 0) {
      logger.warn(`[plan-expiry] 미완료 결제 시도 ${n}건을 cancelled 로 정리 (${ABANDON_AFTER_MIN}분 초과)`);
    }
    return n;
  } catch (e) {
    logger.error("[plan-expiry] 미완료 결제 정리 실패", e);
    return 0;
  }
}

export async function GET(req: Request) {
  const authorized = await authorizeCron(req);
  if (!authorized) {
    return NextResponse.json({ error: "권한이 필요합니다." }, { status: 403 });
  }

  const sb = getServiceSupabase();
  if (!sb) return NextResponse.json({ ok: true, demoted: 0, note: "Supabase 미설정" });

  const nowIso = new Date().toISOString();
  /* 결제 장부 정리를 먼저 — 만료 스윕이 실패해도 이건 끝나 있게 한다. */
  const abandoned = await sweepAbandonedPayments(sb);
  try {
    const { data: expired, error } = await sb
      .from("app_users")
      .select("id, email, plan, plan_expires_at")
      .not("plan", "in", '("free","basic")')
      .not("plan_expires_at", "is", null)
      .lt("plan_expires_at", nowIso)
      .limit(500);
    if (error) throw new Error(error.message);

    const targets = expired ?? [];
    if (targets.length === 0) {
      /* 오늘 강등 대상이 없어도 사전 알림(T-7·T-1)은 돌아야 한다. */
      const reminded = await sendPreExpiryReminders(sb, nowIso);
      await logIngest({
        source: "plan-expiry",
        dataset: "app_users",
        origin: "cron-fetch",
        rows: 0,
        status: "ok",
        message: `만료된 유료 플랜 없음 · 사전 알림 ${reminded}명`,
      });
      return NextResponse.json({ ok: true, demoted: 0, reminded, abandoned });
    }

    const ids = targets.map((r) => String(r.id));
    const { data: demotedRows, error: updateError } = await sb
      .from("app_users")
      .update({ plan: "free", plan_expires_at: null })
      .in("id", ids)
      // 조회와 갱신 사이에 재결제로 만료가 갱신된 사용자를 지키는 이중 조건
      .lt("plan_expires_at", nowIso)
      .select("id");
    if (updateError) throw new Error(updateError.message);

    const demoted = demotedRows?.length ?? 0;

    // 무통보 강등 금지 — 실제로 강등된 사용자에게 인앱 알림을 남긴다 (fail-soft)
    const emailById = new Map(targets.map((r) => [String(r.id), String(r.email ?? "")]));
    for (const row of demotedRows ?? []) {
      const email = emailById.get(String(row.id));
      if (!email) continue;
      try {
        await appendInboxNotification({
          userEmail: email,
          title: "구독 이용 기간 종료",
          body: "이용권 기간이 끝나 무료 플랜으로 전환됐어요. 언제든 다시 이용권을 받을 수 있어요.",
          actionUrl: "/subscription",
        });
      } catch (notifyErr) {
        logger.warn("[plan-expiry-sweep] notify", notifyErr);
      }
    }

    const reminded = await sendPreExpiryReminders(sb, nowIso);

    logger.info(
      `[plan-expiry-sweep] ${demoted}명 강등 (후보 ${targets.length}명) · 사전 알림 ${reminded}명`,
    );
    await logIngest({
      source: "plan-expiry",
      dataset: "app_users",
      origin: "cron-fetch",
      rows: demoted,
      status: "ok",
      message: `만료 강등 ${demoted}명 (후보 ${targets.length}명) · 사전 알림 ${reminded}명`,
    });
    return NextResponse.json({ ok: true, demoted, candidates: targets.length, reminded, abandoned });
  } catch (e) {
    logger.error("[plan-expiry-sweep]", e);
    await logIngest({
      source: "plan-expiry",
      dataset: "app_users",
      origin: "cron-fetch",
      rows: 0,
      status: "error",
      message: ingestErrorMessage(e),
    });
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "sweep failed" },
      { status: 500 },
    );
  }
}
