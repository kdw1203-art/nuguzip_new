/**
 * 단지 Q&A 공개 뷰 타입.
 *
 * 개인정보(author_email)는 절대 포함하지 않는다 — 목록/상세에는 마스킹된
 * `authorLabel` 만 노출한다(store.ts `maskEmail` 참고).
 */

export type QnaQuestion = {
  id: string;
  complexId: string | null;
  complexName: string | null;
  region: string | null;
  /** 마스킹된 작성자 라벨 (예: "kdw***"). 원본 이메일은 담지 않는다. */
  authorLabel: string;
  title: string;
  body: string;
  tags: string[];
  bountyPoints: number;
  /** 'open' | 'answered' | 'closed' */
  status: string;
  answerCount: number;
  viewCount: number;
  isSample: boolean;
  createdAt: string;
};

export type QnaAnswer = {
  id: string;
  questionId: string;
  /** 마스킹된 작성자 라벨 (예: "kdw***"). 원본 이메일은 담지 않는다. */
  authorLabel: string;
  body: string;
  isAccepted: boolean;
  helpfulCount: number;
  isSample: boolean;
  createdAt: string;
};
