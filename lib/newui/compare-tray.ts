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

/* ===== #46 비교 트레이 서버 승격 — 구 user_watchlist 쓰기 API(/api/me/watchlist) =====
 * 로그인 상태면 담기/빼기를 서버 관심 단지 목록에도 반영하고,
 * /analysis/compare 진입 시 서버 목록을 로컬 트레이에 병합한다.
 * 비로그인(401)·네트워크 실패 시 조용히 무시 — localStorage 트레이만 유지. */

/** 담기 시 서버 승격 (fire-and-forget, 실패 무시) */
export function promoteCompareItemToServer(item: { id: string; name: string }): void {
  if (typeof window === "undefined") return;
  try {
    void fetch("/api/me/watchlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ complexId: item.id, complexName: item.name }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // 실패 시 localStorage 트레이만 유지
  }
}

/** 빼기 시 서버 목록에서도 제거 (fire-and-forget, 실패 무시) */
export function removeCompareItemFromServer(id: string): void {
  if (typeof window === "undefined") return;
  try {
    void fetch(`/api/me/watchlist?complexId=${encodeURIComponent(id)}`, {
      method: "DELETE",
      keepalive: true,
    }).catch(() => {});
  } catch {
    // no-op
  }
}

/** 서버 user_watchlist 목록 조회 — 비로그인(401)·실패 시 null */
export async function fetchServerCompareList(): Promise<CompareTrayItem[] | null> {
  if (typeof window === "undefined") return null;
  try {
    const res = await fetch("/api/me/watchlist");
    if (!res.ok) return null;
    const json = (await res.json().catch(() => null)) as { items?: unknown } | null;
    if (!json || !Array.isArray(json.items)) return null;
    const out: CompareTrayItem[] = [];
    for (const raw of json.items) {
      if (!raw || typeof raw !== "object") continue;
      const o = raw as Record<string, unknown>;
      if (typeof o.complexId !== "string" || typeof o.complexName !== "string") continue;
      out.push({
        id: o.complexId,
        name: o.complexName,
        addedAt:
          typeof o.createdAt === "string" ? o.createdAt : new Date().toISOString(),
      });
    }
    return out;
  } catch {
    return null;
  }
}

/** 로그인 상태면 서버 목록을 로컬 트레이에 병합(중복 제외, 최대 5개) 후 최종 목록 반환 */
export async function mergeServerCompareTray(): Promise<CompareTrayItem[]> {
  const server = await fetchServerCompareList();
  if (!server) return listCompareTray();
  for (const item of server) {
    if (listCompareTray().length >= COMPARE_TRAY_MAX) break;
    addToCompareTray({ id: item.id, name: item.name });
  }
  return listCompareTray();
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
