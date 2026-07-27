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

/* districts 는 legal_regions 에서 시드하며 sido_short 에 원본 표기("서울")를,
   sido 에 공식 전체 명칭("서울특별시")을 함께 담는다. 그래서 예전처럼
   "서울"+특별시/광역시/특별자치시/도 다섯 가지를 순서대로 찔러 볼 필요가 없다 —
   그 방식은 강원특별자치도·전북특별자치도·제주특별자치도를 어느 조합으로도
   맞히지 못했다. sido_short 로 한 번에 맞춘다.

   (시도, 시군구) 는 유일하지 않다. 법정동코드 재편으로 옛 코드와 새 코드가 함께
   남은 행이 실제로 있다(시흥시 41390/41430, 전주시 완산구 45111/52111).
   maybeSingle() 은 행이 2개 이상이어도 error 를 내므로 쓰지 않고, lawd_cd
   오름차순 첫 행으로 결정적으로 고른다 — 읽기와 쓰기가 같은 행을 가리켜야
   스냅샷이 엇갈리지 않는다. 그러면 error 는 오직 진짜 조회 실패만 남는다. */
async function resolveDistrictId(districtKey: string): Promise<number | null> {
  const sb = getServiceSupabase();
  if (!sb) return null;

  const { sidoShort, sigungu, eupmyeondong } = parseDistrictKey(districtKey);

  let q = sb.from("districts").select("id").eq("sigungu", sigungu);
  if (eupmyeondong) q = q.eq("eupmyeondong", eupmyeondong);
  else q = q.is("eupmyeondong", null);
  if (sidoShort) q = q.eq("sido_short", sidoShort);
  const { data, error } = await q.order("lawd_cd", { ascending: true }).limit(1);
  if (error) throw snapshotQueryError(`districts (${sigungu} · ${sidoShort})`, error);
  const hit = data?.[0];
  if (hit?.id) return Number(hit.id);

  /* 시도 표기가 어긋난 경우(예: 전체 명칭이 넘어온 키)를 위한 폴백 — 시군구만으로 찾는다. */
  const { data: fuzzyRows, error: fuzzyError } = await sb
    .from("districts")
    .select("id")
    .eq("sigungu", sigungu)
    .order("lawd_cd", { ascending: true })
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
