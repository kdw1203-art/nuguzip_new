/**
 * 기준시점 라벨 정규화.
 *
 * 홈의 지표 3종은 출처가 다 다르고, 각자 다른 모양의 "기준시점"을 들고 온다:
 *   - 한국은행 기준금리(ECOS)   `cycle: "20260804"`  (YYYYMMDD)
 *   - 주담대 금리(금감원 finlife) `asOf:  "2026-06"`   (YYYY-MM)
 *   - 실거래 적재일(market_ingest_log) `"2026.08.05"` (이미 표시형)
 *
 * 지금까지 이 값들은 **한 번도 화면에 나온 적이 없었다.** getBaseRate() 는
 * cycle 을 읽어 오고도 버렸고, 화면에는 `2.75%` 만 떴다. 실제로 오늘(2026-08-06)
 * 기준금리의 cycle 은 2026-08-04, 대출금리는 2026-06 — **두 달 차이 나는 두
 * 숫자가 "기준 / 대출금리 2.75% / 4.31%" 라는 한 칸에 붙어** 같은 시점의
 * 값처럼 읽히고 있었다. 숫자에는 기준시점이 붙어야 한다는 원칙의 정반대다.
 *
 * 여기서는 모양만 통일한다. 해석할 수 없는 값은 **지어내지 않고 null** 을
 * 돌려 라벨 자체가 안 나오게 한다(틀린 날짜보다 없는 날짜가 낫다).
 */

/** `YYYYMMDD` | `YYYY-MM-DD` | `YYYYMM` | `YYYY-MM` | `YYYY.MM(.DD)` → `2026.08.04` / `2026.08` */
export function formatAsOfLabel(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/[^0-9]/g, "");
  if (digits.length === 8) {
    const [y, m, d] = [digits.slice(0, 4), digits.slice(4, 6), digits.slice(6, 8)];
    if (!isSaneYm(y, m) || Number(d) < 1 || Number(d) > 31) return null;
    return `${y}.${m}.${d}`;
  }
  if (digits.length === 6) {
    const [y, m] = [digits.slice(0, 4), digits.slice(4, 6)];
    if (!isSaneYm(y, m)) return null;
    return `${y}.${m}`;
  }
  /* 분기(2026Q2)·연도(2025) 같은 다른 주기도 ECOS 에는 있지만, 홈이 쓰는 세
     지표는 위 두 모양뿐이다. 나머지는 추측하지 않는다. */
  return null;
}

function isSaneYm(y: string, m: string): boolean {
  const yy = Number(y);
  const mm = Number(m);
  return yy >= 1900 && yy <= 2999 && mm >= 1 && mm <= 12;
}
