import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/log";

/** 서비스 키가 없는 개발 환경용 — 프로세스가 살아 있는 동안만 유지된다. */
const memory = new Map<string, { compare: number; share: number }>();

export type TrialFeature = "compare" | "share";

const FREE_TRIAL_LIMIT = 1;

function key(email: string) {
  return email.trim().toLowerCase();
}

/**
 * 체험 사용 기록을 읽는다. **조회에 실패하면 던진다.**
 *
 * 예전에는 error 를 받지 않아서 실패가 `data == null` 로 나타났고, 그러면
 * 프로세스 안의 memory 맵으로 떨어졌다. 그 맵은 람다가 새로 뜰 때마다 비어
 * 있으므로 사실상 `{compare:0, share:0}` — "아직 한 번도 안 썼다"이다.
 * 즉 DB 가 밀리는 동안에는 무료 체험이 몇 번이든 다시 열렸다.
 *
 * 행이 없는 것(= 진짜로 아직 안 씀)은 error 없이 data=null 로 온다.
 */
async function read(email: string): Promise<{ compare: number; share: number }> {
  const k = key(email);
  const sb = getServiceSupabase();
  if (!sb) return memory.get(k) ?? { compare: 0, share: 0 };
  const { data, error } = await sb
    .from("feature_trial_usage")
    .select("compare_trials_used, share_trials_used")
    .eq("author_email", k)
    .maybeSingle();
  if (error) throw new Error(`feature_trial_usage 조회 실패: ${error.message}`);
  if (!data) return { compare: 0, share: 0 };
  return {
    compare: Number(data.compare_trials_used ?? 0),
    share: Number(data.share_trials_used ?? 0),
  };
}

async function write(email: string, row: { compare: number; share: number }) {
  const k = key(email);
  memory.set(k, row);
  const sb = getServiceSupabase();
  if (!sb) return;
  const { error } = await sb.from("feature_trial_usage").upsert(
    {
      author_email: k,
      compare_trials_used: row.compare,
      share_trials_used: row.share,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "author_email" },
  );
  /* 저장 실패는 되돌리지 않는다(기능은 이미 열어 줬다). 대신 기록은 남긴다 —
     예전에는 이 실패가 아무 데도 남지 않아, 체험을 다시 쓸 수 있게 된 사람이
     왜 그런지 알 길이 없었다. */
  if (error) logger.error("[feature-trial] 사용 기록 저장 실패:", error.message);
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
