import { OPEN_BETA_TASKS, type OpenBetaTask } from "./checklist";

let tasks: OpenBetaTask[] = OPEN_BETA_TASKS.map((t) => ({ ...t }));

export async function listTasks(): Promise<OpenBetaTask[]> {
  return tasks;
}

export async function updateTask(
  id: string,
  patch: Partial<Pick<OpenBetaTask, "status" | "owner" | "dueDate" | "note">>,
): Promise<OpenBetaTask | null> {
  const idx = tasks.findIndex((t) => t.id === id);
  if (idx < 0) return null;
  tasks[idx] = { ...tasks[idx], ...patch };
  return tasks[idx];
}

/** 개발/데모용 — 운영에서는 DB 동기화 후 사용. */
export async function resetTasks(): Promise<OpenBetaTask[]> {
  tasks = OPEN_BETA_TASKS.map((t) => ({ ...t }));
  return tasks;
}
