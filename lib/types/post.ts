export type PostComment = {
  id: string;
  authorLabel: string;
  body: string;
  createdAt: string;
  /** soft-delete 시각 (ISO) */
  deletedAt?: string | null;
};

export type PostVisibility = "public" | "link_only";

export type PostAutomationMeta = {
  displayAuthor?: string;
  sourceKind?: string;
  originalTitle?: string;
  collectedAt?: string;
  publishedText?: string;
  regionHint?: string;
  [key: string]: unknown;
};

export type Post = {
  id: string;
  authorLabel: string;
  category: string;
  city: string;
  district: string;
  title: string;
  body: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  likeCount: number;
  commentCount: number;
  viewCount: number;
  bookmarkCount?: number;
  comments: PostComment[];
  /** 관련 단지·사업장명 (Info Hub 연계용) */
  relatedSite?: string;
  sourceUrl?: string;
  sourceName?: string;
  sourcePublishedAt?: string;
  externalKey?: string;
  isAutomated?: boolean;
  automationMeta?: PostAutomationMeta;
  visibility?: PostVisibility;
  notifyComments?: boolean;
  /** 로그인 작성 시 댓글 알림 수신 주소 (서버만 저장) */
  notifyEmail?: string;
  /** UGC 유형 — question|review|tip|general */
  ugcPostType?: "question" | "review" | "tip" | "general";
};
