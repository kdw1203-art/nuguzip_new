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
  /* A7 — 실험 태그. 호출자가 이미 등록부와 대조한 값만 넘긴다
     (lib/experiments/server.ts 의 sanitizeExperimentTag). 여기서는 저장만 한다.
     별도 표를 만들지 않는 이유: 퍼널 이벤트가 전부 이 표로 들어오므로, 실험용
     표를 따로 두면 "실험 전환율"과 "실제 퍼널"이 갈라져 안 맞는 숫자가 두 벌 생긴다. */
  experimentKey?: string | null;
  variant?: string | null;
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
    experiment_key: input.experimentKey?.trim().slice(0, 80) || null,
    variant: input.variant?.trim().slice(0, 40) || null,
  });
}

