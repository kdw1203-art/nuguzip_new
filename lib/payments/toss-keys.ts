/**
 * 토스페이먼츠 API 키 판별 — 종류·환경·짝 검사.
 *
 * 왜 필요한가(2026-08-26 실측): 코드가 클라이언트 키 한 개
 * (NEXT_PUBLIC_TOSS_CLIENT_KEY)와 시크릿 키 한 개(TOSS_SECRET_KEY)만 쓰는데,
 * 실제 상점에는 **키 세트가 셋** 있다.
 *
 *   ① 주문서형·결제창형 연동 키   live_gck_… + live_gsk_…   (위젯 SDK)
 *   ② API 개별 연동 키 · MID nuguzibowg      live_ck_… + live_sk_…
 *   ③ API 개별 연동 키 · MID bill_nuguzevk8  live_ck_… + live_sk_…  ← 자동결제
 *
 * 토스 문서(reference/using-api/api-keys)가 못 박아 둔 두 가지:
 *   · "클라이언트 키와 시크릿 키는 항상 '세트'로 묶여 있고, 한 세트로 써야 돼요."
 *   · "각 서비스에 맞는 연동 키를 사용하세요. 예를 들어, 브랜드페이 MID로 발급된
 *      클라이언트 키로 결제창 SDK를 초기화하면 오류가 납니다."
 *   · "자동결제(빌링) … 서비스마다 다른 상점아이디(MID)에 각각 API 개별 연동 키가
 *      발급돼요."
 *
 * 즉 ①의 클라이언트 키에 ②의 시크릿 키를 짝지으면 승인이 깨지고, 자동결제를
 * ②의 키로 부르면 카드 등록부터 실패한다. 눈으로는 셋 다 "live_…" 라 똑같이
 * 생겼기 때문에, 사람이 아니라 코드가 구분해야 한다.
 */

export type TossKeyMode = "test" | "live";
/** widget = 주문서형·결제창형(gck/gsk) · api = API 개별 연동(ck/sk) */
export type TossKeyKind = "widget" | "api";

export type TossKeyInfo =
  | { state: "missing" }
  | { state: "invalid"; raw: string }
  | { state: "ok"; mode: TossKeyMode; kind: TossKeyKind };

const CLIENT_PREFIXES: Array<[string, TossKeyMode, TossKeyKind]> = [
  ["test_gck_", "test", "widget"],
  ["live_gck_", "live", "widget"],
  ["test_ck_", "test", "api"],
  ["live_ck_", "live", "api"],
];

const SECRET_PREFIXES: Array<[string, TossKeyMode, TossKeyKind]> = [
  ["test_gsk_", "test", "widget"],
  ["live_gsk_", "live", "widget"],
  ["test_sk_", "test", "api"],
  ["live_sk_", "live", "api"],
];

function parse(
  raw: string | undefined | null,
  table: Array<[string, TossKeyMode, TossKeyKind]>,
): TossKeyInfo {
  const k = raw?.trim();
  if (!k) return { state: "missing" };
  /* gck 는 ck 로도 끝나므로 긴 접두사부터 본다 — 순서가 곧 정확도다. */
  for (const [prefix, mode, kind] of [...table].sort((a, b) => b[0].length - a[0].length)) {
    if (k.startsWith(prefix)) return { state: "ok", mode, kind };
  }
  return { state: "invalid", raw: k };
}

export function parseTossClientKey(raw: string | undefined | null): TossKeyInfo {
  return parse(raw, CLIENT_PREFIXES);
}

export function parseTossSecretKey(raw: string | undefined | null): TossKeyInfo {
  return parse(raw, SECRET_PREFIXES);
}

export type TossPairVerdict = {
  ok: boolean;
  /** 사람이 읽는 한 줄 — 관리자 화면에 그대로 쓴다 */
  reason: string;
  mode: TossKeyMode | null;
  kind: TossKeyKind | null;
};

const KIND_LABEL: Record<TossKeyKind, string> = {
  widget: "주문서형·결제창형 연동 키",
  api: "API 개별 연동 키",
};

/**
 * 클라이언트·시크릿이 같은 세트인지. 종류(gck/ck)와 환경(test/live)이 **둘 다**
 * 같아야 한다. 어느 하나만 어긋나도 결제창은 뜨는데 승인에서 깨진다 —
 * 사용자에게는 "결제가 되다 말았다" 로 보이는, 가장 나쁜 실패 모양이다.
 */
export function checkTossKeyPair(
  clientRaw: string | undefined | null,
  secretRaw: string | undefined | null,
): TossPairVerdict {
  const c = parseTossClientKey(clientRaw);
  const s = parseTossSecretKey(secretRaw);

  if (c.state === "missing" && s.state === "missing")
    return { ok: false, reason: "클라이언트 키·시크릿 키 모두 미설정", mode: null, kind: null };
  if (c.state === "missing")
    return { ok: false, reason: "클라이언트 키 미설정", mode: null, kind: null };
  if (s.state === "missing")
    return { ok: false, reason: "시크릿 키 미설정", mode: null, kind: null };
  if (c.state === "invalid")
    return { ok: false, reason: "클라이언트 키 형식이 토스 키가 아님", mode: null, kind: null };
  if (s.state === "invalid")
    return { ok: false, reason: "시크릿 키 형식이 토스 키가 아님", mode: null, kind: null };

  if (c.mode !== s.mode) {
    return {
      ok: false,
      reason: `환경 불일치 — 클라이언트 ${c.mode} · 시크릿 ${s.mode}`,
      mode: null,
      kind: null,
    };
  }
  if (c.kind !== s.kind) {
    return {
      ok: false,
      reason: `키 세트 불일치 — 클라이언트는 ${KIND_LABEL[c.kind]}, 시크릿은 ${KIND_LABEL[s.kind]}`,
      mode: c.mode,
      kind: null,
    };
  }
  return {
    ok: true,
    reason: `${c.mode === "live" ? "라이브" : "테스트"} · ${KIND_LABEL[c.kind]}`,
    mode: c.mode,
    kind: c.kind,
  };
}

/**
 * 자동결제(빌링)에 쓸 수 있는 클라이언트 키인가.
 *
 * 빌링 카드 등록은 payment().requestBillingAuth() — 결제창 SDK 다. 문서가 든
 * 예시 그대로, 위젯 연동 키(gck)로 결제창 SDK 를 초기화하면 오류가 난다.
 * 그래서 빌링 클라이언트 키는 **API 개별 연동 키(ck)** 여야 한다.
 */
export function isBillingCapableClientKey(raw: string | undefined | null): boolean {
  const k = parseTossClientKey(raw);
  return k.state === "ok" && k.kind === "api";
}
