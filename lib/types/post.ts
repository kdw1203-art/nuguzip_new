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
  /**
   * 연결된 단지 id — encodeComplexId(region, name) 의 base64url 값.
   * /complex/[id] 의 "노트" 탭이 이 값으로 글을 찾는다. 없으면 단지에 연결되지 않은 글.
   */
  complexId?: string;
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
