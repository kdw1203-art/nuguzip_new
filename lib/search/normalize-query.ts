/**
 * [개선 #31 lite] 검색어 정규화 — 0건 원인 1·2위(띄어쓰기 차이, 통용 약칭)를
 * 쿼리 단계에서 흡수한다.
 *
 * - normalizeSearchQuery: 통용 약칭을 정식 명칭으로 확장(확실한 것만 — 틀린
 *   확장은 0건보다 나쁘다), 꼬리의 "아파트" 제거("래미안아파트"→"래미안").
 * - ilike 패턴의 공백 처리는 호출부에서 공백→% 로 (이 모듈은 문자열만 다룬다).
 *
 * 순수 함수 모듈 — 서버·클라이언트 겸용이라 server-only 를 두지 않는다.
 */

/** 통용 약칭 → 정식 단지명. 확신 있는 항목만 유지한다(추측 확장 금지). */
const COMPLEX_ALIASES: Record<string, string> = {
  마래푸: "마포래미안푸르지오",
  래대팰: "래미안대치팰리스",
  잠실주공: "잠실주공5단지",
};

export function normalizeSearchQuery(raw: string): string {
  let q = raw.trim();
  if (!q) return q;

  const compact = q.replace(/\s+/g, "");
  const alias = COMPLEX_ALIASES[compact];
  if (alias) return alias;

  // "○○아파트" → "○○" (단지명 표기가 대부분 "아파트" 없이 저장됨).
  // 두 글자 이하만 남으면 오히려 광범위해지므로 그대로 둔다.
  const noApt = q.replace(/아파트$/u, "").trim();
  if (noApt.length >= 2 && noApt !== q) q = noApt;

  return q;
}
