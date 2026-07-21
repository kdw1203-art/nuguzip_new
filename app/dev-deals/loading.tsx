import { PageShell } from "../components/PageShell";

export default function DevDealsLoading() {
  return (
    <PageShell breadcrumb="홈 › 개발물건 중개" title="개발물건 중개 (B2B 디벨로퍼 매칭)">
      <div className="mb-4 h-4 w-3/4 animate-pulse rounded bg-[rgba(0,0,0,.06)]" />
      <div className="mb-5 flex flex-wrap gap-1.5">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-7 w-16 animate-pulse rounded-full bg-[rgba(0,0,0,.06)]"
          />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card p-4">
            <div className="h-4 w-1/2 animate-pulse rounded bg-[rgba(0,0,0,.06)]" />
            <div className="mt-3 h-5 w-3/4 animate-pulse rounded bg-[rgba(0,0,0,.06)]" />
            <div className="mt-2 h-3 w-1/3 animate-pulse rounded bg-[rgba(0,0,0,.06)]" />
            <div className="mt-4 h-8 w-1/2 animate-pulse rounded bg-[rgba(0,0,0,.06)]" />
          </div>
        ))}
      </div>
    </PageShell>
  );
}
