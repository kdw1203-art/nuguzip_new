/**
 * 저장된 심화 분석(`inspection_notes.ai_analysis.deepDive`) **읽기 전용 파서**.
 *
 * 쓰는 쪽은 `lib/inspection/deep-dive.ts` 하나뿐이지만, 읽는 쪽은 노트 상세
 * 화면·카드 덱 등 여러 곳이다. 각자 jsonb 를 풀어 읽으면 곧 서로 다른 규칙이
 * 생기고(어떤 화면은 못 읽은 축을 감추고 어떤 화면은 "없음"으로 적는 식),
 * 그 순간 같은 노트가 화면마다 다른 사실을 말하게 된다. 그래서 파싱은 여기
 * 한 곳에서만 한다.
 *
 * 이 파일의 규칙:
 *  - 저장된 값만 옮긴다. 비어 있는 칸을 메우거나 문장을 지어내지 않는다.
 *  - `status: "unavailable"` 인 축을 **버리지 않는다**. 확인하지 못한 축은
 *    "확인하지 못했다"고 그대로 보여야 한다. 감추면 읽는 사람에게는
 *    "그런 축은 원래 없다"로 보인다.
 *  - 모양이 깨진 값(문자열 아님·배열 아님)은 조용히 건너뛴다. 화면 하나
 *    때문에 노트 전체가 안 열리는 쪽이 더 나쁘다.
 *
 * 서버 전용 의존성을 쓰지 않는다 — 서버 컴포넌트에서 그대로 부를 수 있어야
 * 한다.
 */

export type StoredDeepDiveStatus = "ok" | "partial" | "unavailable";

export type StoredDeepDiveFact = {
  label: string;
  value: string;
  source: string;
};

export type StoredDeepDiveSection = {
  id: string;
  label: string;
  eyebrow: string;
  headline: string;
  bullets: string[];
  facts: StoredDeepDiveFact[];
  status: StoredDeepDiveStatus;
  /** 왜 일부만/전혀 못 채웠는지. 비어 있을 수 있다. */
  note: string;
  sources: string[];
  /** LLM 이 붙인 해석 한 줄. 숫자는 들어오지 않는다(프롬프트·파서에서 차단). */
  insight: string;
};

export type StoredDeepDive = {
  version: number;
  builtAt: string;
  sections: StoredDeepDiveSection[];
  /** 못 읽은 소스의 사유 목록 */
  gaps: string[];
  disclaimer: string;
};

function record(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function text(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function textList(value: unknown, maxItems: number, max: number): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    const s = text(item, max);
    if (s && !out.includes(s)) out.push(s);
    if (out.length >= maxItems) break;
  }
  return out;
}

function status(value: unknown): StoredDeepDiveStatus {
  const s = text(value, 20);
  if (s === "ok" || s === "partial") return s;
  /* 모르는 값은 unavailable 로 떨어뜨린다 — 확인되지 않은 것을
     확인된 것처럼 올려 주지 않는다. */
  return "unavailable";
}

/** 축 id → 해석 한 줄. 원본(inspectionReport)을 먼저 보고 펼친 키를 뒤에 본다. */
function readInsights(analysis: Record<string, unknown>): Map<string, string> {
  const nested = record(analysis.inspectionReport);
  const raw = nested?.deepDiveInsights ?? analysis.deepDiveInsights;
  const out = new Map<string, string>();
  if (!Array.isArray(raw)) return out;
  for (const item of raw) {
    const o = record(item);
    if (!o) continue;
    const id = text(o.id, 24);
    const insight = text(o.insight, 160);
    if (id && insight && !out.has(id)) out.set(id, insight);
  }
  return out;
}

function readFacts(value: unknown): StoredDeepDiveFact[] {
  if (!Array.isArray(value)) return [];
  const out: StoredDeepDiveFact[] = [];
  for (const item of value) {
    const o = record(item);
    if (!o) continue;
    const label = text(o.label, 30);
    const factValue = text(o.value, 80);
    if (!label || !factValue) continue;
    out.push({ label, value: factValue, source: text(o.source, 60) });
    if (out.length >= 10) break;
  }
  return out;
}

/**
 * `ai_analysis` → 저장된 심화 분석. 저장된 적이 없으면 null.
 * 축이 하나도 파싱되지 않으면(모양이 깨졌으면) null 을 돌려준다 —
 * 빈 껍데기를 "분석 있음"으로 보여 주지 않기 위해서다.
 */
export function readStoredDeepDive(
  analysis: Record<string, unknown> | null | undefined,
): StoredDeepDive | null {
  if (!analysis) return null;
  const raw = record(analysis.deepDive);
  if (!raw) return null;

  const insights = readInsights(analysis);
  const sections: StoredDeepDiveSection[] = [];

  if (Array.isArray(raw.sections)) {
    for (const item of raw.sections) {
      const sec = record(item);
      if (!sec) continue;
      const id = text(sec.id, 24);
      const label = text(sec.label, 40);
      if (!id || !label) continue;
      const sectionStatus = status(sec.status);
      sections.push({
        id,
        label,
        eyebrow: text(sec.eyebrow, 40) || "심화 분석",
        headline: text(sec.headline, 160),
        bullets: textList(sec.bullets, 8, 240),
        facts: readFacts(sec.facts),
        status: sectionStatus,
        note: text(sec.note, 200),
        sources: textList(sec.sources, 6, 60),
        /* 확인하지 못한 축에는 해석을 붙이지 않는다. 프롬프트에서도 막고
           있지만, 저장된 값이 어떻든 읽는 쪽에서도 한 번 더 막는다. */
        insight: sectionStatus === "unavailable" ? "" : (insights.get(id) ?? ""),
      });
    }
  }

  if (sections.length === 0) return null;

  return {
    version: typeof raw.version === "number" ? raw.version : 0,
    builtAt: text(raw.builtAt, 40),
    sections,
    gaps: textList(raw.gaps, 12, 200),
    disclaimer: text(raw.disclaimer, 300),
  };
}

/** 실제로 내용이 붙은 축 수 — "8축 중 N축" 표기에 쓴다. */
export function filledStoredAxisCount(deepDive: StoredDeepDive): number {
  return deepDive.sections.filter((s) => s.status !== "unavailable").length;
}
