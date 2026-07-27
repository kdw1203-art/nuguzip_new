/**
 * 가입 화면 → 온보딩(/welcome) 인계.
 *
 * ── 왜 필요한가 ─────────────────────────────────────────────────────────────
 * /signup 의 "관심 지역"은 고르기만 하고 아무 데도 보내지 않았다. onSubmit 이
 * /api/auth/register 로 보내는 필드는 email·password·name·source·campaign·
 * consent 뿐이라, 사용자가 고른 지역은 화면을 떠나는 순간 사라졌다. 그리고
 * 바로 다음 화면(/welcome)이 "어느 동네가 궁금하세요?"라고 다시 물었다 —
 * 같은 질문을 두 번 받는데 첫 번째 답은 버려지고 있었던 셈이다.
 *
 * 가입 시점에는 아직 로그인 세션이 없다(이메일 인증이 필요한 계정도 있다).
 * 서버에 저장할 주체가 없으니, 같은 브라우저 탭 안에서만 살아 있는
 * sessionStorage 로 넘긴다. /welcome 이 읽어서 프리필하고 즉시 지운다.
 *
 * localStorage 가 아니라 sessionStorage 인 이유: 이건 "이어지는 한 번의 가입
 * 흐름" 안에서만 의미가 있는 임시값이다. 탭을 닫은 뒤에도 남아 있으면 몇 주
 * 뒤 다른 사람이 같은 기기로 가입할 때 남의 선택이 프리필된다.
 */

export const SIGNUP_REGIONS_KEY = "nz_signup_handoff";

/** 가입 화면이 물어본 것 중 온보딩으로 넘길 값 */
export type SignupHandoff = {
  regions: string[];
  /** 기본 정보 칩 (나이대·성별·… ) — 화이트리스트 검증은 서버가 한다 */
  profile: Record<string, string>;
  /** 목표 카드 → 온보딩 "목적" 프리필. 대응이 없으면 null */
  purpose: "live" | "invest" | null;
};

/** 가입 화면에서 고른 값을 저장 (실패는 무시 — 프리필은 부가 기능이다) */
export function stashSignupHandoff(value: SignupHandoff): void {
  if (typeof window === "undefined") return;
  try {
    const empty =
      value.regions.length === 0 &&
      Object.keys(value.profile).length === 0 &&
      value.purpose === null;
    if (empty) {
      window.sessionStorage.removeItem(SIGNUP_REGIONS_KEY);
      return;
    }
    window.sessionStorage.setItem(SIGNUP_REGIONS_KEY, JSON.stringify(value));
  } catch {
    /* 시크릿 모드·저장소 차단 환경 — 프리필만 못 할 뿐 가입은 정상 진행 */
  }
}

const EMPTY_HANDOFF: SignupHandoff = { regions: [], profile: {}, purpose: null };

/** /welcome 에서 한 번 읽고 지운다. 형태가 어긋난 값은 통째로 버린다. */
export function takeSignupHandoff(): SignupHandoff {
  if (typeof window === "undefined") return EMPTY_HANDOFF;
  try {
    const raw = window.sessionStorage.getItem(SIGNUP_REGIONS_KEY);
    if (!raw) return EMPTY_HANDOFF;
    window.sessionStorage.removeItem(SIGNUP_REGIONS_KEY);
    const o = JSON.parse(raw) as Record<string, unknown>;
    if (!o || typeof o !== "object") return EMPTY_HANDOFF;
    const regions = Array.isArray(o.regions)
      ? o.regions.filter((v): v is string => typeof v === "string" && v.trim() !== "").slice(0, 3)
      : [];
    const profile: Record<string, string> = {};
    if (o.profile && typeof o.profile === "object" && !Array.isArray(o.profile)) {
      for (const [k, v] of Object.entries(o.profile as Record<string, unknown>)) {
        if (typeof v === "string" && v.trim() !== "") profile[k] = v;
      }
    }
    const purpose = o.purpose === "live" || o.purpose === "invest" ? o.purpose : null;
    return { regions, profile, purpose };
  } catch {
    return EMPTY_HANDOFF;
  }
}
