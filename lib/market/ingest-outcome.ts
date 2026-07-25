/**
 * 수집 실행 결과 판정 — 단일 정의 (#148).
 *
 * 이 파일이 따로 있는 이유: 같은 로그 한 줄을 화면 세 곳이 각자 해석하고 있었다.
 *
 *   /admin/data          status 를 그대로 초록/빨강으로 칠함
 *   /admin (ETL 패널)    `ok ? "정상" : skipped ? "건너뜀" : "오류"`
 *   /api/health          마지막 **성공** 만 보고 이후 실패는 아예 안 봄
 *
 * 셋 다 "부분 실패" 라는 상태를 표현할 수 없었다. 2026-07-25 02:59 MOLIT 실행이
 * 정확히 그 경우였다 — `status=error rows=2096`, 2,096행이 실제로 들어왔는데
 * 시군구 16곳 중 13곳이 실패했다. 첫 두 화면은 "아무것도 안 들어왔다" 로,
 * 헬스체크는 "정상" 으로 읽었다. 셋 다 틀렸다.
 *
 * 판정 규칙을 여기 한 군데만 두는 건 취향이 아니라 재발 방지다. 규칙이 세 벌이면
 * 다음에 한 벌만 고쳐지고 나머지는 또 갈라진다.
 *
 * 서버·클라이언트 어디서든 import 할 수 있게 순수 함수만 둔다 — DB 접근 없음,
 * "server-only" 없음.
 */

/**
 * 마지막 수집 실행의 결과. status(text) 하나로는 표현이 안 돼서 rows 와 함께 본다.
 *
 *  ok      정상 — 성공했고 새 행이 들어왔다
 *  partial 부분 실패 — 일부는 들어왔는데 일부 조각이 실패했다 (status=error && rows>0)
 *  noop    빈 실행 — 성공했는데 새로 들어온 게 0행 (이미 다 커버된 경우도 여기)
 *  failed  실패 — 아무것도 못 넣었다
 *  skipped 건너뜀 — 대개 인증키 미설정
 *  unknown 로그에 처음 보는 status 문자열이 들어왔다 (컬럼에 CHECK 제약이 없다)
 *  none    실행 기록 자체가 없다 — "성공" 도 "실패" 도 아닌, 모른다는 뜻
 */
export type IngestOutcome =
  | "ok"
  | "partial"
  | "noop"
  | "failed"
  | "skipped"
  | "unknown"
  | "none";

/**
 * 로그 message 에 적힌 조각 집계. 지어내지 않고 문자열에 실제로 있는 숫자만 읽는다.
 * (molit: `slice=8 시도=16 기존커버=0 빈응답=1 오류=13`)
 */
export interface RunTally {
  attempted: number | null;
  failed: number | null;
  empty: number | null;
  covered: number | null;
}

/**
 * 마지막 수집 실행이 어떤 결과였는지 — status 와 rows 를 **함께** 봐야 답이 나온다.
 *
 * molit 은 `errors > 0 ? "error" : inserted > 0 ? "ok" : "skipped"` 로 status 를 정한다
 * (lib/market/molit-transactions.ts). 오류가 하나라도 있으면 몇 행이 들어왔든 error 다.
 * 보수적으로 맞는 선택이지만, 그 status 만 화면에 옮기면 2,096행이 들어온 실행과
 * 한 행도 못 넣은 실행이 똑같은 빨간 칸이 된다. rows 를 같이 봐야 둘이 갈린다.
 */
export function classifyIngestRun(status: string, rows: number): IngestOutcome {
  const s = status.trim().toLowerCase();
  if (s === "error") return rows > 0 ? "partial" : "failed";
  if (s === "skipped") return "skipped";
  if (s === "ok") return rows > 0 ? "ok" : "noop";
  return "unknown";
}

/** 사람이 읽을 결과 라벨 — 화면 여러 곳에서 같은 말을 쓰게 한다 */
export const OUTCOME_LABEL: Record<IngestOutcome, string> = {
  ok: "정상",
  partial: "부분 실패",
  noop: "새 데이터 없음",
  failed: "실패",
  skipped: "건너뜀",
  unknown: "알 수 없음",
  none: "기록 없음",
};

/**
 * 결과별 표시색 — 부분 실패는 초록도 빨강도 아니다.
 * 화면마다 다른 색을 쓰면 같은 사건이 다른 심각도로 읽힌다.
 */
export const OUTCOME_COLOR: Record<IngestOutcome, string> = {
  ok: "#4ade80",
  partial: "#fb923c",
  noop: "#9aa6b8",
  failed: "#f87171",
  skipped: "#9aa6b8",
  unknown: "#9aa6b8",
  none: "#6b7688",
};

/** 결과 앞에 붙는 기호 — 색을 못 보는 환경(텍스트 로그·스크린리더)에서도 갈리게 */
export const OUTCOME_MARK: Record<IngestOutcome, string> = {
  ok: "●",
  partial: "▲",
  noop: "◦",
  failed: "▲",
  skipped: "◦",
  unknown: "◦",
  none: "◦",
};

const INT_AFTER = (key: string) => new RegExp(`(?:^|[\\s·])${key}=(\\d+)`);

function pickInt(message: string, key: string): number | null {
  const m = message.match(INT_AFTER(key));
  return m ? Number(m[1]) : null;
}

/**
 * 로그 message 에서 조각 집계를 읽는다. 형식이 다른 소스는 전부 null 이 나오고,
 * 화면은 그때 아무 말도 하지 않는다 — 없는 숫자를 만들어 채우지 않는다.
 */
export function parseRunTally(message: string | null | undefined): RunTally {
  const text = String(message ?? "");
  if (!text) return { attempted: null, failed: null, empty: null, covered: null };
  return {
    attempted: pickInt(text, "시도"),
    failed: pickInt(text, "오류"),
    empty: pickInt(text, "빈응답"),
    covered: pickInt(text, "기존커버"),
  };
}

/**
 * "16곳 중 13곳 실패" 처럼 한 줄로 읽히게. 집계가 없으면 null 을 돌려서
 * 화면이 조용히 넘어가게 한다.
 */
export function tallyText(tally: RunTally): string | null {
  const { attempted, failed, empty, covered } = tally;
  if (attempted == null) return null;
  const parts: string[] = [];
  if (failed != null && failed > 0) parts.push(`${failed}곳 실패`);
  if (empty != null && empty > 0) parts.push(`${empty}곳 빈응답`);
  if (covered != null && covered > 0) parts.push(`${covered}곳 기존커버`);
  if (parts.length === 0) return `${attempted}곳 모두 정상`;
  return `${attempted}곳 중 ${parts.join(" · ")}`;
}

/**
 * 이 실행 결과를 두고 "수집이 고장났다" 고 단정할 수 있는가.
 *
 * 부분 실패(partial)는 **여기서 true 가 아니다.** 2,096행이 들어온 실행을 장애로
 * 부르면 헬스체크가 상시 빨간불이 되고, 상시 빨간불은 아무도 안 본다 —
 * 진짜 정지했을 때 구분이 안 된다. 부분 실패는 별도 필드로 드러내되
 * 판정은 "한 행도 못 넣었다" 에만 건다.
 */
export function isHardFailure(outcome: IngestOutcome): boolean {
  return outcome === "failed";
}
