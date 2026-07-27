/**
 * Supabase(PostgREST) 요청용 fetch 래퍼 — 상한 + 일시적 오류 재시도.
 *
 * ── 왜 필요한가 (2026-07-26 프로덕션 로그 기준) ─────────────────────────────
 * 하루치 런타임 오류를 모아 보면 두 종류가 압도적이다.
 *
 *  1) `PGRST002 — Could not query the database for the schema cache. Retrying.`
 *     106건 / 26명. PostgREST 가 스키마 캐시를 못 읽은 상태다. 메시지에 적힌
 *     "Retrying." 그대로 **일시적**이고, 잠깐 뒤 같은 요청은 성공한다.
 *     PostgREST 는 이 상태를 HTTP 503 으로 돌려준다.
 *  2) `Vercel Runtime Timeout Error: Task timed out after 300 seconds`
 *     107건 / 22명. DB 가 밀리는데 요청에 상한이 없어서 함수가 300초를 통째로
 *     태우고 죽는다. 그 300초 동안 사용자는 빈 화면을 본다.
 *
 * 그래서 이 래퍼는 두 가지만 한다.
 *  - **읽기(GET/HEAD)에만** 상한을 걸어 300초 소각을 막는다.
 *  - 읽기가 503/504 로 돌아오면 짧은 백오프로 최대 2번 더 시도한다.
 *
 * ── 왜 읽기에만 거는가 ──────────────────────────────────────────────────────
 * 쓰기를 재시도하면 같은 행을 두 번 넣을 수 있고, 쓰기에 상한을 걸면 클라이언트는
 * 끊겼는데 서버는 커밋한 애매한 상태가 생긴다. GET/HEAD 는 멱등이라 두 위험이
 * 모두 없다. POST/PATCH/DELETE 는 손대지 않고 그대로 흘려보낸다.
 *
 * ── 재시도해도 안 되면 ──────────────────────────────────────────────────────
 * 실패는 실패로 올려보낸다. 호출부(로더/스토어)는 그것을 "조회 실패"로 표시하지
 * **"데이터 없음"이나 "준비 중"으로 위장하지 않는다.** 못 읽은 것과 없는 것은
 * 다른 사실이다. 재시도는 실패를 감추는 장치가 아니라, 일시적인 것만 걸러 내서
 * 진짜 실패만 남기는 장치다.
 */
import "server-only";

export type ResilientFetchOptions = {
  /** 읽기 **한 시도**의 상한(ms). 0 이하면 시도별 상한 없음. */
  timeoutMs: number;
  /** 읽기 재시도 횟수(최초 시도 제외). */
  retries?: number;
  /**
   * 재시도·백오프를 **전부 합친** 읽기 한 건의 총 상한(ms). 0 이하면 총 상한 없음.
   *
   * ── 왜 시도별 상한만으로는 모자랐나 (2026-07-27 배포 실패) ──────────────
   * 시도별 25초 + 재시도 2회 + 백오프(0.3s·0.9s) = 최악 76.2초였다. 그런데
   * Next 의 페이지별 prerender 예산은 기본 60초다. 즉 **읽기 예산이 페이지
   * 예산보다 컸다.** 그 결과 DB 가 느려지면 로더가 "조회 실패"를 정직하게
   * 렌더할 기회조차 없이 페이지가 통째로 시간 초과 나고, 세 번 재시도 끝에
   * `next build` 가 죽었다 — 느린 DB 가 배포 장애로 번진 것이다.
   *
   * 총 상한이 있으면 읽기는 정해진 시간 안에 반드시 끝난다(성공이든 실패든).
   * 그러면 페이지 예산 안에서 실패가 **화면으로** 드러난다. 그게 맞다.
   */
  totalBudgetMs?: number;
};

/** 일시적이라고 보고 다시 시도할 상태 코드 — PostgREST 스키마 캐시(503)·게이트웨이(502/504) */
const RETRYABLE_STATUS = new Set([502, 503, 504]);

/** 재시도 간격(ms). 짧게 두 번 — DB 가 밀리는 중에 부하를 더 얹지 않는다. */
const BACKOFF_MS = [300, 900];

function methodOf(input: RequestInfo | URL, init?: RequestInit): string {
  if (init?.method) return init.method.toUpperCase();
  if (typeof Request !== "undefined" && input instanceof Request) {
    return input.method.toUpperCase();
  }
  return "GET";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function makeResilientFetch(
  opts: ResilientFetchOptions,
): (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> {
  const retries = Math.max(0, Math.min(opts.retries ?? BACKOFF_MS.length, BACKOFF_MS.length));
  const totalBudgetMs = Math.max(0, opts.totalBudgetMs ?? 0);

  return async function resilientFetch(input, init) {
    const method = methodOf(input, init);
    const isRead = method === "GET" || method === "HEAD";

    /* 쓰기는 원본 그대로 — 상한도 재시도도 걸지 않는다. */
    if (!isRead) return fetch(input, init);

    const startedAt = Date.now();
    /** 남은 총 예산(ms). 총 상한이 없으면 Infinity. */
    const budgetLeft = () =>
      totalBudgetMs > 0
        ? totalBudgetMs - (Date.now() - startedAt)
        : Number.POSITIVE_INFINITY;

    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      /* 총 예산이 남아 있지 않으면 새 시도를 시작하지 않는다. 시작해 봐야
         페이지 예산만 더 태우고, 결과는 어차피 실패다. */
      const left = budgetLeft();
      if (left <= 0) break;

      /* 시도마다 새 상한을 만든다. 하나를 재사용하면 첫 시도에서 만료된 신호가
         남은 시도를 즉시 죽인다. 시도별 상한과 남은 총 예산 중 **짧은 쪽**을
         쓴다 — 마지막 시도가 총 예산을 넘겨 버리면 총 상한이 무의미해진다. */
      let signal = init?.signal ?? undefined;
      const attemptMs = Math.min(
        opts.timeoutMs > 0 ? opts.timeoutMs : Number.POSITIVE_INFINITY,
        left,
      );
      if (Number.isFinite(attemptMs)) {
        const ours = AbortSignal.timeout(attemptMs);
        /* 호출자가 이미 signal 을 넘겼으면 둘 다 살린다 — 우리 상한이 남의
           취소를 덮어써 버리면 요청 취소가 조용히 안 먹는다. */
        signal = init?.signal ? AbortSignal.any([init.signal, ours]) : ours;
      }

      try {
        const res = await fetch(input, { ...init, signal });
        if (!RETRYABLE_STATUS.has(res.status) || attempt === retries) return res;
        /* 재시도할 응답의 본문은 읽지 않고 버린다 — 안 버리면 연결이 붙잡힌다. */
        await res.body?.cancel().catch(() => undefined);
      } catch (e) {
        lastError = e;
        /* 호출자가 직접 취소한 것이면 재시도하지 않는다(요청이 이미 버려졌다). */
        if (init?.signal?.aborted) throw e;
        if (attempt === retries) throw e;
      }
      /* 백오프도 총 예산 안에서만 잔다 — 예산이 다 됐으면 자지 않고 끝낸다. */
      const pause = Math.min(BACKOFF_MS[attempt] ?? 900, Math.max(0, budgetLeft()));
      if (pause <= 0) break;
      await sleep(pause);
    }
    /* 여기까지 왔다면 총 예산이 소진된 것이다(그 외 경로는 return/throw 한다).
       실패는 실패로 올려보낸다 — 호출부가 "조회 실패"로 표시할 수 있게. */
    if (lastError !== undefined) {
      throw lastError instanceof Error ? lastError : new Error(String(lastError));
    }
    throw new Error(`Supabase 조회 시간 초과 (총 상한 ${totalBudgetMs}ms)`);
  };
}
