export type PostComment = {
  id: string;
  authorLabel: string;
  body: string;
  createdAt: string;
  /**
   * 작성자 로그인 이메일(소문자) — **서버 전용**. 삭제 권한 판정의 유일한 근거다
   * (authorLabel 은 사용자가 고르는 표시 이름이라 신원이 아니다).
   * Post.notifyEmail 과 같은 규칙으로, rowToPost 는 이 값을 응답용 Post 에 싣지 않는다.
   * 비로그인 댓글은 값이 없고, 그런 댓글은 작성자 본인이 지울 수 없다(글쓴이·관리자만).
   */
  authorEmail?: string;
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
  /** 포인트 추천글 부스트 만료(ISO) — null/과거면 비활성 (spend:post_boost_*) */
  boostUntil?: string | null;
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
  /**
   * 작성자 로그인 이메일 — **서버 전용 신원값**. 포인트 추천글 부스트의 소유
   * 판정(posts.author_email = 세션 이메일)과 닉네임 효과의 작성자 프로필 조회가
   * 이 컬럼을 쓴다(매물 listings.author_email 과 같은 규칙). notifyEmail 은
   * "알림 받을 주소"라는 설정값이라 신원으로 쓰기엔 부적합해 따로 둔다.
   * rowToPost 는 이 값을 응답용 Post 에 싣지 않고(개인정보), API 응답 직전에도
   * notifyEmail 과 함께 벗긴다.
   */
  authorEmail?: string;
  /** UGC 유형 — question|review|tip|general */
  ugcPostType?: "question" | "review" | "tip" | "general";
};
