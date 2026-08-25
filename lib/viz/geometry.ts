/* 차트 기하 — 순수 함수 모음. 렌더(SVG 컴포넌트)와 분리한 이유:
 *  ① "값이 모자라면 그리지 않는다" 같은 정직성 규칙은 테스트로 잠가야 하고
 *  ② node --test 는 .tsx(JSX)를 스트립하지 못한다.
 *
 * 좌표계는 전부 뷰박스 기준이고, 색은 컴포넌트가 currentColor 로 넣는다
 * (여기서 색을 다루지 않는다 — raw hex 가 코드에 스며드는 첫 경로가 그거다).
 */

export interface Pt {
  x: number;
  y: number;
}

export interface LineGeometry {
  line: string;
  area: string;
  points: readonly Pt[];
  min: number;
  max: number;
  first: number;
  last: number;
  /** 첫→끝 변화율(%) — max===min 이면 0 */
  changePct: number;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

function finite(values: readonly number[]): number[] {
  return values.filter((v) => typeof v === "number" && Number.isFinite(v));
}

/**
 * 값 배열 → 선/면 path.
 * 유한한 값이 2개 미만이면 null — 한 점짜리 선이나 평평한 가짜 선을 그리면
 * "데이터가 있다"는 거짓 신호가 된다.
 */
export function lineGeometry(
  values: readonly number[],
  width: number,
  height: number,
  pad = 2.5,
): LineGeometry | null {
  const pts = finite(values);
  if (pts.length < 2) return null;

  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = max - min || 1;
  const stepX = width / (pts.length - 1);
  const usable = height - pad * 2;

  const points = pts.map((v, i) => ({
    x: r1(i * stepX),
    y: r1(max === min ? height / 2 : pad + (1 - (v - min) / span) * usable),
  }));

  const line = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x} ${p.y}`)
    .join(" ");
  const first = pts[0];
  const last = pts[pts.length - 1];

  return {
    line,
    area: `${line} L${width} ${height} L0 ${height} Z`,
    points,
    min,
    max,
    first,
    last,
    changePct: first === 0 ? 0 : Math.round(((last - first) / first) * 1000) / 10,
  };
}

/** 부드러운 곡선(카디널 스플라인 근사) — 지수·온도처럼 연속량에 쓴다. */
export function smoothPath(points: readonly Pt[], tension = 0.35): string {
  if (points.length < 2) return "";
  if (points.length === 2) {
    return `M${points[0].x} ${points[0].y} L${points[1].x} ${points[1].y}`;
  }
  let d = `M${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const c1x = r1(p1.x + ((p2.x - p0.x) / 6) * tension * 2);
    const c1y = r1(p1.y + ((p2.y - p0.y) / 6) * tension * 2);
    const c2x = r1(p2.x - ((p3.x - p1.x) / 6) * tension * 2);
    const c2y = r1(p2.y - ((p3.y - p1.y) / 6) * tension * 2);
    d += ` C${c1x} ${c1y} ${c2x} ${c2y} ${p2.x} ${p2.y}`;
  }
  return d;
}

export interface BarGeometry {
  bars: ReadonlyArray<{ x: number; y: number; w: number; h: number; value: number; index: number }>;
  max: number;
  maxIndex: number;
}

/**
 * 값 배열 → 세로 막대. 값이 하나도 없으면 null.
 * 0 은 **그린다**(0건도 사실이다) — 다만 높이를 1px 남겨 "칸이 있다"는 걸 보인다.
 */
export function barGeometry(
  values: readonly number[],
  width: number,
  height: number,
  gapRatio = 0.28,
): BarGeometry | null {
  const pts = finite(values);
  if (pts.length === 0) return null;
  const max = Math.max(...pts, 0);
  const slot = width / pts.length;
  const w = Math.max(1, slot * (1 - gapRatio));
  const off = (slot - w) / 2;
  let maxIndex = 0;
  pts.forEach((v, i) => {
    if (v > pts[maxIndex]) maxIndex = i;
  });
  return {
    max,
    maxIndex,
    bars: pts.map((v, i) => {
      const h = max <= 0 ? 1 : Math.max(1, (v / max) * height);
      return { x: r1(i * slot + off), y: r1(height - h), w: r1(w), h: r1(h), value: v, index: i };
    }),
  };
}

/**
 * 0~1 비율 → 반원 게이지 호(arc) path. 시작은 왼쪽(180°), 끝은 오른쪽(0°).
 * ratio 는 [0,1] 로 자른다 — 범위 밖 값이 호를 뒤집는 사고를 막는다.
 */
export function gaugeArc(
  ratio: number,
  radius: number,
  cx: number,
  cy: number,
): { d: string; end: Pt } {
  const t = Math.min(1, Math.max(0, Number.isFinite(ratio) ? ratio : 0));
  const angle = Math.PI * (1 - t); // 180° → 0°
  const end = { x: r1(cx + radius * Math.cos(angle)), y: r1(cy - radius * Math.sin(angle)) };
  const large = t > 0.5 ? 1 : 0;
  return {
    d: `M${r1(cx - radius)} ${cy} A${radius} ${radius} 0 ${large} 1 ${end.x} ${end.y}`,
    end,
  };
}

/** 레이더 꼭짓점 — 값(0~1) 배열을 원형 좌표로. 12시 방향부터 시계방향. */
export function radarPoints(
  ratios: readonly number[],
  radius: number,
  cx: number,
  cy: number,
): Pt[] {
  const n = ratios.length;
  if (n < 3) return [];
  return ratios.map((v, i) => {
    const t = Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));
    const a = (Math.PI * 2 * i) / n - Math.PI / 2;
    return { x: r1(cx + radius * t * Math.cos(a)), y: r1(cy + radius * t * Math.sin(a)) };
  });
}

export function polygonPoints(pts: readonly Pt[]): string {
  return pts.map((p) => `${p.x},${p.y}`).join(" ");
}

/** 값 목록 → 0~1 정규화. 전부 같으면 전부 1(막대가 사라지지 않게). */
export function normalize(values: readonly number[]): number[] {
  const pts = finite(values);
  if (pts.length === 0) return [];
  const max = Math.max(...pts);
  const min = Math.min(...pts, 0);
  const span = max - min;
  if (span <= 0) return pts.map(() => 1);
  return pts.map((v) => (v - min) / span);
}
