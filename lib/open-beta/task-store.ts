import "server-only";
import { getServiceSupabase } from "@/lib/supabase/service";
import type { GateStatus, OpenBetaTask } from "@/lib/open-beta/checklist";
import { listOpenBetaTasks, updateOpenBetaTask } from "@/lib/open-beta/store-db";
import { listTasks, updateTask } from "@/lib/open-beta/store-memory";
import { logger } from "@/lib/log";

export type OpenBetaTaskPatch = Partial<{
  status: GateStatus;
  owner: string;
  dueDate: string;
  note: string;
}>;

/** Service Role + 테이블이 있으면 DB, 아니면 인메모리(로컬·마이그레이션 전). */
export async function listOpenBetaTasksResolved(): Promise<OpenBetaTask[]> {
  if (getServiceSupabase()) {
    try {
      return await listOpenBetaTasks();
    } catch (e) {
      logger.error("[open-beta] listOpenBetaTasks failed, using memory store", e);
    }
  }
  return listTasks();
}

export async function updateOpenBetaTaskResolved(
  id: string,
  patch: OpenBetaTaskPatch,
): Promise<OpenBetaTask | null> {
  if (getServiceSupabase()) {
    try {
      const fromDb = await updateOpenBetaTask(id, {
        status: patch.status,
        owner: patch.owner !== undefined ? patch.owner : undefined,
        dueDate: patch.dueDate !== undefined ? patch.dueDate : undefined,
        note: patch.note !== undefined ? patch.note : undefined,
      });
      if (fromDb) return fromDb;
    } catch (e) {
      logger.error("[open-beta] updateOpenBetaTask failed, trying memory store", e);
    }
  }
  return updateTask(id, patch);
}
