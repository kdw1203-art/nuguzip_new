/**
 * 임장노트 임시저장(draft) 요약 읽기 — 홈 "이어서 보기" 패널용 (고도화 8·21).
 *
 * 저장은 NoteForm(작성 화면)만 한다. 여기서는 **읽기만** — 홈에서 "작성 중인
 * 노트가 있다"는 사실을 알려 복귀 동선을 만들기 위해서다. 키 문자열이 두 파일에
 * 흩어지면 한쪽 변경 시 홈 배너가 조용히 죽으므로 키는 여기 한 곳에만 둔다.
 *
 * 브라우저 전용(localStorage) — useEffect/핸들러 안에서만 부를 것.
 */

export const NOTE_DRAFT_KEY = "nz_note_draft";

export interface NoteDraftSummary {
  /** 마지막 자동 저장 시각 (ISO) */
  savedAt: string;
  /** 작성 중이던 단지명 (없으면 null) */
  aptName: string | null;
  /** 작성 중이던 지역 (없으면 null) */
  region: string | null;
}

/**
 * 유효한 임시저장이 있으면 요약을, 없거나 형식이 깨졌으면 null.
 * 검증은 NoteForm.parseDraft 의 부분집합만 한다 — 여기서 필요한 건
 * "복구 가능한 드래프트가 존재한다"는 사실과 표시용 두 필드뿐이다.
 */
export function readNoteDraftSummary(): NoteDraftSummary | null {
  try {
    const raw = window.localStorage.getItem(NOTE_DRAFT_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as Record<string, unknown> | null;
    if (!o || typeof o !== "object" || o.v !== 1) return null;
    if (typeof o.savedAt !== "string" || !o.savedAt) return null;
    const loc =
      o.loc && typeof o.loc === "object" ? (o.loc as Record<string, unknown>) : null;
    const aptName =
      loc && typeof loc.aptName === "string" && loc.aptName.trim()
        ? loc.aptName.trim()
        : null;
    const region =
      loc && typeof loc.region === "string" && loc.region.trim()
        ? loc.region.trim()
        : null;
    return { savedAt: o.savedAt, aptName, region };
  } catch {
    return null; // 파싱 실패·프라이빗 모드 — 배너를 띄우지 않는다
  }
}
