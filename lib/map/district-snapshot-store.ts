import { getServiceSupabase } from "@/lib/supabase/service";
import {
  type DistrictSnapshotDocument,
  SAMPLE_DAECHI_SNAPSHOT,
  isDistrictSnapshotDocument,
  parseDistrictKey,
  snapshotMonthToYm,
} from "@/lib/map/district-snapshot-document";

const WORKSPACE_METRIC_GROUP = "workspace";

function currentSnapshotMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

async function resolveDistrictId(districtKey: string): Promise<number | null> {
  const sb = getServiceSupabase();
  if (!sb) return null;

  const { sidoShort, sigungu, eupmyeondong } = parseDistrictKey(districtKey);
  const sidoVariants = [
    `${sidoShort}특별시`,
    `${sidoShort}광역시`,
    `${sidoShort}특별자치시`,
    `${sidoShort}도`,
    sidoShort,
  ];

  for (const sido of sidoVariants) {
    let q = sb.from("districts").select("id").eq("sigungu", sigungu);
    if (eupmyeondong) q = q.eq("eupmyeondong", eupmyeondong);
    else q = q.is("eupmyeondong", null);
    const { data } = await q.eq("sido", sido).maybeSingle();
    if (data?.id) return Number(data.id);
  }

  const { data: fuzzyRows } = await sb
    .from("districts")
    .select("id")
    .eq("sigungu", sigungu)
    .limit(1);
  const fuzzy = fuzzyRows?.[0];
  return fuzzy?.id ? Number(fuzzy.id) : null;
}

export async function getDistrictSnapshotDocument(input: {
  districtKey: string;
  snapshotMonth?: string;
  fallbackSample?: boolean;
}): Promise<{ document: DistrictSnapshotDocument | null; source: "db" | "sample" | "none" }> {
  const snapshotMonth = input.snapshotMonth ?? currentSnapshotMonth();
  const snapshotYm = snapshotMonthToYm(snapshotMonth);
  const sb = getServiceSupabase();

  if (sb) {
    const districtId = await resolveDistrictId(input.districtKey);
    if (districtId) {
      const { data } = await sb
        .from("district_snapshots")
        .select("payload")
        .eq("district_id", districtId)
        .eq("snapshot_ym", snapshotYm)
        .eq("metric_group", WORKSPACE_METRIC_GROUP)
        .maybeSingle();

      if (data?.payload && isDistrictSnapshotDocument(data.payload)) {
        return { document: data.payload, source: "db" };
      }
    }
  }

  if (
    input.fallbackSample !== false &&
    input.districtKey === SAMPLE_DAECHI_SNAPSHOT.districtKey
  ) {
    return {
      document: { ...SAMPLE_DAECHI_SNAPSHOT, snapshotMonth },
      source: "sample",
    };
  }

  return { document: null, source: "none" };
}

export async function upsertDistrictSnapshotDocument(
  doc: DistrictSnapshotDocument,
  meta?: { sourceAuthority?: string; sourceUrl?: string },
): Promise<{ ok: boolean; districtId?: number }> {
  const sb = getServiceSupabase();
  if (!sb) return { ok: false };

  const districtId = await resolveDistrictId(doc.districtKey);
  if (!districtId) return { ok: false };

  const { error } = await sb.from("district_snapshots").upsert(
    {
      district_id: districtId,
      snapshot_ym: snapshotMonthToYm(doc.snapshotMonth),
      metric_group: WORKSPACE_METRIC_GROUP,
      payload: doc,
      source_authority: meta?.sourceAuthority ?? null,
      source_url: meta?.sourceUrl ?? null,
      fetched_at: new Date().toISOString(),
    },
    { onConflict: "district_id,snapshot_ym,metric_group" },
  );

  return { ok: !error, districtId };
}
