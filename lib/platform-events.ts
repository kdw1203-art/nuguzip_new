import { getServiceSupabase } from "@/lib/supabase/service";
import type { PlatformShell } from "@/lib/platform-shell";

export async function recordPlatformEvent(input: {
  platform: PlatformShell;
  eventName: string;
  userEmail?: string | null;
  source?: string | null;
  campaign?: string | null;
  path?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const sb = getServiceSupabase();
  if (!sb) return;

  await sb.from("platform_activity_events").insert({
    platform: input.platform,
    event_name: input.eventName,
    user_email: input.userEmail?.trim().toLowerCase() || null,
    source: input.source?.trim().slice(0, 80) || null,
    campaign: input.campaign?.trim().slice(0, 80) || null,
    path: input.path?.trim().slice(0, 300) || null,
    metadata: input.metadata ?? {},
  });
}

