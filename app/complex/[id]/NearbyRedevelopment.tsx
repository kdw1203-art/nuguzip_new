import Link from "next/link";
import { listProjects } from "@/lib/redevelopment/store";
import { PROJECT_TYPES, stageLabel } from "@/lib/redevelopment/types";

/* D3 — 인근 정비사업 섹션. 단지 소재 시군구의 정비사업을 보여준다.
   예전에는 listDbProjects(시드 폴백 없음)를 써서 DB가 비어 있는 동안 항상 숨겨졌다.
   listProjects(시드 폴백 포함)로 교체하되, 시드(공개자료 취합본) 기반일 때는
   취합 시점 캡션을 함께 표기해 사실 라벨을 유지한다. */

function typeLabel(key: string): string {
  return PROJECT_TYPES.find((t) => t.key === key)?.label ?? key;
}

export async function NearbyRedevelopment({ sigungu }: { sigungu: string }) {
  const gu = sigungu.trim();
  if (!gu) return null;

  const projects = await listProjects({ sigungu: gu, limit: 6 }).catch(
    () => [] as Awaited<ReturnType<typeof listProjects>>,
  );
  if (projects.length === 0) return null;

  // 시드 취합 시점 — 전부 같은 시점일 때만 캡션에 노출(혼합 시 개별 표기 없이 일반 문구)
  const asOfSet = new Set(projects.map((p) => p.asOf).filter(Boolean));
  const seedAsOf = asOfSet.size === 1 ? [...asOfSet][0] : null;
  const hasSeed = projects.some((p) => p.asOf != null);

  return (
    <section className="rise-in-5 mt-6">
      <h2 className="mb-2 px-1 text-[15px] font-extrabold text-ink">
        인근 정비사업 <span className="text-[12px] font-medium text-text-3">{gu}</span>
      </h2>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {projects.map((p) => (
          <div key={p.id} className="card flex flex-col gap-1.5 rounded-2xl px-4 py-3.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="rounded-[6px] bg-[#f2f4f8] px-2 py-[3px] text-[11px] font-extrabold text-text-2">
                {typeLabel(p.typeKey)}
              </span>
              <span className="rounded-[6px] bg-primary-soft px-2 py-[3px] text-[11px] font-extrabold text-primary">
                {stageLabel(p.stageKey)}
              </span>
            </div>
            <div className="text-[14px] font-extrabold text-ink">{p.name}</div>
            <div className="text-[12px] text-text-3">
              {[
                p.address,
                p.households ? `${p.households.toLocaleString("ko-KR")}세대 예정` : null,
              ]
                .filter(Boolean)
                .join(" · ") || gu}
            </div>
            {p.summary && (
              <p className="line-clamp-2 text-[12px] leading-[1.6] text-text-2">{p.summary}</p>
            )}
          </div>
        ))}
      </div>
      {hasSeed && (
        <p className="mt-1.5 px-1 text-[10px] leading-[1.6] text-text-3">
          {seedAsOf ? `${seedAsOf} ` : ""}공개자료(정비사업 정보몽땅·지자체 고시 등) 취합 기준
          참고 정보예요 — 최신 단계와 다를 수 있어요.
        </p>
      )}
      <Link
        href="/redevelopment"
        className="mt-2 inline-block px-1 text-[13px] font-bold text-primary"
      >
        정비사업 지도에서 전체 보기 →
      </Link>
    </section>
  );
}
