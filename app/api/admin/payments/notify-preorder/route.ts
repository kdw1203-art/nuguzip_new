import { NextResponse } from "next/server";
import { isAdminApiRequest } from "@/lib/admin/api-auth";
import { getServiceSupabase } from "@/lib/supabase/service";
import { appendInboxNotification } from "@/lib/notifications/inbox";
import { logger } from "@/lib/log";

export const runtime = "nodejs";

/**
 * 웹3 — 사전등록자 결제 오픈 알림 (관리자 수동 발송).
 *
 * 결제 미개통 기간의 "오픈 알림 받기" 버튼은 plan_preorder_interest 이벤트로
 * 구매 의사를 기록했고, PreOrderCta 문구는 "결제가 열리면 알림으로
 * 알려드릴게요"라고 약속했다. 이 라우트가 그 약속의 이행 수단이다.
 *
 * 자동 발송이 아니라 관리자 버튼인 이유 — 지금 결제는 **테스트 키**로 열려
 * 있다(실청구 없음). "결제가 열렸다"는 알림을 언제 보낼지는 라이브 전환
 * 시점을 아는 운영자의 판단이다. 코드가 임의로 "열림"을 선언하지 않는다.
 *
 * 멱등성: 발송한 이메일마다 plan_preorder_open_notified 이벤트를 남기고,
 * 다음 실행에서 그 명단을 제외한다 — 버튼을 두 번 눌러도 중복 발송 없음.
 * 비로그인 등록(user_email null)은 연락 수단이 없어 제외하고 수를 밝힌다.
 */
export async function POST() {
  if (!(await isAdminApiRequest())) {
    return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  }
  const sb = getServiceSupabase();
  if (!sb) {
    return NextResponse.json({ error: "서비스 DB 미설정" }, { status: 503 });
  }

  const { data: interests, error: e1 } = await sb
    .from("platform_activity_events")
    .select("user_email")
    .eq("event_name", "plan_preorder_interest")
    .limit(5000);
  if (e1) {
    return NextResponse.json({ error: `사전등록 조회 실패: ${e1.message}` }, { status: 500 });
  }
  const rows = interests ?? [];
  const anonymous = rows.filter((r) => !r.user_email).length;
  const emails = [
    ...new Set(
      rows
        .map((r) => (r.user_email ?? "").trim().toLowerCase())
        .filter((v) => v.includes("@")),
    ),
  ];

  const { data: notified, error: e2 } = await sb
    .from("platform_activity_events")
    .select("user_email")
    .eq("event_name", "plan_preorder_open_notified")
    .limit(5000);
  if (e2) {
    return NextResponse.json({ error: `기발송 조회 실패: ${e2.message}` }, { status: 500 });
  }
  const already = new Set(
    (notified ?? []).map((r) => (r.user_email ?? "").trim().toLowerCase()),
  );
  const targets = emails.filter((v) => !already.has(v));

  let sent = 0;
  const failed: string[] = [];
  for (const email of targets) {
    try {
      await appendInboxNotification({
        userEmail: email,
        title: "멤버십 결제가 열렸어요",
        body: "사전 등록하신 누구집 멤버십 결제가 열렸습니다. 등록해 두신 관심에 감사드려요 — 요금제 페이지에서 플랜을 확인해 보세요.",
        actionUrl: "/subscription",
      });
      /* 발송 기록을 먼저가 아니라 발송 성공 직후에 남긴다 — 기록만 되고
         알림이 안 간 유령 발송을 만들지 않는다. */
      const { error: e3 } = await sb.from("platform_activity_events").insert({
        platform: "desktop",
        event_name: "plan_preorder_open_notified",
        user_email: email,
        source: "admin",
        campaign: "preorder",
        path: "/admin/payments",
        metadata: {},
      });
      if (e3) {
        /* 알림은 갔는데 기록 실패 — 다음 실행에서 중복 1회가 날 수 있는 상태.
           숨기지 않고 실패 목록에 올린다. */
        failed.push(`${email} (기록 실패: ${e3.message})`);
      } else {
        sent += 1;
      }
    } catch (err) {
      failed.push(email);
      logger.error("[notify-preorder] 발송 실패", email, err);
    }
  }

  return NextResponse.json({
    ok: true,
    registered: rows.length,
    anonymous,
    uniqueEmails: emails.length,
    alreadyNotified: already.size,
    sent,
    failed,
  });
}
