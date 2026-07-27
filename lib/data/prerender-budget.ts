import { withBudget } from "@/lib/async/with-budget";
import { logger } from "@/lib/log";

/* ============================================================
   프리렌더 조회 상한 — "느린 DB 가 배포를 깨뜨리지 못하게" 하는 장치.

   ── 왜 만들었나 (배포 #263) ────────────────────────────────────
   `revalidate` 만 있고 동적 파라미터가 없는 라우트는 `next build` 가 빌드
   타임에 프리렌더한다. Next 는 페이지 하나당 정적 생성에 60초 상한을 두고
   (staticPageGenerationTimeout 기본값 60), 그 안에 못 끝나면 빌드를 **실패**시킨다.

   배포 #263 이 그렇게 죽었다. DB 가 밀린 그 몇 분 동안 아래 페이지들이
   각자 60초를 다 태웠고, 빌드가 통째로 깨져 릴리스 자체가 나가지 못했다.

     /notes/best · /analysis/temperature · /complex/compare · /digest/archive
     (/digest 는 b64643a 에서 같은 취지로 따로 손봤다)

   느린 DB 는 페이지의 **내용**을 떨어뜨릴 수는 있어도 **배포**를 막아서는
   안 된다. DB 가 나쁜 1분을 보내는 동안 사이트 전체가 릴리스 불가가 되는
   구조는 그 자체가 결함이다.

   ── 다른 장치(b64643a)와의 관계 ────────────────────────────────
   같은 사고를 두고 아래쪽에서도 손을 봤다. supabase-read 가 빌드 단계
   (NEXT_PHASE=phase-production-build)에서 읽기 한 건을 8초/시도·20초/총으로
   묶고, next.config 의 staticPageGenerationTimeout 을 120 으로 올렸다.
   그쪽은 **조회 한 건**의 상한이고, 여기는 **로더 한 개**의 상한이다.
   로더가 조회를 여러 번 직렬로 하면 한 건씩은 상한 안이어도 페이지는 넘길 수
   있어서, 두 층이 다 필요하다.

   ── 상한을 45초로 잡은 이유 ────────────────────────────────────
   페이지 상한 120초의 3분의 1이 조금 넘는다. 한 페이지에서 로더가 둘 직렬로
   돌아도 90초로 들어온다. 20초로 두면 아래층 상한(20초/조회)과 같아져서,
   조회를 두 번 하는 로더가 정상 동작 중에도 여기서 먼저 끊긴다 — 성공할 수
   있었던 조회를 실패로 그리게 된다.
   정상일 때 이 조회들은 수 초 안에 끝나므로, 45초를 넘겼다는 건 "느린 날"이
   아니라 "지금은 안 되는 날"이라는 뜻이다.

   ── 절대 규칙 ──────────────────────────────────────────────────
   상한에 걸린 조회를 **빈 결과로 바꾸지 않는다**. 빈 결과로 바꾸면 화면이
   "아직 데이터가 없습니다" 라고 단정하는데, 그건 우리가 확인한 사실이 아니다 —
   우리는 *못 읽었을* 뿐이다. 방문자는 없다고 믿고 떠나고 크롤러는 그 문장을
   색인에 넣는다. 그래서 실패는 반드시 `{ ok: false }` 로 표시해서 내려보내고,
   호출부는 LOAD_FAILED_LINE 을 그린다.

   withBudget 은 원본 조회를 취소하지 못한다(취소할 방법이 없다). 늦게 끝난
   결과는 그냥 버려지고, 빌드 워커가 끝나면 함께 정리된다.
   ============================================================ */

/** 프리렌더 로더 하나에 주는 시간(ms). staticPageGenerationTimeout(120초) 아래. */
export const PRERENDER_LOAD_BUDGET_MS = 45_000;

/**
 * 조회 실패·시간 초과일 때 화면에 그대로 적는 문장.
 *
 * 다섯 페이지가 같은 문장을 쓰는 이유: "없다"와 "못 읽었다"의 구분은
 * 페이지마다 다르게 적으면 흐려진다. 빈 상태 문구와는 절대 섞지 않는다.
 */
export const LOAD_FAILED_LINE = "지금은 불러오지 못했어요 · 잠시 후 다시 시도해 주세요";

export type PrerenderLoad<T> =
  | { ok: true; data: T }
  | { ok: false; reason: "timeout" | "error"; message: string };

/**
 * 프리렌더되는 페이지의 데이터 조회를 상한 안에서 수행한다.
 *
 * @param what 로그에 남길 이름 — 이미 쓰던 라우트 접두사를 그대로 넣는다(예: "[/digest]")
 * @param work 실제 조회. 동기 예외까지 받으려고 함수로 받는다.
 *
 * 시간 초과와 조회 실패를 **다른 문장으로** 남긴다. 앞은 "제때 못 읽었다"(느림),
 * 뒤는 "읽다가 깨졌다"(고장)라서 대응이 다르다. 화면 동작은 둘 다 같다 —
 * 어느 쪽이든 `{ ok: false }` 이고, 호출부는 "없음"이 아니라 "못 읽음"을 그린다.
 */
export async function loadWithinPrerenderBudget<T>(
  what: string,
  work: () => Promise<T>,
  budgetMs: number = PRERENDER_LOAD_BUDGET_MS,
): Promise<PrerenderLoad<T>> {
  const run = await withBudget(
    Promise.resolve().then(() => work()),
    budgetMs,
  );
  if (run.state === "ok") return { ok: true, data: run.value };
  /* 문장 뒤에 객체를 하나 더 붙이는 이유: logger 는 문자열 인자를 통째로 마스킹한다
     (lib/log.ts 의 mask() — "[/di***)." 처럼 남는다). 객체는 민감 키만 가리고 나머지는
     그대로 통과하므로, 어느 라우트가 왜 접혔는지는 이쪽으로 남는다. */
  if (run.state === "timeout") {
    const message = `조회가 ${budgetMs}ms 안에 끝나지 않았습니다`;
    logger.error(
      `${what} ${message} — 데이터가 없는 것이 아니라 제때 읽지 못했습니다. 빌드는 계속합니다(배포 #263 재발 방지).`,
      { where: what, event: "prerender-timeout", budgetMs },
    );
    return { ok: false, reason: "timeout", message };
  }
  const message = run.error instanceof Error ? run.error.message : String(run.error);
  logger.error(`${what} 조회 실패 — 데이터가 없는 것이 아니라 조회가 실패했습니다:`, {
    where: what,
    event: "prerender-error",
    message,
  });
  return { ok: false, reason: "error", message };
}
