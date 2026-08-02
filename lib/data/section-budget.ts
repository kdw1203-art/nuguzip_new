import { logger } from "@/lib/log";

/* ============================================================
   곁다리 섹션 조회의 세 갈래 상태 + 공유 벽시계 예산.

   왜 이게 필요한가 (2026-07-26 프로덕션 장애에서 배운 것):

   1) **조회 실패는 데이터 없음이 아니다.**
      화면 곳곳이 `.catch(() => [])` 로 실패를 빈 배열로 바꾸고 있었다.
      그러면 UI 는 "등록된 매물이 없습니다" 나 "준비 중" 을 그린다. 그건
      우리가 확인한 사실이 아니다 — 우리는 *못 읽었을* 뿐이다. 방문자는
      없다고 믿고 떠나고, 크롤러는 그 문장을 색인에 넣는다.

   2) **느린 조회는 죽은 페이지가 된다.**
      DB 가 포화되면 조회 하나가 읽기 타임아웃(25초)을 꽉 채운다. 곁다리를
      Promise.all 로 묶어두면 페이지 전체가 그동안 아무것도 못 그린다.
      방문자 눈에는 "느림"이 아니라 "먹통"이고, 크롤러에게는 응답 없음이라
      5xx 보다도 나쁘다(5xx 는 최소한 "나중에 다시 와라"라는 뜻이라도 된다).

   그래서 이 모듈은 두 가지를 함께 준다:
     - settle(): 실패를 삼키지 않고 `{ ok: false }` 로 **표시**한다. 호출부는
       "없음"과 "실패"를 다른 문장으로 그려야 한다.
     - startDeadline(): 곁다리 여러 개가 **함께** 쓰는 예산. 예산을 넘긴
       섹션만 실패로 접고 페이지는 제때 그린다.

   핵심 데이터(그 페이지의 존재 이유)에는 쓰지 말 것. 그건 실패하면 삼키지
   말고 던져서 5xx 가 되어야 한다.
   ============================================================ */

export type Settled<T> = { ok: true; data: T } | { ok: false };

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * 예산 초과로 **우리가** 끊은 요청의 오류인가. supabase-js 는 abort 를 예외로
 * 던지기도 하고(fetch 단계) `error.message` 에 "AbortError: ..." 를 담아
 * 돌려주기도 한다 — 로더가 그 메시지로 throw 하면 여기서 잡힌다.
 * 어느 쪽이든 "조회가 깨졌다"가 아니라 "설계대로 접혔다"로 기록해야 한다.
 */
function isAbortError(e: unknown): boolean {
  if (e instanceof DOMException && e.name === "AbortError") return true;
  if (e instanceof Error) {
    /* TimeoutError(읽기 자체 상한)는 여기 넣지 않는다 — 그건 DB 가 느리다는
       진짜 사건이라 error 로 남아야 한다. abort 는 우리가 끊은 것만 해당한다. */
    if (e.name === "AbortError") return true;
    if (/abort/i.test(e.message)) return true;
    if (e.cause instanceof SectionBudgetExpiredError) return true;
  }
  return false;
}

/** 곁다리 섹션들이 공유하는 기본 예산. 개별 읽기 타임아웃(25초)보다 훨씬 짧다. */
export const SIDE_SECTION_BUDGET_MS = 8_000;

/**
 * 공유 예산을 넘겨서 접힌 경우에 던지는 에러 — "조회가 깨졌다"와는 다른 사건이다.
 *
 * 왜 굳이 나누는가: 예산 초과는 설계대로 동작한 것이다(느린 곁다리를 접고 페이지를
 * 제때 그렸다). 그런데 이걸 logger.error 로 남기면 Vercel 런타임 에러 목록에
 * 그대로 쌓여, 정작 고쳐야 할 진짜 실패가 그 잡음에 묻힌다. 초과는 warn 으로
 * 남겨 "느리다"는 신호로 읽히게 하고, error 는 진짜 실패에만 쓴다.
 * 화면 동작은 그대로다 — 어느 쪽이든 `{ ok: false }` 이고, 호출부는 "없음"이
 * 아니라 "지금 못 읽었다"를 그린다.
 */
export class SectionBudgetExpiredError extends Error {
  constructor(ms: number) {
    super(`곁다리 섹션 공유 예산 ${ms}ms 초과`);
    this.name = "SectionBudgetExpiredError";
  }
}

export type Deadline = {
  /** 예산을 넘기면 거절되는 프로미스. settle() 에 그대로 넘긴다. */
  readonly expired: Promise<never>;
  /**
   * 예산이 다하면 중단되는 신호 (항목 25). 로더의 Supabase 쿼리에
   * `.abortSignal(deadline.signal)` 로 넘기면, 예산 초과로 접힌 섹션의
   * PostgREST 요청이 **실제로 끊긴다**. 이게 없으면 페이지는 제때 반환돼도
   * 버려진 요청이 읽기 총 상한(최대 45초)까지 살아서 DB 연결을 붙잡는다 —
   * 느린 DB 에서 연결 고갈 연쇄가 나는 이유였다.
   * (resilient-fetch 가 이 신호를 자체 상한과 병합하고, 호출자 취소는
   * 재시도하지 않는다 — 배관은 이미 있다.)
   */
  readonly signal: AbortSignal;
  /** 타이머 해제. **반드시** 호출해야 응답이 늦게 끝나지 않는다. */
  done(): void;
};

/**
 * 공유 마감시계를 시작한다.
 *
 * 반환된 `expired` 는 여러 settle() 이 동시에 race 해도 안전하다(같은 거절을
 * 여러 handler 가 잡는 건 정상이다). 다만 아무도 안 잡은 채 거절되면
 * unhandledRejection 이 되므로 내부에서 no-op catch 를 하나 붙여 둔다.
 */
export function startDeadline(ms: number = SIDE_SECTION_BUDGET_MS): Deadline {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const controller = new AbortController();
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      /* 거절보다 먼저 중단시킨다 — settle 의 race 는 어느 쪽이 이기든
         SectionBudgetExpiredError/AbortError 를 모두 "예산 초과"로 읽는다. */
      controller.abort(new SectionBudgetExpiredError(ms));
      reject(new SectionBudgetExpiredError(ms));
    }, ms);
  });
  expired.catch(() => {});
  return {
    expired,
    signal: controller.signal,
    done() {
      clearTimeout(timer);
      /* 중단시키지 않는다 — done() 은 "다 끝났다"는 뜻이지 취소가 아니다. */
    },
  };
}

/**
 * 실패를 **삼키지 않고 표시하는** 조회 래퍼.
 *
 * @param what   로그에 남길 사람이 읽는 이름 (예: "래미안 실거래 이력")
 * @param work   실제 조회
 * @param expired startDeadline().expired — 넘기면 공유 예산이 적용된다
 */
export async function settle<T>(
  what: string,
  work: Promise<T>,
  expired?: Promise<never>,
): Promise<Settled<T>> {
  try {
    return {
      ok: true,
      data: expired ? await Promise.race([work, expired]) : await work,
    };
  } catch (e) {
    /* 예산 초과와 조회 실패를 같은 심각도로 남기지 않는다. 앞의 것은 설계대로
       접힌 것(느리다는 신호), 뒤의 것은 고쳐야 할 사건이다. 섹션 이름을 앞에
       붙여 어느 곁다리가 예산을 잡아먹는지 로그만 보고 알 수 있게 한다. */
    if (e instanceof SectionBudgetExpiredError || isAbortError(e)) {
      logger.warn(`[section] ${what} 예산 초과로 접음: ${errText(e)}`);
      return { ok: false };
    }
    logger.error(
      `[section] ${what} 조회 실패: ${e instanceof Error ? e.message : String(e)}`,
    );
    return { ok: false };
  }
}

/** `{ ok: false }` 를 안전한 기본값으로 펼치되, 실패 여부는 따로 알려준다. */
export function unwrap<T>(r: Settled<T>, fallback: T): T {
  return r.ok ? r.data : fallback;
}
