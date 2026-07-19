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
};

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

  const { data, error } = await sb
    .from("notification_preferences")
    .upsert(payload, { onConflict: "user_email" })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return mapRow(data as Record<string, unknown>);
}
