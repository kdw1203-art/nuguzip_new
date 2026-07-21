/**
 * 매물 비교함 — 클라이언트 전용 인메모리 스토어(모듈 싱글턴).
 *
 * 관심 매물 2~3개를 담아 나란히 비교하기 위한 선택 저장소.
 * - localStorage/DB 미사용(환경 제약) — 브라우저 세션(모듈 인스턴스) 동안만 유지.
 * - App Router 클라이언트 네비게이션 동안에는 동일 모듈 인스턴스가 살아있어
 *   목록 → /listings/compare 이동 시 선택이 그대로 유지된다.
 * - React 구독은 useSyncExternalStore(subscribe, getSnapshot)로 연결.
 *
 * 서버 파일에서는 타입만(`import type`) 가져올 것 — 런타임(싱글턴) 미포함.
 */

/** 비교함 최대 담기 수 (2~3개 비교). */
export const MAX_COMPARE = 3;
/** 나란히 비교를 시작할 수 있는 최소 담기 수. */
export const MIN_COMPARE = 2;

export type CompareListingType = "sale" | "jeonse" | "monthly";
export type CompareListingSource = "owner" | "agent";

/** 비교에 필요한 매물 요약(직렬화 가능) — 목록 카드에서 담을 때 저장. */
export interface CompareListing {
  id: string;
  complexName: string;
  regionName: string | null;
  listingType: CompareListingType;
  priceKrw: number | null;
  depositKrw: number | null;
  monthlyKrw: number | null;
  areaM2: number | null;
  floor: number | null;
  createdAt: string;
  refreshedAt: string | null;
  source: CompareListingSource;
  ownerVerified: boolean;
}

/** 서버(비교 페이지)에서 시세대비까지 채워 넘기는 확장 형태. */
export type MarketAwareCompareListing = CompareListing & {
  /** 최근 실거래 중위가 대비 호가 변동률(%). 미산출 시 null. */
  marketDeltaPct: number | null;
};

const EMPTY: readonly CompareListing[] = Object.freeze([]);

let items: CompareListing[] = [];
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

/** useSyncExternalStore 구독 등록. */
export function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** 현재 담긴 매물 목록(참조는 변경 시에만 새로 생성 — useSyncExternalStore 호환). */
export function getSnapshot(): readonly CompareListing[] {
  return items;
}

/** SSR/초기 하이드레이션용 안정 스냅샷(항상 빈 배열). */
export function getServerSnapshot(): readonly CompareListing[] {
  return EMPTY;
}

export function has(id: string): boolean {
  return items.some((i) => i.id === id);
}

export function count(): number {
  return items.length;
}

/** 담기(이미 있으면 무시). 가득 차면 false. */
export function add(item: CompareListing): boolean {
  if (has(item.id)) return true;
  if (items.length >= MAX_COMPARE) return false;
  items = [...items, item];
  emit();
  return true;
}

export function remove(id: string): void {
  if (!has(id)) return;
  items = items.filter((i) => i.id !== id);
  emit();
}

/** 토글 — 담겨 있으면 빼고, 없으면 담는다. 반환값은 실행 후 담김 여부. */
export function toggle(item: CompareListing): boolean {
  if (has(item.id)) {
    remove(item.id);
    return false;
  }
  return add(item);
}

export function clear(): void {
  if (items.length === 0) return;
  items = [];
  emit();
}

/** 현재 담긴 매물 id를 URL 쿼리(`ids=a,b,c`)용 문자열로. */
export function idsParam(): string {
  return items.map((i) => i.id).join(",");
}
