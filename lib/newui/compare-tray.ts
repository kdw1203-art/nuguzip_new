/**
 * 비교 담기 트레이 — localStorage 기반 클라이언트 헬퍼.
 * "use client" 컴포넌트에서만 호출할 것 (서버에서는 항상 빈 배열/no-op).
 * 최대 5개 후보를 담아 /analysis/compare 에서 표시한다.
 */

export type CompareTrayItem = {
  id: string;
  name: string;
  region?: string;
  addedAt: string;
};

export const COMPARE_TRAY_MAX = 5;

const STORAGE_KEY = "nuguzip:compare-tray:v1";

/** 같은 탭 내 변경 전파용 커스텀 이벤트 (다른 탭은 storage 이벤트로 전파) */
export const COMPARE_TRAY_EVENT = "nuguzip:compare-tray-change";

function canUseStorage(): boolean {
  try {
    return typeof window !== "undefined" && Boolean(window.localStorage);
  } catch {
    return false;
  }
}

function isTrayItem(v: unknown): v is CompareTrayItem {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return typeof o.id === "string" && typeof o.name === "string";
}

/** 담은 후보 목록 (최신 담은 순서 유지, 최대 5개) */
export function listCompareTray(): CompareTrayItem[] {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isTrayItem).slice(0, COMPARE_TRAY_MAX);
  } catch {
    return [];
  }
}

function writeTray(items: CompareTrayItem[]): void {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(items.slice(0, COMPARE_TRAY_MAX)),
    );
    window.dispatchEvent(new Event(COMPARE_TRAY_EVENT));
  } catch {
    // 프라이빗 모드 등 저장 불가 환경 — 조용히 무시
  }
}

export function isInCompareTray(id: string): boolean {
  return listCompareTray().some((i) => i.id === id);
}

export type AddToCompareTrayResult =
  | { ok: true; items: CompareTrayItem[] }
  | { ok: false; reason: "full" | "unavailable"; items: CompareTrayItem[] };

/** 후보 담기 — 이미 있으면 성공 취급, 5개 초과 시 reason: "full" */
export function addToCompareTray(input: {
  id: string;
  name: string;
  region?: string;
}): AddToCompareTrayResult {
  if (!canUseStorage()) return { ok: false, reason: "unavailable", items: [] };
  const items = listCompareTray();
  if (items.some((i) => i.id === input.id)) return { ok: true, items };
  if (items.length >= COMPARE_TRAY_MAX) {
    return { ok: false, reason: "full", items };
  }
  const next = [
    ...items,
    {
      id: input.id,
      name: input.name,
      ...(input.region ? { region: input.region } : {}),
      addedAt: new Date().toISOString(),
    },
  ];
  writeTray(next);
  return { ok: true, items: next };
}

/** 후보 제거 — 제거 후 목록 반환 */
export function removeFromCompareTray(id: string): CompareTrayItem[] {
  const next = listCompareTray().filter((i) => i.id !== id);
  writeTray(next);
  return next;
}

/**
 * 담김 상태 토글.
 * 반환 inTray: 토글 후 담김 여부, full: 가득 차서 담지 못한 경우 true
 */
export function toggleCompareTray(input: {
  id: string;
  name: string;
  region?: string;
}): { inTray: boolean; full: boolean; items: CompareTrayItem[] } {
  if (isInCompareTray(input.id)) {
    const items = removeFromCompareTray(input.id);
    return { inTray: false, full: false, items };
  }
  const r = addToCompareTray(input);
  if (r.ok) return { inTray: true, full: false, items: r.items };
  return { inTray: false, full: r.reason === "full", items: r.items };
}

/** 트레이 변경 구독 (같은 탭 커스텀 이벤트 + 다른 탭 storage 이벤트). 해제 함수 반환 */
export function subscribeCompareTray(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = () => cb();
  window.addEventListener(COMPARE_TRAY_EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(COMPARE_TRAY_EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}
