/**
 * A7 — 실험(A/B) 등록부.
 *
 * 실험은 **여기에 선언된 것만** 존재한다. 코드 아무 데서나 문자열 키를 만들어
 * 쓰지 못하게 하는 게 목적이다. 등록되지 않은 키를 물어보면 항상 대조군을 준다.
 *
 * ── 이 프로젝트에서 A/B 로 바꿔도 되는 것 / 안 되는 것 ───────────────
 * 바꿔도 되는 것: 문구·버튼 라벨·배치·순서처럼 **사실 주장이 아닌** 표현.
 * 바꾸면 안 되는 것: 가격·거래 건수·면적·시세 같은 숫자와 그 출처 표기.
 *   같은 페이지가 사람마다 다른 숫자를 말하면 그건 실험이 아니라 허위 정보다.
 *   실험은 "어떻게 말하느냐"만 나눈다. 무엇이 사실인지는 나누지 않는다.
 *
 * ── 배정 방식 ────────────────────────────────────────────────────
 * 결정론적 해시(lib/experiments/assign.ts)로 subject → 변형을 정한다. 서버·
 * 브라우저 어디서 계산해도 같은 답이 나오고, 저장소가 없어도 재현된다.
 * subject 는 로그인 사용자면 소문자 이메일, 아니면 localStorage 익명 ID 다.
 *
 * **쿠키를 쓰지 않는 이유**: 미들웨어가 Set-Cookie 가 실린 응답의 공개 캐시를
 * 포기하도록 되어 있다(lib/http/cache-policy.ts). 실험용 쿠키를 하나 심는 순간
 * 공개 문서 전부가 no-store 로 돌아가 CDN 캐시가 통째로 무력화된다.
 */

export type ExperimentVariant = {
  /** 변형 키 — 이벤트에 그대로 기록된다. 짧은 소문자 슬러그 */
  key: string;
  /** 배분 가중치(상대값). 합이 1일 필요는 없다 */
  weight: number;
  /** 사람이 읽는 설명 — 관리자 화면에 그대로 나온다 */
  label: string;
};

export type ExperimentDef = {
  key: string;
  /** 무엇을 알아보려는 실험인가 (관리자 화면 표시용) */
  hypothesis: string;
  /** 성공을 무엇으로 볼 것인가 — 이벤트 이름 */
  primaryMetricEvent: string;
  /** 노출로 볼 이벤트 이름 — 전환율의 분모 */
  exposureEvent: string;
  /** false 면 전원 대조군. 실험을 멈출 때 코드를 지우지 않고 이 값만 내린다 */
  enabled: boolean;
  /** 첫 번째 변형이 대조군이다 */
  variants: readonly [ExperimentVariant, ...ExperimentVariant[]];
};

/**
 * 첫 실험: 소프트 가입 유도 배너의 CTA 문구.
 *
 * 두 문구 모두 사실이다 — 가입은 무료이고, 콜백으로 원래 화면에 돌아온다.
 * 바뀌는 건 "이어서 하기"를 앞세울지 "무료"를 앞세울지의 순서뿐이다.
 */
export const EXPERIMENTS: readonly ExperimentDef[] = [
  {
    key: "signup_cta_copy",
    hypothesis:
      "소프트 가입 배너의 CTA 문구를 '이어하기' 중심에서 '무료' 중심으로 바꾸면 클릭률이 달라지는가",
    exposureEvent: "soft_signup_prompt_view",
    primaryMetricEvent: "soft_signup_prompt_click",
    enabled: true,
    variants: [
      { key: "control", weight: 1, label: "가입하고 이어하기 (기존)" },
      { key: "free_first", weight: 1, label: "무료로 가입하고 이어보기" },
    ],
  },
];

const BY_KEY = new Map(EXPERIMENTS.map((e) => [e.key, e]));

export function getExperiment(key: string): ExperimentDef | null {
  return BY_KEY.get(key) ?? null;
}

/** 등록부에 없거나 꺼진 실험의 기본값 — 항상 첫 변형(대조군) */
export function controlVariant(key: string): string {
  return BY_KEY.get(key)?.variants[0]?.key ?? "control";
}
