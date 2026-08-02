import { getServiceSupabase } from "@/lib/supabase/service";

export type NotificationPrefs = {
  userEmail: string;
  emailComments: boolean;
  emailLikes: boolean;
  emailMeeting: boolean;
  emailExpert: boolean;
  emailMarketing: boolean;
  pushComments: boolean;
  pushLikes: boolean;
  pushMeeting: boolean;
  pushExpert: boolean;
  /**
   * B9 — 쓰다 만 임장노트·관심 단지 재알림. 기본 true.
   * 광고가 아니라 "본인이 쓰다 만 본인 기록"을 알리는 것이라 기본값이 켜짐이고,
   * 이 화면에서 끄면 크론이 이 사람을 후보에서 제외한다.
   */
  pushReengagement: boolean;
  /**
   * I10 — 내 매물이 오래됐을 때 끌어올리기 안내(21일)·마감 제안(60일). 기본 true.
   * 본인이 올린 본인 매물의 관리 안내라 기본값이 켜짐이고, 여기서 끄면 크론이
   * 이 사람의 매물을 후보에서 제외한다.
   */
  pushListingStale: boolean;
  /**
   * 출석 리마인드 푸시(매일 18:00 KST, 오늘 미출석자에게 1회). 기본 true.
   * 위 두 개와 같은 "본인 루틴 안내" 계열이라 기본 켜짐 — 끄면
   * attendance-reminders 크론이 이 사람을 발송 대상에서 제외한다.
   */
  pushAttendance: boolean;
  /**
   * 주간 다이제스트 수신함·푸시. 기본 **false**.
   * 위 두 개와 달리 "본인 기록 관리 안내"가 아니라 주기적 소식지라서 옵트인이다.
   * /digest 화면 문구도 "켜면 보내드려요"이므로 기본값이 켜져 있으면 안 된다.
   */
  pushWeeklyDigest: boolean;
  /** SMS(NCP SENS) 관심단지 가격 알림 수신 번호(숫자만) — 옵트인 시에만 저장 */
  alertPhone: string | null;
  /** 관심단지 가격변동 SMS 수신 동의(옵트인) */
  smsPriceAlerts: boolean;
  /** SMS 수신 동의 시각 (서버에서만 기록) */
  smsConsentAt: string | null;
  updatedAt: string;
};

const DEFAULT_PREFS: Omit<NotificationPrefs, "userEmail" | "updatedAt"> = {
  emailComments: true,
  emailLikes: false,
  emailMeeting: true,
  emailExpert: true,
  emailMarketing: false,
  pushComments: true,
  pushLikes: true,
  pushMeeting: true,
  pushExpert: true,
  pushReengagement: true,
  pushListingStale: true,
  pushAttendance: true,
  /* 2026-08-01(항목 40): 옵트인(false) → 옵트아웃(true). 주간 다이제스트는
     주 1회·요약형이라 소음 축이 아니고, 기본 false 면 VAPID 키를 넣어도 도달
     범위가 0에 가깝다. 설정 화면에서 언제든 끌 수 있다. */
  pushWeeklyDigest: true,
  alertPhone: null,
  smsPriceAlerts: false,
  smsConsentAt: null,
};

/** 한국 휴대폰 번호 정규화 — 숫자만, 01x 로 시작하는 10~11자리만 허용. 그 외 null. */
export function normalizeAlertPhone(input: unknown): string | null {
  if (input == null) return null;
  const digits = String(input).replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 11) return null;
  if (!digits.startsWith("01")) return null;
  return digits;
}

function mapRow(r: Record<string, unknown>): NotificationPrefs {
  return {
    userEmail: String(r.user_email ?? ""),
    emailComments: Boolean(r.email_comments ?? DEFAULT_PREFS.emailComments),
    emailLikes: Boolean(r.email_likes ?? DEFAULT_PREFS.emailLikes),
    emailMeeting: Boolean(r.email_meeting ?? DEFAULT_PREFS.emailMeeting),
    emailExpert: Boolean(r.email_expert ?? DEFAULT_PREFS.emailExpert),
    emailMarketing: Boolean(r.email_marketing ?? DEFAULT_PREFS.emailMarketing),
    pushComments: Boolean(r.push_comments ?? DEFAULT_PREFS.pushComments),
    pushLikes: Boolean(r.push_likes ?? DEFAULT_PREFS.pushLikes),
    pushMeeting: Boolean(r.push_meeting ?? DEFAULT_PREFS.pushMeeting),
    pushExpert: Boolean(r.push_expert ?? DEFAULT_PREFS.pushExpert),
    pushReengagement: Boolean(r.push_reengagement ?? DEFAULT_PREFS.pushReengagement),
    pushListingStale: Boolean(r.push_listing_stale ?? DEFAULT_PREFS.pushListingStale),
    pushAttendance: Boolean(r.push_attendance ?? DEFAULT_PREFS.pushAttendance),
    pushWeeklyDigest: Boolean(r.push_weekly_digest ?? DEFAULT_PREFS.pushWeeklyDigest),
    alertPhone: r.alert_phone ? String(r.alert_phone) : null,
    smsPriceAlerts: Boolean(r.sms_price_alerts ?? DEFAULT_PREFS.smsPriceAlerts),
    smsConsentAt: r.sms_consent_at ? String(r.sms_consent_at) : null,
    updatedAt: String(r.updated_at ?? ""),
  };
}

/**
 * 알림 설정 조회. **실패하면 던진다.**
 *
 * 예전에는 error 를 받지 않아, 조회가 실패하면 아래 `!data` 가지로 떨어져
 * DEFAULT_PREFS 를 돌려줬다. 기본값에는 켜져 있는 항목이 여럿이라(댓글 메일,
 * 모임 메일, 재알림·매물·출석 푸시) 그 결과는 **알림을 끈 사람에게 켜져 있다고
 * 말하는 것**이 된다.
 *
 * 특히 /my/settings 화면이 위험했다: 토글이 켜진 채로 그려지고, 그 상태에서
 * 하나라도 저장하면 잘못 그려진 값이 그대로 DB 에 박힌다 — 몇 초짜리 조회
 * 실패가 영구적인 설정 변경으로 바뀌는 길이었다.
 *
 * 행이 없는 것(아직 한 번도 설정을 저장하지 않은 사람)은 error 없이 data=null
 * 로 오므로, 그때만 기본값이다.
 */
export async function getPrefs(userEmail: string): Promise<NotificationPrefs> {
  const sb = getServiceSupabase();
  if (!sb) {
    return { userEmail, ...DEFAULT_PREFS, updatedAt: new Date().toISOString() };
  }
  const { data, error } = await sb
    .from("notification_preferences")
    .select("*")
    .eq("user_email", userEmail)
    .maybeSingle();
  if (error) throw new Error(`notification_preferences 조회 실패: ${error.message}`);
  if (!data) return { userEmail, ...DEFAULT_PREFS, updatedAt: new Date().toISOString() };
  return mapRow(data as Record<string, unknown>);
}

export async function upsertPrefs(
  userEmail: string,
  patch: Partial<Omit<NotificationPrefs, "userEmail" | "updatedAt">>,
): Promise<NotificationPrefs> {
  const sb = getServiceSupabase();
  if (!sb) return { userEmail, ...DEFAULT_PREFS, ...patch, updatedAt: new Date().toISOString() };

  const payload: Record<string, unknown> = {
    user_email: userEmail,
    updated_at: new Date().toISOString(),
  };
  if (patch.emailComments !== undefined) payload.email_comments = patch.emailComments;
  if (patch.emailLikes !== undefined) payload.email_likes = patch.emailLikes;
  if (patch.emailMeeting !== undefined) payload.email_meeting = patch.emailMeeting;
  if (patch.emailExpert !== undefined) payload.email_expert = patch.emailExpert;
  if (patch.emailMarketing !== undefined) payload.email_marketing = patch.emailMarketing;
  if (patch.pushComments !== undefined) payload.push_comments = patch.pushComments;
  if (patch.pushLikes !== undefined) payload.push_likes = patch.pushLikes;
  if (patch.pushMeeting !== undefined) payload.push_meeting = patch.pushMeeting;
  if (patch.pushExpert !== undefined) payload.push_expert = patch.pushExpert;
  if (patch.pushReengagement !== undefined)
    payload.push_reengagement = patch.pushReengagement;
  if (patch.pushListingStale !== undefined)
    payload.push_listing_stale = patch.pushListingStale;
  if (patch.pushAttendance !== undefined) payload.push_attendance = patch.pushAttendance;
  if (patch.pushWeeklyDigest !== undefined)
    payload.push_weekly_digest = patch.pushWeeklyDigest;
  // 전화번호: 서버에서 정규화(숫자만·01x·10~11자리) 후 저장, 그 외 null
  if (patch.alertPhone !== undefined) {
    payload.alert_phone = patch.alertPhone ? normalizeAlertPhone(patch.alertPhone) : null;
  }
  // SMS 옵트인: 켤 때 동의 시각을 서버에서 기록 (smsConsentAt은 클라이언트가 못 정함)
  if (patch.smsPriceAlerts !== undefined) {
    payload.sms_price_alerts = patch.smsPriceAlerts;
    if (patch.smsPriceAlerts) payload.sms_consent_at = new Date().toISOString();
  }

  const { data, error } = await sb
    .from("notification_preferences")
    .upsert(payload, { onConflict: "user_email" })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return mapRow(data as Record<string, unknown>);
}
