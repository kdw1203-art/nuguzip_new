/**
 * chat/context-attachments — 챗봇(우리동네 AI 비서, ai-neighbor-fab) 이 사용할
 * 최근 분석/노트 컨텍스트를 sessionStorage 에 저장.
 *
 * 흐름:
 *   1. AI 분석 결과 화면 또는 임장 노트 작성 화면에서 setContext() 호출
 *   2. ai-neighbor-fab 입력창 위에 컨텍스트 칩 노출
 *   3. 사용자가 칩의 ✕ 로 제거하거나 자동 만료 (최대 1시간)
 *
 * 챗봇 호출 시 자동으로 컨텍스트가 prompt 에 첨부됩니다 (선택).
 */

const KEY = "woodong:chat:context:v1";
const MAX_AGE_MS = 60 * 60 * 1000; // 1시간

export type ChatContextAttachment = {
  /** 컨텍스트 종류 — 챗봇 입력 prompt 에 다르게 첨부 */
  kind: "ai-analysis" | "inspection-note";
  /** 칩 라벨 (사용자가 보는 텍스트) */
  label: string;
  /** 챗봇 prompt 에 첨부할 본문 (한 단락 정도) */
  body: string;
  /** 클릭 시 이동할 라우트 (선택) */
  href?: string;
  /** 공공데이터 컨텍스트용 구(행정구) */
  district?: string;
  intent?: string;
  createdAt: string;
};

export function setContext(att: Omit<ChatContextAttachment, "createdAt">): void {
  if (typeof window === "undefined") return;
  try {
    const payload: ChatContextAttachment = { ...att, createdAt: new Date().toISOString() };
    sessionStorage.setItem(KEY, JSON.stringify(payload));
    window.dispatchEvent(new CustomEvent("woodong:chat-context", { detail: payload }));
  } catch {
    // ignore
  }
}

export function getContext(): ChatContextAttachment | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ChatContextAttachment;
    const age = Date.now() - new Date(parsed.createdAt).getTime();
    if (age > MAX_AGE_MS) {
      sessionStorage.removeItem(KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearContext(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(KEY);
    window.dispatchEvent(new CustomEvent("woodong:chat-context", { detail: null }));
  } catch {
    // ignore
  }
}
