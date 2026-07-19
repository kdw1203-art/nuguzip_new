/**
 * extract-checks — AI 분석 본문(마크다운/요약 불릿) 에서
 * "확인해야 할 포인트"·"주의할 점" 항목을 추출해 체크리스트 항목으로 변환.
 *
 * 사용처:
 *   - AttachToNoteButton: 임장 노트로 함께 전달
 *   - EnhancedChecklist seedChecks prop: 체크리스트 화면에 자동 주입
 *
 * 휴리스틱:
 *   1. 마크다운 본문에서 "주의 / 확인 / 체크 / 위험 / 점검" 키워드를 포함한
 *      줄을 우선 추출.
 *   2. resultSummary.bullets 가 있으면 위험·확인 키워드만 필터링.
 *   3. 줄 길이가 너무 길면 80자에서 자르고, 너무 짧으면 무시.
 */

const KEYWORDS = [
  "주의",
  "확인",
  "체크",
  "위험",
  "점검",
  "조심",
  "리스크",
  "검토",
  "유의",
];

const MAX_LEN = 80;
const MIN_LEN = 6;

function clean(line: string): string {
  return line
    .replace(/^[\s>\-*\d.]+/, "") // 마크다운 마커 제거
    .replace(/[*_`]+/g, "")
    .trim();
}

function looksLikeCheck(line: string): boolean {
  const c = clean(line);
  if (c.length < MIN_LEN) return false;
  return KEYWORDS.some((k) => c.includes(k));
}

function genId(seed: string, idx: number): string {
  // 안정적인 id — 같은 seed 면 같은 id
  const slug = seed
    .replace(/[^\u0000-\u00ff\uac00-\ud7af0-9a-zA-Z]/g, "")
    .slice(0, 24);
  return `ai-${slug || "check"}-${idx}`;
}

export type ExtractedCheck = {
  id: string;
  label: string;
  source: "markdown" | "bullet";
};

export function extractChecksFromBody(text: string | null | undefined): ExtractedCheck[] {
  if (!text) return [];
  const lines = text.split(/\r?\n/);
  const out: ExtractedCheck[] = [];
  let idx = 0;
  for (const raw of lines) {
    if (!looksLikeCheck(raw)) continue;
    const c = clean(raw).slice(0, MAX_LEN);
    if (out.some((x) => x.label === c)) continue;
    out.push({ id: genId(c, idx++), label: c, source: "markdown" });
    if (out.length >= 8) break;
  }
  return out;
}

export function extractChecksFromBullets(bullets: string[] | null | undefined): ExtractedCheck[] {
  if (!bullets || bullets.length === 0) return [];
  const out: ExtractedCheck[] = [];
  let idx = 0;
  for (const b of bullets) {
    if (!looksLikeCheck(b)) continue;
    const c = clean(b).slice(0, MAX_LEN);
    if (out.some((x) => x.label === c)) continue;
    out.push({ id: genId(c, idx++), label: c, source: "bullet" });
    if (out.length >= 6) break;
  }
  return out;
}

/** 본문 + 불릿을 모두 종합 (중복 제거, 최대 10개) */
export function extractChecks(
  body: string | null | undefined,
  bullets: string[] | null | undefined,
): ExtractedCheck[] {
  const a = extractChecksFromBody(body);
  const b = extractChecksFromBullets(bullets);
  const seen = new Set<string>();
  const merged: ExtractedCheck[] = [];
  for (const c of [...a, ...b]) {
    const key = c.label;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(c);
    if (merged.length >= 10) break;
  }
  return merged;
}
