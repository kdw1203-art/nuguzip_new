/* 시장 지표 칸 — 지역 평균 · 시장 온도 · 거래량.
 *
 * 2026-08-26(소유자 지적): 예전에는 여기 ④번으로 "내 임장 레벨" 이 함께 있었다.
 * 앞의 셋은 **시장 사실**이고 넷째는 **나의 상태**인데 같은 카드 모양이라
 * 같은 종류로 읽혔다 — 홈이 무슨 이야기를 하는 화면인지 흐려진 원인 중 하나다.
 * 레벨 카드는 개인 영역(HomeEngagementCard 옆)으로 옮겼다.
 *
 * 이 행 자체도 이제는 주인공이 아니다. 주인공은 HomeTodayLine 의 한 문장이고,
 * 여기는 그 문장을 뒷받침하는 자리다(데스크톱 보조 행).
 *
 * 사실 우선: 값이 없는 칸은 "—"가 아니라 **칸 자체를 뺀다**(그리드가 접힌다).
 */

export interface KpiRegion {
  name: string;
  price: string;
  delta: string;
  tone: "up" | "down" | "flat";
  /** meta 에서 뽑은 최근 거래 건수 문자열 (예: "120건") — 없으면 null */
  tradeLabel: string | null;
  href: string;
  /** [950] 기준월(예: "7월") — 문장이 "지난달보다"라고만 하면 어느 달인지 알 수 없다 */
  periodLabel?: string | null;
}

export interface KpiTemp {
  score: number;
  headline: string;
  weekLabel: string;
}

/* HomeKpiRow 컴포넌트는 2026-08-26 에 제거했다.
   홈 KPI 3~4칸이 HomeTodayLine 의 보조 지표 줄과 **같은 숫자 두 벌**이었기 때문이다
   (소유자 지적: "주제가 명확하지 않다"의 직접 원인 중 하나).
   타입 KpiRegion·KpiTemp 는 page.tsx 와 HomeTodayLine 이 계속 쓰므로 남긴다. */
