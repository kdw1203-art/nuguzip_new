/** 사용자·기능별 quota 연산 직렬화 (동시 요청 race 완화) */
const lockTails = new Map<string, Promise<void>>();

export async function withUserQuotaLock<T>(
  key: string,
  fn: () => Promise<T>,
): Promise<T> {
  const tail = lockTails.get(key) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  lockTails.set(
    key,
    tail.then(() => gate),
  );
  await tail;
  try {
    return await fn();
  } finally {
    release();
  }
}
