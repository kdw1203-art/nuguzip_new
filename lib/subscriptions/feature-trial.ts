import { getServiceSupabase } from "@/lib/supabase/service";

const memory = new Map<string, { compare: number; share: number }>();

export type TrialFeature = "compare" | "share";

const FREE_TRIAL_LIMIT = 1;

function key(email: string) {
  return email.trim().toLowerCase();
}

async function read(email: string): Promise<{ compare: number; share: number }> {
  const k = key(email);
  const sb = getServiceSupabase();
  if (sb) {
    const { data } = await sb
      .from("feature_trial_usage")
      .select("compare_trials_used, share_trials_used")
      .eq("author_email", k)
      .maybeSingle();
    if (data) {
      return {
        compare: Number(data.compare_trials_used ?? 0),
        share: Number(data.share_trials_used ?? 0),
      };
    }
  }
  return memory.get(k) ?? { compare: 0, share: 0 };
}

async function write(email: string, row: { compare: number; share: number }) {
  const k = key(email);
  memory.set(k, row);
  const sb = getServiceSupabase();
  if (!sb) return;
  await sb.from("feature_trial_usage").upsert(
    {
      author_email: k,
      compare_trials_used: row.compare,
      share_trials_used: row.share,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "author_email" },
  );
}

/** Free 사용자 1회 체험 가능 여부 */
export async function canUseFeatureTrial(
  email: string,
  feature: TrialFeature,
): Promise<boolean> {
  const row = await read(email);
  const used = feature === "compare" ? row.compare : row.share;
  return used < FREE_TRIAL_LIMIT;
}

/** 체험 1회 소비 (Pro 이상은 호출하지 않음) */
export async function consumeFeatureTrial(
  email: string,
  feature: TrialFeature,
): Promise<void> {
  const row = await read(email);
  if (feature === "compare") row.compare += 1;
  else row.share += 1;
  await write(email, row);
}
