/**
 * 지도 말풍선 겹침 정리(declutter) — 순수 계산 모듈.
 *
 * ── 왜 필요한가 ────────────────────────────────────────────────────────────
 * /map 의 시세 말풍선은 지금까지 전부 zIndex 1 로 그려졌다. 그래서 어느 단지가
 * 위로 올라오는지는 DOM 순서(= 쿼리 정렬 순서)라는, 화면과 아무 상관 없는 값이
 * 정했다. 단지가 몰린 곳에서는 "13.6억" 의 뒷자리가 옆 말풍선에 먹혀 "13.0억"
 * 처럼 보이는 상황까지 나왔다. 숫자가 반쯤 가려져 다른 숫자로 읽히는 것은
 * 사실 우선 원칙에서 가장 나쁜 실패다 — 없는 안내보다 틀린 안내가 나쁘다.
 *
 * ── 이 모듈이 하는 일과 하지 않는 일 ───────────────────────────────────────
 * 겹치는 말풍선 중 우선순위가 낮은 쪽의 **라벨만** 접는다. 마커 자체는 점으로
 * 남겨 계속 클릭할 수 있다. 지우지 않는다 — 실제로 있는 단지가 지도에서
 * 사라지면, 이용자는 "여기엔 단지가 없구나" 라고 읽는다. 그건 겹침보다 나쁜
 * 거짓말이다. **겹침을 없애되 존재를 지우지 않는다.**
 *
 * ── 좌표 계산에서 SDK 상수를 쓰지 않는 이유 ────────────────────────────────
 * 화면 좌표를 얻는 흔한 방법은 world-pixel(=256·2^zoom)을 직접 계산하는 것인데,
 * 256 은 네이버 지도의 타일 크기 규약을 **가정**하는 값이다. 이 가정이 틀리면
 * 충돌 임계값이 조용히 두 배/절반이 되고, 아무도 그걸 눈치채지 못한다.
 * 대신 onIdle 이 이미 넘겨주는 실제 bounds(SW/NE)와 컨테이너 픽셀 크기만으로
 * 선형 보간한다. x 는 경도에 선형이고, y 는 메르카토르 y 에 선형이다 —
 * 이 두 성질은 어떤 웹 메르카토르 구현에서도 참이라 가정이 아니다.
 */

export interface DeclutterBounds {
  swLat: number;
  swLng: number;
  neLat: number;
  neLng: number;
}

export interface DeclutterViewport {
  width: number;
  height: number;
}

export interface DeclutterItem {
  id: string;
  lat: number;
  lng: number;
  /** 말풍선 폭(px). 실측(canvas measureText) 값을 넣는다. */
  width: number;
  /** 말풍선 높이(px). 꼬리 포함. */
  height: number;
  /**
   * 클수록 살아남는다. 동점이면 id 사전순으로 결정 — 정렬이 안정적이어야
   * 지도를 조금 움직였다고 라벨이 깜빡이며 자리를 바꾸지 않는다.
   */
  priority: number;
  /**
   * 앵커점이 사각형의 어디인가. 시세 말풍선은 translate(-50%,-100%) 라
   * 아래 가운데("bottom-center", 기본), 이름 알약·클러스터는
   * translate(-50%,-50%) 라 정가운데("center") 다.
   */
  anchor?: "bottom-center" | "center";
}

export interface DeclutterResult {
  /** 라벨을 접을(=점으로 그릴) 마커 id */
  collapsed: Set<string>;
  /** 살아남은 마커 id → 그리기 순서(zIndex 가산치). 클수록 위. */
  zIndexById: Map<string, number>;
}

/** 위도 → 메르카토르 y (단위 없는 상대값). 극점 근처는 클램프. */
function mercatorY(lat: number): number {
  const clamped = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const rad = (clamped * Math.PI) / 180;
  return Math.log(Math.tan(Math.PI / 4 + rad / 2));
}

/**
 * 위경도 → 컨테이너 기준 화면 좌표(px). bounds 밖이면 음수/초과값이 나오는데,
 * 그대로 둔다 — 화면 밖 마커끼리의 충돌은 어차피 결과에 영향이 없고, 잘라내면
 * 경계에 걸친 마커가 엉뚱한 자리로 접힌다.
 */
export function projectToScreen(
  bounds: DeclutterBounds,
  viewport: DeclutterViewport,
  lat: number,
  lng: number,
): { x: number; y: number } | null {
  const { width, height } = viewport;
  if (!(width > 0) || !(height > 0)) return null;

  /* 날짜변경선을 넘어간 bounds(neLng < swLng)도 계산은 되게 한다. 국내 서비스라
     실제로 걸릴 일은 없지만, 조용히 NaN 이 되어 전부 접히는 것보다 낫다. */
  let lngSpan = bounds.neLng - bounds.swLng;
  if (lngSpan <= 0) lngSpan += 360;
  if (!(lngSpan > 0)) return null;

  let dLng = lng - bounds.swLng;
  if (dLng < 0) dLng += 360;

  const ySw = mercatorY(bounds.swLat);
  const yNe = mercatorY(bounds.neLat);
  const ySpan = yNe - ySw;
  if (!(Math.abs(ySpan) > 0)) return null;

  const x = (dLng / lngSpan) * width;
  const y = ((yNe - mercatorY(lat)) / ySpan) * height;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

type Rect = { left: number; right: number; top: number; bottom: number };

/**
 * 말풍선 사각형. NaverMap 의 시세 말풍선은 transform:translate(-50%,-100%) 라
 * 앵커점(x,y)이 사각형의 **아래 가운데**다. 이 한 줄을 틀리면 충돌 판정이
 * 통째로 반 칸씩 어긋난다.
 */
function rectOf(
  x: number,
  y: number,
  w: number,
  h: number,
  pad: number,
  anchor: "bottom-center" | "center",
): Rect {
  const top = anchor === "center" ? y - h / 2 : y - h;
  return {
    left: x - w / 2 - pad,
    right: x + w / 2 + pad,
    top: top - pad,
    bottom: top + h + pad,
  };
}

function intersects(a: Rect, b: Rect): boolean {
  return !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
}

export interface DeclutterOptions {
  /** 사각형 사이 최소 여백(px). 기본 2 — 딱 붙는 것도 겹친 것처럼 읽힌다. */
  padding?: number;
  /**
   * 라벨을 유지할 최대 개수. 화면에 100개가 안 겹치게 놓일 수 있어도 100개를
   * 다 읽지는 않는다. 0 이하면 상한 없음.
   */
  maxLabels?: number;
}

/**
 * 우선순위 그리디 + 균일 격자 공간 색인.
 *
 * 우선순위가 높은 것부터 차례로 놓고, 이미 놓인 것과 겹치면 접는다. 그리디라
 * 전역 최적은 아니지만, 이 문제에서 중요한 건 최적해가 아니라 **결과가 안정적일
 * 것**이다. 우선순위·id 로 완전 정렬하므로 같은 화면이면 항상 같은 답이 나오고,
 * 지도를 살짝 움직였을 때 라벨이 서로 자리를 바꾸며 깜빡이지 않는다.
 *
 * 격자 칸 크기는 가장 큰 말풍선 크기로 잡는다. 그래야 인접 9칸만 보면 충돌
 * 후보를 빠짐없이 훑는다(칸이 더 작으면 놓치고, 더 크면 느려진다).
 */
export function declutterMarkers(
  items: DeclutterItem[],
  bounds: DeclutterBounds | null,
  viewport: DeclutterViewport,
  options: DeclutterOptions = {},
): DeclutterResult {
  const collapsed = new Set<string>();
  const zIndexById = new Map<string, number>();
  if (items.length === 0) return { collapsed, zIndexById };

  /* bounds 를 아직 못 받았으면 아무것도 접지 않는다. 모르면 손대지 않는 쪽이
     맞다 — 잘못 접으면 있는 단지가 점 하나로 사라진 것처럼 보인다. */
  if (!bounds || !(viewport.width > 0) || !(viewport.height > 0)) {
    return { collapsed, zIndexById };
  }

  const padding = options.padding ?? 2;
  const maxLabels = options.maxLabels ?? 0;

  type Placed = { id: string; rect: Rect };
  const projected: { item: DeclutterItem; rect: Rect }[] = [];
  let cell = 1;

  for (const item of items) {
    const p = projectToScreen(bounds, viewport, item.lat, item.lng);
    if (!p) {
      /* 투영을 못 하면 접지 않는다(위와 같은 이유). */
      continue;
    }
    const w = Math.max(1, item.width);
    const h = Math.max(1, item.height);
    cell = Math.max(cell, w + padding * 2, h + padding * 2);
    projected.push({
      item,
      rect: rectOf(p.x, p.y, w, h, padding, item.anchor ?? "bottom-center"),
    });
  }

  projected.sort((a, b) =>
    b.item.priority - a.item.priority || (a.item.id < b.item.id ? -1 : a.item.id > b.item.id ? 1 : 0),
  );

  const grid = new Map<string, Placed[]>();
  const keyOf = (cx: number, cy: number) => `${cx},${cy}`;

  let kept = 0;
  for (const { item, rect } of projected) {
    if (maxLabels > 0 && kept >= maxLabels) {
      collapsed.add(item.id);
      continue;
    }
    const cx0 = Math.floor(rect.left / cell);
    const cx1 = Math.floor(rect.right / cell);
    const cy0 = Math.floor(rect.top / cell);
    const cy1 = Math.floor(rect.bottom / cell);

    let hit = false;
    for (let cx = cx0; cx <= cx1 && !hit; cx += 1) {
      for (let cy = cy0; cy <= cy1 && !hit; cy += 1) {
        const bucket = grid.get(keyOf(cx, cy));
        if (!bucket) continue;
        for (const placed of bucket) {
          if (intersects(rect, placed.rect)) {
            hit = true;
            break;
          }
        }
      }
    }

    if (hit) {
      collapsed.add(item.id);
      continue;
    }

    const entry: Placed = { id: item.id, rect };
    for (let cx = cx0; cx <= cx1; cx += 1) {
      for (let cy = cy0; cy <= cy1; cy += 1) {
        const k = keyOf(cx, cy);
        const bucket = grid.get(k);
        if (bucket) bucket.push(entry);
        else grid.set(k, [entry]);
      }
    }
    /* 살아남은 순서 = 우선순위 순서. 나중에 놓인 것일수록 아래로 깔아, 겹치지
       않더라도 꼬리·그림자가 스치는 경우 우선순위가 위로 오게 한다. */
    zIndexById.set(item.id, projected.length - kept);
    kept += 1;
  }

  return { collapsed, zIndexById };
}
