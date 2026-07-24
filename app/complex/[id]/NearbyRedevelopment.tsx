import { listDbProjects } from "@/lib/redevelopment/store";
import { PROJECT_TYPES, stageLabel } from "@/lib/redevelopment/types";

/* D3 — 인근 정비사업 섹션. 단지 소재 시군구의 실 정비사업(redevelopment_projects)만.
   DB 확정 데이터만 노출(시드 폴백 없음) — 없으면 렌더 자체를 생략(사실 우선). */

function typeLabel(key: string): string {
  return PROJECT_TYPES.find((t) => t.key === key)?.label ?? key;
}

export async function NearbyRedevelopment({ sigungu }: { sigungu: string }) {
  const gu = sigungu.trim();
  if (!gu) return null;

  const projects = await listDbProjects({ sigungu: gu, limit: 6 }).catch(() => []);
  if (projects.length === 0) return null;

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
      <a href="/map" className="mt-2 inline-block px-1 text-[13px] font-bold text-primary">
        지도에서 정비사업 전체 보기 →
      </a>
    </section>
  );
}
