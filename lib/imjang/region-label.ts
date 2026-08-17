/* 지역 표기 정규화 — 모임(meetings.region: "서울특별시 강남구")과 실거래 지역
 * (tx region_name: "서울 강남구" · "남양주시")의 어휘가 달라, 잇는 쪽이 맞춰야
 * 한다. 규칙은 보수적으로: 정규화 후 **정확 일치**만 매칭하고, 못 맞추면
 * 링크를 그리지 않는다 — 어긋난 지역으로 보내는 것보다 안 보내는 게 낫다.
 *
 * 순수 함수 (유닛 테스트 대상). 서버 매칭은 lib/imjang/guide.ts 쪽.
 */

/** 광역 단위 — 실거래 지역명은 "서울 강서구"처럼 짧은 접두를 쓴다 */
const METRO_RE = /^(서울|부산|대구|인천|광주|대전|울산|세종)(특별자치시|특별시|광역시)?$/;
/** 도(道) 단위는 실거래 지역명에 없다 — "경기도 남양주시" → "남양주시" */
const PROVINCE_RE =
  /^(경기도?|강원(특별자치도|도)?|충청북도|충북|충청남도|충남|전라북도|전북(특별자치도)?|전라남도|전남|경상북도|경북|경상남도|경남|제주(특별자치도)?)$/;

/**
 * "서울특별시 강남구" → "서울 강남구" · "경기도 안양시 동안구" → "안양시 동안구"
 * 이미 짧은 표기("서울 강남구", "남양주시")는 그대로 통과한다.
 * ("광주시"처럼 시 이름 자체는 METRO_RE 에 안 걸린다 — 경기 광주와 광주광역시 혼동 방지)
 */
export function normalizeRegionLabel(raw: string): string {
  const tokens = raw.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return "";

  const out: string[] = [];
  tokens.forEach((t, i) => {
    if (i === 0) {
      if (PROVINCE_RE.test(t)) return; // 경기도·제주특별자치도 → 버림
      const metro = t.match(METRO_RE);
      if (metro) {
        out.push(metro[1]); // 서울특별시 → 서울, 대구광역시 → 대구
        return;
      }
    }
    out.push(t);
  });
  return out.join(" ");
}
