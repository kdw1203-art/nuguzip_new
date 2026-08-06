/**
 * 변동률 표시 라벨 — 서버(홈 데이터 생성)와 클라이언트(홈 렌더)가 같은 문자열을
 * 봐야 해서 server-only 가 아닌 모듈에 둔다.
 *
 * 사실 우선: 변동률을 모를 때는 "— 0.0%" 라고 적지 않는다. 그건 "변동이 없다"는
 * 뜻으로 읽히는 **지어낸 숫자**였다(회색 flat 색까지 붙어 더 그럴듯했다).
 * 모르면 모른다고 적고, 숫자를 파싱하는 쪽(지도 말풍선 momPct)도 자연히
 * "값 없음"으로 떨어지게 한다.
 */

/** 변동률을 알 수 없을 때 쓰는 라벨. */
export const DELTA_UNKNOWN = "변동 미상";

/**
 * 좁은 칸용 축약 — "▲ 1.2%" → "▲1.2%".
 * 미상 라벨에는 적용하지 않는다(붙이면 "변동미상"이 된다).
 */
export function compactDelta(delta: string): string {
  return delta === DELTA_UNKNOWN ? delta : delta.replace(" ", "");
}

/** 변동률을 모르는 라벨인지. */
export function isDeltaUnknown(delta: string | null | undefined): boolean {
  return delta === DELTA_UNKNOWN;
}
