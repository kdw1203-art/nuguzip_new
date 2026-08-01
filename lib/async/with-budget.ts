/**
 * 시간 상한(budget)을 씌운 대기 — "무응답"을 "응답"으로 바꾸기 위한 도구.
 *
 * 서버리스에서 오래 걸리는 작업을 그냥 끝까지 기다리면, 플랫폼 상한(Vercel 300초)에
 * 걸린 순간 프로세스가 통째로 죽는다. 그 결과는 "느린 응답"이 아니라 **응답 없음**이다:
 *   - 크롤러 쪽에서는 `Status 0 · HTTP 응답을 받지 못했습니다(네트워크 오류)` 로 보이고,
 *   - 크론에서는 마무리 로그(logIngest)조차 못 남겨서, 나중에 보면
 *     "실행됐다가 잘렸다"와 "아예 안 돌았다"가 구분되지 않는다.
 *
 * 상한을 미리 두면 그 자리에서 **사실대로 말할 기회**가 생긴다 —
 * 503 + Retry-After 는 "지금은 못 준다, 나중에 오라"는 분명한 말이고,
 * `status: "error", message: "시간 초과로 중단"` 은 남는 기록이다.
 *
 * 주의: 상한을 넘겨도 원본 작업을 **취소하지는 않는다**(취소할 방법이 없다).
 * 다만 호출부가 곧 응답을 반환하고 나면 서버리스 인스턴스와 함께 정리된다.
 */

export type BudgetResult<T> =
  | { state: "ok"; value: T }
  | { state: "timeout" }
  | { state: "error"; error: unknown };

/**
 * 약속 하나에 시간 상한을 씌운다. 상한을 넘겨도 원본을 **취소하지는 않는다** —
 * 취소할 방법이 없기도 하고, 뒤늦게 끝나면 그 결과는 그냥 버려질 뿐이다.
 * 다만 뒤늦은 거절이 unhandled rejection 으로 프로세스에 올라가지 않도록
 * 빈 catch 를 붙여 둔다.
 *
 * 동기 예외까지 받으려면 `withBudget(Promise.resolve().then(() => f()), ms)` 처럼
 * 감싸서 넘긴다(호출부에서 이미 그렇게 쓰고 있다).
 */
export async function withBudget<T>(p: Promise<T>, ms: number): Promise<BudgetResult<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const settled: Promise<BudgetResult<T>> = p.then(
    (value) => ({ state: "ok" as const, value }),
    (error: unknown) => ({ state: "error" as const, error }),
  );
  /* 늦게 도착한 거절을 삼킨다(위 settled 와 별개의 체인이라 따로 필요하다). */
  void p.catch(() => undefined);
  const timeout = new Promise<BudgetResult<T>>((resolve) => {
    timer = setTimeout(() => resolve({ state: "timeout" as const }), ms);
  });
  try {
    return await Promise.race([settled, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * 크론 한 번의 작업에 주는 시간(ms).
 *
 * 크론 라우트들은 `maxDuration = 300` 이라 300초에서 강제 종료된다. 그 지점에서
 * 죽으면 마무리 로그를 남길 기회 자체가 없어진다 — 어드민 신선도 화면에서
 * "안 돌았다"로 보이는 실행들이 실은 여기서 잘린 것들이다. 270초에서 스스로
 * 접으면 남은 30초 동안 "시간 초과로 중단, 다음 실행에서 이어서" 를 기록할 수 있다.
 *
 * 중간에 접어도 안전한 이유: 이 크론들은 별도 커서 테이블 없이 **적재한 흔적 자체가
 * 커서**다(이미 채운 (시군구, 계약월) 조합은 건너뛰고, 상세 백필은 스탬프 없는 행만
 * 고른다). 그래서 배치를 중간에 버려도 이중 계상이나 건너뜀이 생기지 않는다.
 */
/* 2026-08-01: 270초 → 240초. 결과 기록(logIngest)이 무제한이던 시절 "남는
   30초"가 실제로는 모자랐다 — 기록 경로가 밀리면 30초를 넘겨 함수째 죽었다.
   기록에 10초 상한을 넣었지만(logIngest), 마무리 구간(요약 계산 + 기록 +
   응답 직렬화)에 60초를 주는 편이 300초 상한 아래에서 확실히 안전하다. */
export const CRON_WORK_BUDGET_MS = 240_000;
