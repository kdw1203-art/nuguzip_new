/**
 * [B32] 동네이야기 도배 방지 — 같은 사람이 같은 말을, 혹은 너무 자주 올리는 것을 막는다.
 *
 * 왜 필요한가: /api/community/posts 에는 금칙어 검사만 있고 **횟수·중복** 검사가
 * 없었다. 로그인만 하면 같은 글을 몇 초 간격으로 몇 번이든 올릴 수 있었고,
 * 실제로 피드는 최신순이라 한 사람이 동네 하나를 통째로 덮을 수 있는 구조다.
 *
 * 판정은 여기(순수 함수)에 두고, 조회는 호출자가 넘긴다 — 그래야 테스트가
 * DB 없이 돌고, 백엔드(파일/Supabase)가 달라도 규칙이 하나로 유지된다.
 *
 * 설계 원칙 두 가지:
 *  1) **차단 사유를 사람 말로 돌려준다.** "요청이 너무 많습니다"는 쓴 사람이
 *     무엇을 고쳐야 하는지 모른다. 몇 분 뒤에 되는지, 무엇이 겹쳤는지 적는다.
 *  2) **조회 실패는 통과시킨다(fail-soft).** DB 가 잠깐 흔들렸다고 글쓰기를
 *     닫는 대가가, 그 순간 도배가 몇 건 새는 대가보다 크다. 대신 호출자가
 *     로그를 남긴다.
 */

/** 최근 글 판정에 필요한 최소 정보 — 저장 백엔드에 의존하지 않는다. */
export type RecentPost = {
  title: string;
  body: string;
  /** ISO 문자열 또는 ms epoch */
  createdAt: string | number;
};

export type FloodVerdict =
  | { ok: true }
  | { ok: false; reason: "duplicate" | "too_many"; message: string; retryAfterSec: number };

/** 같은 글인지 볼 때 쓰는 정규화 — 공백·줄바꿈·문장부호 차이는 같은 글로 본다. */
export function normalizeForDupe(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\s​]+/g, "")
    .replace(/[.,!?~·…"'“”‘’()\[\]{}<>-]/g, "");
}

export const FLOOD_WINDOW_MS = 10 * 60_000;
/** 10분 안에 올릴 수 있는 글 수. 4번째부터 막는다. */
export const FLOOD_MAX_IN_WINDOW = 3;
/** 같은 내용을 다시 올릴 수 없는 기간 */
export const DUPE_WINDOW_MS = 24 * 60 * 60_000;

function toMs(v: string | number): number {
  return typeof v === "number" ? v : Date.parse(v) || 0;
}

/**
 * 지금 올리려는 글이 도배인지 판정한다.
 *
 * @param draft  올리려는 글(제목·본문)
 * @param recent 같은 작성자의 최근 글들 (기간 제한은 호출자가 이미 걸었어도 되고,
 *               넉넉히 넘겨도 된다 — 여기서 다시 창을 자른다)
 * @param now    현재 시각(ms). 테스트에서 고정하기 위해 주입받는다.
 */
export function judgeFlood(
  draft: { title: string; body: string },
  recent: readonly RecentPost[],
  now: number,
): FloodVerdict {
  const dupeCutoff = now - DUPE_WINDOW_MS;
  const floodCutoff = now - FLOOD_WINDOW_MS;

  const nTitle = normalizeForDupe(draft.title);
  const nBody = normalizeForDupe(draft.body);

  /* 1) 완전 중복 — 제목과 본문이 **둘 다** 같을 때만 막는다.
     제목만 같은 것("오늘 시세")은 흔한 일이고, 본문만 같은 것은 짧은 인사말에서
     자연히 생긴다. 둘 다 같으면 그건 다시 올린 것이다. */
  for (const p of recent) {
    const t = toMs(p.createdAt);
    if (t < dupeCutoff) continue;
    if (normalizeForDupe(p.title) === nTitle && normalizeForDupe(p.body) === nBody) {
      return {
        ok: false,
        reason: "duplicate",
        message:
          "같은 내용의 글을 이미 올리셨어요. 내용을 바꾸거나, 기존 글을 수정해 주세요.",
        retryAfterSec: Math.max(1, Math.ceil((t + DUPE_WINDOW_MS - now) / 1000)),
      };
    }
  }

  /* 2) 빈도 — 10분에 3건까지. 창 안에서 가장 오래된 글이 창을 벗어나면 풀린다. */
  const inWindow = recent
    .map((p) => toMs(p.createdAt))
    .filter((t) => t >= floodCutoff)
    .sort((a, b) => a - b);
  if (inWindow.length >= FLOOD_MAX_IN_WINDOW) {
    const oldest = inWindow[0]!;
    const retryAfterSec = Math.max(1, Math.ceil((oldest + FLOOD_WINDOW_MS - now) / 1000));
    const mins = Math.ceil(retryAfterSec / 60);
    return {
      ok: false,
      reason: "too_many",
      message: `짧은 시간에 글을 너무 많이 올리셨어요. ${mins}분 뒤에 다시 쓸 수 있어요.`,
      retryAfterSec,
    };
  }

  return { ok: true };
}
