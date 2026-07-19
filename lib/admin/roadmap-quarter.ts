/** 서버·클라이언트 공용 분기 키 (예: 2026Q2). */
export function currentQuarter(): string {
  const d = new Date();
  const q = Math.floor(d.getMonth() / 3) + 1;
  return `${d.getFullYear()}Q${q}`;
}

export function buildQuarters(): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let offset = -2; offset <= 4; offset++) {
    const m = now.getMonth() + offset * 3;
    const d = new Date(now.getFullYear(), m, 1);
    const q = Math.floor(d.getMonth() / 3) + 1;
    const id = `${d.getFullYear()}Q${q}`;
    if (!out.includes(id)) out.push(id);
  }
  return out;
}
