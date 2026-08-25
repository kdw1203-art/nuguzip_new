/* 스파크라인 기하 — [UI-09] 순수 함수. 렌더(Sparkline.tsx)와 분리한 이유는
 * 두 가지다: ① 이 규칙들(2점 미만이면 안 그린다·동일값이면 눕는다)은 사실
 * 정직성 규칙이라 테스트로 잠가야 하고, ② JSX 가 섞이면 유닛 테스트 러너가
 * 그대로 못 읽는다(node --test 는 .tsx 를 스트립하지 못한다).
 */

export interface SparkGeometry {
  /** 선 path (M/L) */
  line: string;
  /** 면 채움 path — 선 + 바닥 닫기 */
  area: string;
  /** 끝점 좌표 — "지금 값"을 강조하는 원 */
  last: readonly [number, number];
}

/**
 * 값 배열 → SVG path.
 *
 * 반환 null 인 경우(= 아무것도 그리지 않는다):
 *  - 유한한 값이 2개 미만. 한 점짜리 선이나 평평한 가짜 선을 그리면
 *    "데이터가 있다"는 거짓 신호가 된다 — 허브 티저 원칙과 같다.
 */
export function sparklinePath(
  values: readonly number[],
  width = 96,
  height = 26,
): SparkGeometry | null {
  const pts = values.filter((v) => typeof v === "number" && Number.isFinite(v));
  if (pts.length < 2) return null;

  const min = Math.min(...pts);
  const max = Math.max(...pts);
  /* 전 구간 동일값이면 분모가 0 이 된다 — 가운데 수평선으로 눕힌다
     (변동 없음도 사실이다). */
  const span = max - min || 1;
  const stepX = width / (pts.length - 1);
  /* 위·아래 여백 — 끝점 원이 뷰박스에 잘리지 않게 한다. */
  const pad = 2.5;
  const usable = height - pad * 2;
  const r1 = (n: number) => Math.round(n * 10) / 10;

  const xy = pts.map((v, i) => {
    const x = r1(i * stepX);
    const y = r1(max === min ? height / 2 : pad + (1 - (v - min) / span) * usable);
    return [x, y] as const;
  });

  const line = xy.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x} ${y}`).join(" ");
  return {
    line,
    area: `${line} L${width} ${height} L0 ${height} Z`,
    last: xy[xy.length - 1],
  };
}
