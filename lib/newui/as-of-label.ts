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


/* ── 공표 지연 표기 ──────────────────────────────────────────────────────
 *
 * 왜 필요한가(2026-08-25 실측): market_region_price 의 최신 period 는 202607
 * 인데 그 행은 **오늘 갱신됐다**. 한국부동산원 같은 공표 통계는 원래 한두 달
 * 늦게 나오기 때문이다. 그런데 화면에는 "2026.07 기준" 만 나가서 보는 사람은
 * 적재가 멈춘 것으로 읽는다. 내부 신선도 감시도 같은 이유로 "적재 정지"
 * 오경보를 냈다(임계 240h 가 월 단위 공표를 고려하지 않음).
 *
 * 지어내지 않는다: 우리가 아는 건 "우리 테이블에 들어온 것 중 가장 최근
 * 공표분"이지 "기관이 발표한 최신분"이 아니다. 문구도 딱 그만큼만 말한다.
 */

/** 지금 기준 몇 개월 전 공표분인가 (YYYYMM 계열). 해석 불가·미래면 null. */
export function monthsBehind(raw: string | null | undefined, now = new Date()): number | null {
  const digits = String(raw ?? "").replace(/[^0-9]/g, "");
  if (digits.length < 6) return null;
  const y = Number(digits.slice(0, 4));
  const m = Number(digits.slice(4, 6));
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return null;
  const diff = (now.getFullYear() - y) * 12 + (now.getMonth() + 1 - m);
  return diff < 0 ? null : diff;
}

/** "2026.07 공표분 · 수록된 최신" 형태. 2개월을 넘으면 지연을 명시한다. */
export function publishedAsOfLabel(
  raw: string | null | undefined,
  now = new Date(),
): string | null {
  const base = formatAsOfLabel(raw);
  if (!base) return null;
  const behind = monthsBehind(raw, now);
  if (behind === null) return `${base} 공표분`;
  if (behind <= 1) return `${base} 공표분 · 수록된 최신`;
  if (behind === 2) return `${base} 공표분 · 공표 주기상 최신`;
  return `${base} 공표분 · ${behind}개월 지연`;
}
