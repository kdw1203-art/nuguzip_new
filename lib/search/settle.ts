"use client";

import { useEffect, useMemo, useState } from "react";

/**
 * 검색어가 "굳을 때까지" 기다리는 공통 규칙 (최적화 50선 39번).
 *
 * ── 왜 값을 한 군데로 모으는가 ────────────────────────────────────────────
 * 저장소에는 검색 디바운스가 180·200·250·280ms 로 흩어져 있었다. 값이 다른
 * 이유는 어디에도 적혀 있지 않았다 — 그냥 각자 적은 숫자였다. 이유 없이 다른
 * 숫자는 다음 사람이 어느 쪽에 맞춰야 할지 알 수 없게 만든다.
 *
 * ── 진짜 문제는 숫자가 아니라 한글 조합이었다 ────────────────────────────
 * 디바운스는 "마지막 입력 후 N ms 조용하면 보낸다"이다. 타이핑 간격이 N 보다
 * 길면 타이머가 매번 만료되므로 **글자마다 요청이 나간다**. 그리고 한국어
 * 입력은 여기서 훨씬 나쁘다: 2벌식으로 "래미안"을 치면 IME 가 ㄹ → 라 → 래 →
 * 램 → 래미 → 래민 → 래미안 을 차례로 만들고, React 는 그 중간 상태마다
 * onChange 를 준다. 중간 상태는 **검색어로서 의미가 없다** — 아무도 "램"을
 * 찾고 있지 않다.
 *
 * 로컬 프로덕션 실측(CDP Input.imeSetComposition 으로 실제 조합 상태 재현,
 * /search 통합검색, 키 7번):
 *   | 간격 220ms | 요청 1건 — ["래미안"] |
 *   | 간격 380ms | 요청 7건 — ["ㄹ","라","래","램","래미","래민","래미안"] |
 * 380ms 는 낯선 단지명을 더듬어 칠 때의 흔한 속도다. 즉 통합검색(단지+매물+
 * 노트+뉴스 4종 조회)을 "ㄹ"로 한 번, "라"로 한 번… 여섯 번 헛돌린 것이다.
 *
 * ── 고르지 않은 해법 ─────────────────────────────────────────────────────
 * "조합 중에는 아예 안 보낸다"가 가장 단순해 보이지만 **틀렸다**. 한글 IME 는
 * 마지막 음절의 조합을 열어 둔 채로 대기한다 — 사용자가 "래미안"까지 치고
 * 손을 떼면 compositionend 가 오지 않는다. 그 상태로 막으면 검색이 영영 안
 * 나간다. 기능이 조용히 죽는 쪽이 요청이 좀 더 나가는 쪽보다 나쁘다.
 * 그래서 **막지 않고 더 기다린다**: 조합 중이면 대기 시간을 늘려, 손을 멈춘
 * 뒤에는 반드시 나가되 치는 도중에는 안 나가게 한다.
 */

/** 조합이 끝난(또는 라틴 문자) 입력의 표준 대기 시간. */
export const SEARCH_DEBOUNCE_MS = 250;

/**
 * 한글 조합이 열려 있는 동안의 대기 시간. 조합 중간 상태는 버릴 값이므로
 * 더 오래 기다려도 손해가 없고, 사람이 키를 누르는 간격(빠름 120 · 보통 220 ·
 * 더듬 380ms)보다 넉넉히 길어야 중간 상태가 새어 나가지 않는다.
 * 500ms 로 두면 위 세 구간 전부에서 타이머가 리셋되고, 손을 멈추면 0.5초 뒤에
 * 나간다 — 사람이 "안 되나?" 하고 느끼기 전 구간이다.
 */
export const SEARCH_COMPOSING_DEBOUNCE_MS = 500;

/**
 * 입력창에 그대로 펼쳐 붙이는 조합 이벤트 핸들러 + 굳은 검색어를 돌려준다.
 *
 * 반환한 `query` 는 "이제 서버에 물어봐도 되는 검색어"다. 아직 굳지 않았으면
 * 직전 값을 그대로 유지한다(빈 문자열로 되돌리지 않는다 — 그러면 이미 떠 있던
 * 결과가 깜빡이며 사라진다).
 * 입력이 비면 즉시 빈 문자열로 만든다 — 지웠는데 결과가 남아 있으면 그건
 * 낡은 결과를 사실인 것처럼 보여 주는 것이다.
 */
export function useSettledSearchQuery(
  raw: string,
  options?: { delayMs?: number; composingDelayMs?: number },
): {
  query: string;
  compositionProps: {
    onCompositionStart: () => void;
    onCompositionEnd: () => void;
  };
} {
  const delayMs = options?.delayMs ?? SEARCH_DEBOUNCE_MS;
  const composingDelayMs = options?.composingDelayMs ?? SEARCH_COMPOSING_DEBOUNCE_MS;

  const [composing, setComposing] = useState(false);
  const [query, setQuery] = useState(() => raw.trim());

  useEffect(() => {
    const next = raw.trim();
    /* 비운 건 기다릴 이유가 없다. 지운 즉시 반영한다. */
    if (!next) {
      setQuery("");
      return;
    }
    const wait = composing ? composingDelayMs : delayMs;
    const t = setTimeout(() => setQuery(next), wait);
    return () => clearTimeout(t);
  }, [raw, composing, delayMs, composingDelayMs]);

  const compositionProps = useMemo(
    () => ({
      onCompositionStart: () => setComposing(true),
      onCompositionEnd: () => setComposing(false),
    }),
    [],
  );

  return { query, compositionProps };
}
