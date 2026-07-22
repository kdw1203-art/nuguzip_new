/**
 * 노트 템플릿 마켓 — 공용 타입.
 *
 * `note_templates` 테이블(RLS deny-all)의 행을 앱 계층에서 다루기 위한
 * 정규화된 타입 정의. DB 접근은 `@/lib/note-templates/store` (server-only) 만 수행한다.
 */

/** 템플릿의 한 섹션 — 제목 + 체크 항목 목록 */
export type TemplateSection = {
  title: string;
  items: string[];
};

/** 임장 노트 템플릿 (공식 내장 + 사용자 공개 템플릿 공통 형태) */
export type NoteTemplate = {
  id: string;
  authorEmail: string | null;
  title: string;
  description: string;
  category: string;
  sections: TemplateSection[];
  tags: string[];
  useCount: number;
  isOfficial: boolean;
  isPublic: boolean;
  isSample: boolean;
  createdAt: string;
  updatedAt: string | null;
};

/** 카테고리 칩 목록 — "전체" 는 필터 해제(전부 표시) */
export const CATEGORIES = [
  "전체",
  "기본",
  "신축",
  "전월세",
  "재건축",
  "투자",
] as const;

export type Category = (typeof CATEGORIES)[number];
