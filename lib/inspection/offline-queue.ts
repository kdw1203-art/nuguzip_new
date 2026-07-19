/** IndexedDB 기반 오프라인 업로드 큐 — 임장 세션 캡처용 */

const DB_NAME = "nuguzip-inspection";
const DB_VERSION = 1;
const STORE = "upload_queue";

export type OfflineQueueItem = {
  id: string;
  sessionId: string;
  type: "audio" | "photo" | "capture_patch";
  blob?: Blob;
  payload?: Record<string, unknown>;
  createdAt: string;
  retryCount: number;
  status: "pending" | "uploading" | "done" | "failed";
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB 미지원"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
  });
}

export async function enqueueOfflineItem(item: Omit<OfflineQueueItem, "retryCount" | "status">): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put({ ...item, retryCount: 0, status: "pending" });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function listPendingQueue(sessionId?: string): Promise<OfflineQueueItem[]> {
  const db = await openDb();
  const all = await new Promise<OfflineQueueItem[]>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve((req.result as OfflineQueueItem[]) ?? []);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return all.filter((i) => i.status === "pending" && (!sessionId || i.sessionId === sessionId));
}

export async function markQueueItem(
  id: string,
  patch: Partial<Pick<OfflineQueueItem, "status" | "retryCount">>,
): Promise<void> {
  const db = await openDb();
  const item = await new Promise<OfflineQueueItem | null>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve((req.result as OfflineQueueItem) ?? null);
    req.onerror = () => reject(req.error);
  });
  if (!item) {
    db.close();
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put({ ...item, ...patch });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function removeQueueItem(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

/** 네트워크 복귀 시 pending 항목 업로드 */
export async function flushOfflineQueue(
  uploadFn: (item: OfflineQueueItem) => Promise<boolean>,
): Promise<{ ok: number; failed: number }> {
  const pending = await listPendingQueue();
  let ok = 0;
  let failed = 0;
  for (const item of pending) {
    await markQueueItem(item.id, { status: "uploading" });
    try {
      const success = await uploadFn(item);
      if (success) {
        await removeQueueItem(item.id);
        ok++;
      } else {
        await markQueueItem(item.id, {
          status: "pending",
          retryCount: item.retryCount + 1,
        });
        failed++;
      }
    } catch {
      await markQueueItem(item.id, {
        status: item.retryCount >= 3 ? "failed" : "pending",
        retryCount: item.retryCount + 1,
      });
      failed++;
    }
  }
  return { ok, failed };
}
