/* [OPT-05] 하우스 스켈레톤 — 동적 렌더 대기 중 흰 화면 대신 구조를 먼저 그린다.
   토큰만 사용(bg-surface/border-line) — 다크모드 자동 대응. */
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-5xl animate-pulse space-y-4 px-4 py-8" aria-busy="true" aria-label="포인트 사용처 불러오는 중">
      <div className="h-8 w-48 rounded-lg bg-surface" />
      <div className="h-4 w-72 max-w-full rounded bg-surface" />
      <div className="h-40 rounded-2xl border border-line bg-surface" />
      <div className="h-28 rounded-2xl border border-line bg-surface" />
      <div className="h-28 rounded-2xl border border-line bg-surface" />
    </div>
  );
}
