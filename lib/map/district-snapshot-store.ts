import { getServiceSupabase } from "@/lib/supabase/service";
import {
  type DistrictSnapshotDocument,
  SAMPLE_DAECHI_SNAPSHOT,
  isDistrictSnapshotDocument,
  parseDistrictKey,
  snapshotMonthToYm,
} from "@/lib/map/district-snapshot-document";

/* 조회 실패는 던진다 — "그런 지역/스냅샷이 없다"고 답하지 않는다.
   getDistrictSnapshotDocument 는 못 읽으면 SAMPLE_DAECHI_SNAPSHOT 으로 흘러가
   source:"sample" 을 내려보냈다. 화면에는 대치동 예시 수치가 실제 자료가
   아직 없을 뿐인 것처럼 그려진다 — 장애를 "자료 없음"으로 바꿔 말하는 셈이다.
   못 읽었으면 못 읽었다고 하고, 샘플은 "정말 행이 없을 때"에만 붙인다. */
const WORKSPACE_METRIC_GROUP = "workspace";

/** 조회 실패 전용 에러 — "행이 없음"과 절대 섞지 않는다. */
function snapshotQueryError(where: string, err: { message?: string }): Error {
  return new Error(`${where} 조회 실패: ${err.message ?? "알 수 없는 오류"}`);
}

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

  /* maybeSingle() 은 행이 2개 이상이어도 error 를 낸다. districts 에는 중복 행이
     남아 있어(정리 전) 그 error 를 "못 읽음"으로 던지면 멀쩡한 지역이 503 이 된다.
     limit(1) 로 바꾸면 중복은 첫 행을 쓰고 — 아래 fuzzy 폴백이 이미 그렇게 한다 —
     error 는 오직 진짜 조회 실패만 남는다. */
  for (const sido of sidoVariants) {
    let q = sb.from("districts").select("id").eq("sigungu", sigungu);
    if (eupmyeondong) q = q.eq("eupmyeondong", eupmyeondong);
    else q = q.is("eupmyeondong", null);
    const { data, error } = await q.eq("sido", sido).limit(1);
    if (error) throw snapshotQueryError(`districts (${sigungu} · ${sido})`, error);
    const hit = data?.[0];
    if (hit?.id) return Number(hit.id);
  }

  const { data: fuzzyRows, error: fuzzyError } = await sb
    .from("districts")
    .select("id")
    .eq("sigungu", sigungu)
    .limit(1);
  if (fuzzyError) throw snapshotQueryError(`districts (${sigungu})`, fuzzyError);
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
      const { data, error } = await sb
        .from("district_snapshots")
        .select("payload")
        .eq("district_id", districtId)
        .eq("snapshot_ym", snapshotYm)
        .eq("metric_group", WORKSPACE_METRIC_GROUP)
        .maybeSingle();

      if (error) {
        throw snapshotQueryError(`district_snapshots (${input.districtKey})`, error);
      }

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
