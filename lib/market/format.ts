/**
 * 실거래 금액·기간 표기 공통 헬퍼.
 *
 * 같은 모양의 `formatKrwShort` 가 페이지마다 복사돼 있다(현재 11곳). 새 랜딩을
 * 만들면서 12번째 사본을 늘리지 않으려고 여기로 뺐다. 기존 사본 정리는 별도
 * 품질 스윕에서 한다 — 지금 11개 파일을 동시에 건드리면 A5 의 변경 범위가
 * 검증하기 어려울 만큼 넓어진다.
 *
 * 반올림 규칙(기존 구현 그대로 유지):
 *  - 1억 이상: 억 단위, 100억 미만은 소수 첫째 자리까지 ("28.6억"), 이상은 정수
 *  - 1억 미만: 만원 단위 정수 ("9,800만")
 *  - 0·음수·NaN: "—" (0원을 "0억"으로 쓰면 거래가 있었던 것처럼 읽힌다)
 */

/** 원(KRW) → "28.6억" / "9,800만" / "—" */
export function formatKrwShort(krw: number | null | undefined): string {
  if (krw === null || krw === undefined || !Number.isFinite(krw) || krw <= 0) return "—";
  if (krw >= 1e8) {
    const eok = krw / 1e8;
    return `${(eok >= 100 ? Math.round(eok) : Math.round(eok * 10) / 10).toLocaleString("ko-KR")}억`;
  }
  return `${Math.round(krw / 1e4).toLocaleString("ko-KR")}만`;
}

/** "202607" → "2026.07". 형식이 아니면 원문 그대로 */
export function formatYm(ym: string | null | undefined): string {
  if (!ym) return "—";
  return /^\d{6}$/.test(ym) ? `${ym.slice(0, 4)}.${ym.slice(4)}` : ym;
}

/**
 * 데이터가 실제로 덮는 기간 문구. "2026.05~2026.07" · 한 달이면 "2026.07".
 *
 * 이 표기는 사실 주장이다 — 우리가 가진 실거래 신고분의 범위지 시세 흐름이 아니다.
 * 그래서 호출부에서 "N건 (2026.05~2026.07 신고 기준)" 처럼 쓰고,
 * "최근 시세" 같은 말로 바꾸지 않는다.
 */
export function formatYmRange(firstYm: string | null, latestYm: string | null): string {
  if (!firstYm && !latestYm) return "";
  if (!firstYm) return formatYm(latestYm);
  if (!latestYm || firstYm === latestYm) return formatYm(firstYm);
  return `${formatYm(firstYm)}~${formatYm(latestYm)}`;
}

/** ㎡ → 평 (1평 = 3.3058㎡). 소수 첫째 자리 */
export function m2ToPyeong(m2: number | null | undefined): number | null {
  if (m2 === null || m2 === undefined || !Number.isFinite(m2) || m2 <= 0) return null;
  return Math.round((m2 / 3.3058) * 10) / 10;
}
