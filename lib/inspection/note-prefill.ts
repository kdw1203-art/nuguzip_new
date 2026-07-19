/**
 * note-prefill — AI 분석 결과를 임장 노트 작성 화면으로 넘기기 위한 임시 저장소.
 *
 * 흐름:
 *   1. AI 결과 화면에서 AttachToNoteButton 클릭 → savePrefill() 호출
 *   2. /inspection/create 로 이동 (?from=ai-analysis 쿼리)
 *   3. note-editor 마운트 시 consumePrefill() 로 한 번만 읽어와 폼에 주입
 *
 * sessionStorage 사용 — 같은 탭 내에서만 유효, 한 번 사용 후 삭제.
 */

const KEY = "woodong:note-prefill:v1";

export type NotePrefill = {
  /** AI 도구 ID (출처 표시용) */
  source?: string;
  /** 분석 시각 (ISO) */
  createdAt?: string;
  /** 노트 제목 후보 */
  title?: string;
  /** 지역 (예: 강남구 역삼동) */
  region?: string;
  /** 단지명 */
  aptName?: string;
  /** 한 줄 요약 — summary 필드에 채움 */
  summary?: string;
  /** 분석 본문 마크다운 (memo 섹션에 통째로 첨부) */
  bodyMd?: string;
  /** 체크 포인트 자동 추가 — extract-checks.ts 의 결과를 그대로 전달 */
  seedChecks?: Array<{ id: string; label: string }>;
};

export function savePrefill(payload: NotePrefill): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(
      KEY,
      JSON.stringify({ ...payload, createdAt: payload.createdAt ?? new Date().toISOString() }),
    );
  } catch {
    // ignore — quota / private mode
  }
}

export function consumePrefill(): NotePrefill | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    sessionStorage.removeItem(KEY);
    return JSON.parse(raw) as NotePrefill;
  } catch {
    return null;
  }
}

export function peekPrefill(): NotePrefill | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as NotePrefill;
  } catch {
    return null;
  }
}
