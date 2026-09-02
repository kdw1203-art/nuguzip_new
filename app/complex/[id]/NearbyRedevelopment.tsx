import Link from "next/link";
import type { listProjects } from "@/lib/redevelopment/store";
import { loadRedevelopment } from "./section-loaders";
import { PROJECT_TYPES, stageLabel } from "@/lib/redevelopment/types";
import { logger } from "@/lib/log";

/* D3 — 인근 정비사업 섹션. 단지 소재 시군구의 정비사업을 보여준다.
   예전에는 listDbProjects(시드 폴백 없음)를 써서 DB가 비어 있는 동안 항상 숨겨졌다.
   listProjects 로 교체했다. 시드 폴백은 2026-07-27 부터 표 자체가 없을 때만
   쓰이지만(조회 실패는 던진다), 그 경우에도 시드(공개자료 취합본) 기반이면
   취합 시점 캡션을 함께 표기해 사실 라벨을 유지한다. */

function typeLabel(key: string): string {
  return PROJECT_TYPES.find((t) => t.key === key)?.label ?? key;
}

export async function NearbyRedevelopment({ sigungu }: { sigungu: string }) {
  const gu = sigungu.trim();
  if (!gu) return null;

  /* 곁다리 섹션이라 실패해도 단지 페이지 전체를 죽이지는 않는다. 다만 조용히
     삼키지는 않는다 — 이 섹션이 계속 안 보이는데 로그가 없으면 "그 구에 정비사업이
     없다"와 "조회가 실패했다"를 아무도 구분할 수 없다. */
  const projects = await loadRedevelopment(gu).catch(
    (e: unknown) => {
      logger.error(`[NearbyRedevelopment] ${gu} 정비사업 조회 실패 — 섹션을 접습니다: ${String(e)}`);
      return [] as Awaited<ReturnType<typeof listProjects>>;
    },
  );
  if (projects.length === 0) return null;

  // 시드 취합 시점 — 전부 같은 시점일 때만 캡션에 노출(혼합 시 개별 표기 없이 일반 문구)
  const asOfSet = new Set(projects.map((p) => p.asOf).filter(Boolean));
  const seedAsOf = asOfSet.size === 1 ? [...asOfSet][0] : null;
  const hasSeed = projects.some((p) => p.asOf != null);

  return (
    <section className="rise-in-5 mt-6">
      <h2 className="mb-2 px-1 t-section text-ink">
        인근 정비사업 <span className="t-sub font-medium text-text-3">{gu}</span>
      </h2>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {projects.map((p) => (
          <div key={p.id} className="card flex flex-col gap-1.5 rounded-2xl px-4 py-3.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="rounded-[6px] bg-bg chip-pad t-sub font-extrabold text-text-2">
                {typeLabel(p.typeKey)}
              </span>
              <span className="rounded-[6px] bg-primary-soft chip-pad t-sub font-extrabold text-primary">
                {stageLabel(p.stageKey)}
              </span>
            </div>
            <div className="t-section text-ink">{p.name}</div>
            <div className="t-sub text-text-3">
              {[
                p.address,
                p.households ? `${p.households.toLocaleString("ko-KR")}세대 예정` : null,
              ]
                .filter(Boolean)
                .join(" · ") || gu}
            </div>
            {p.summary && (
              <p className="line-clamp-2 t-sub text-text-2">{p.summary}</p>
            )}
          </div>
        ))}
      </div>
      {hasSeed && (
        <p className="mt-1.5 px-1 t-caption text-text-3">
          {seedAsOf ? `${seedAsOf} ` : ""}공개자료(정비사업 정보몽땅·지자체 고시 등) 취합 기준
          참고 정보예요 — 최신 단계와 다를 수 있어요.
        </p>
      )}
      <Link
        href="/redevelopment"
        className="mt-2 inline-block px-1 t-body font-bold text-primary"
      >
        정비사업 지도에서 전체 보기 →
      </Link>
    </section>
  );
}
