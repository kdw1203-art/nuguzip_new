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
    alertPhone: r.alert_phone ? String(r.alert_phone) : null,
    smsPriceAlerts: Boolean(r.sms_price_alerts ?? DEFAULT_PREFS.smsPriceAlerts),
    smsConsentAt: r.sms_consent_at ? String(r.sms_consent_at) : null,
    updatedAt: String(r.updated_at ?? ""),
  };
}

export async function getPrefs(userEmail: string): Promise<NotificationPrefs> {
  const sb = getServiceSupabase();
  if (!sb) {
    return { userEmail, ...DEFAULT_PREFS, updatedAt: new Date().toISOString() };
  }
  const { data } = await sb
    .from("notification_preferences")
    .select("*")
    .eq("user_email", userEmail)
    .maybeSingle();
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
