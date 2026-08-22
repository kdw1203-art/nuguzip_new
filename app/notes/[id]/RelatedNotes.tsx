import Link from "next/link";
import { Icon } from "@/app/components/Icon";
import {
  listPublicNotes,
  inspectionAverageScore,
  type InspectionNote,
} from "@/lib/inspection/store-db";
import { regionIdForName } from "@/lib/region/catalog";
import { logger } from "@/lib/log";

/* [3차] 같은 지역의 다른 임장노트 — 노트 상세의 이탈 지점을 순환 지점으로.
 * 공개 노트 19건 규모에서는 전량(50) 로드 후 지역 일치 필터가 가장 단순하고
 * 정확하다(전용 쿼리·인덱스는 노트가 수백 건이 될 때 붙인다 — 그때의 일).
 * 지역이 같은 노트가 없으면 최신 공개 노트로 대체하고, 그마저 없으면 섹션을
 * 그리지 않는다. 조회 실패도 섹션 생략(fail-soft — 상세 본문이 우선이다). */

export async function RelatedNotes({
  currentId,
  region,
}: {
  currentId: string;
  region: string;
}) {
  let notes: InspectionNote[] = [];
  try {
    notes = await listPublicNotes(50);
  } catch (e) {
    logger.error("[related-notes]", e);
    return null;
  }
  const regionTrim = region.trim();
  const sameRegion = notes.filter(
    (n) => n.id !== currentId && regionTrim && n.region.trim() === regionTrim,
  );
  const pool = (sameRegion.length > 0 ? sameRegion : notes.filter((n) => n.id !== currentId)).slice(
    0,
    4,
  );
  if (pool.length === 0) return null;

  const regionId = regionIdForName(regionTrim);
  const sameRegionMode = sameRegion.length > 0;

  return (
    <section className="mt-6">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[15px] font-extrabold text-ink">
          {sameRegionMode ? `${regionTrim}의 다른 임장노트` : "최근 공개 임장노트"}
        </h2>
        {regionId && (
          <Link
            href={`/region/${regionId}`}
            className="inline-flex items-center gap-1 text-[12px] font-bold text-primary no-underline"
          >
            <Icon name="pin" size={13} />
            {regionTrim} 시장 데이터 보기 ›
          </Link>
        )}
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {pool.map((n) => {
          const rating = inspectionAverageScore(n.scores);
          return (
            <Link
              key={n.id}
              href={`/notes/${n.id}`}
              className="card flex flex-col gap-1 rounded-xl p-3.5 no-underline tap-ripple"
            >
              <span className="line-clamp-1 text-[13.5px] font-bold text-ink">{n.title}</span>
              <span className="flex items-center gap-2 text-[11.5px] text-text-3">
                <span>{n.region || "전국"}</span>
                {n.aptName?.trim() && <span>· {n.aptName.trim()}</span>}
                {rating > 0 && (
                  <span className="font-bold text-ink">★ {rating.toFixed(1)}</span>
                )}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
