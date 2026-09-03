/**
 * 후기·지표 순수 규칙 (953) — DB 없이 테스트한다.
 *
 *  · normalizeReviewComment: 길이 상한, 연락처·계좌·외부 결제 유도 문자열 차단
 *    (fraud-guards 와 같은 정책 — 후기 본문은 공개되므로 더 엄격하게).
 *  · reviewerLabelOf: 닉네임이 있으면 앞 글자만 + "**", 없으면 이메일 로컬 2자 + "**".
 *  · summarizeRatings: 평균(소수 1자리 반올림·DB 는 numeric(3,2))·건수.
 *  · responseStats: 상담 원장에서 응답률·중앙값 응답 시간을 센다.
 */
import { scanExpertConversationText, hasBlockingFraudHit } from "./fraud-guards";

export const REVIEW_COMMENT_MAX = 300;

export function normalizeReviewComment(
  raw: string | null | undefined,
): { value: string | null; error?: string } {
  const s = (raw ?? "").replace(/\s+/g, " ").trim();
  if (!s) return { value: null };
  if (s.length > REVIEW_COMMENT_MAX) {
    return { value: null, error: `후기는 ${REVIEW_COMMENT_MAX}자 이하로 적어 주세요.` };
  }
  const hits = scanExpertConversationText(s);
  if (hasBlockingFraudHit(hits) || hits.some((h) => h.ruleId === "contact_leak")) {
    return {
      value: null,
      error: "후기에는 전화번호·계좌·외부 결제 안내를 적을 수 없어요.",
    };
  }
  return { value: s };
}

export function reviewerLabelOf(name: string | null | undefined, email: string): string {
  const n = (name ?? "").trim();
  if (n && !n.includes("@")) {
    const first = Array.from(n)[0] ?? "";
    return `${first}** 이웃`;
  }
  const local = email.split("@")[0] ?? "";
  return `${local.slice(0, 2) || "이웃"}** 이웃`;
}

export function summarizeRatings(ratings: number[]): { rating: number; reviews: number } {
  const valid = ratings.filter((r) => Number.isFinite(r) && r >= 1 && r <= 5);
  if (valid.length === 0) return { rating: 0, reviews: 0 };
  const avg = valid.reduce((a, b) => a + b, 0) / valid.length;
  return { rating: Math.round(avg * 100) / 100, reviews: valid.length };
}

export type ConsultLike = {
  createdAt: string;
  repliedAt: string | null;
  status: string;
};

/**
 * 응답률(%)·응답 시간 중앙값(시간). 대상은 최근 `windowDays` 안에 들어온 상담.
 * 마감(closed)된 미답변 건은 분모에서 뺀다(의뢰자가 철회한 경우).
 */
export function responseStats(
  items: ConsultLike[],
  now = Date.now(),
  windowDays = 90,
): { responseRate: number | null; medianHours: number | null; answered: number; total: number } {
  const since = now - windowDays * 86_400_000;
  const recent = items.filter((c) => {
    const t = Date.parse(c.createdAt);
    return Number.isFinite(t) && t >= since && !(c.status === "closed" && !c.repliedAt);
  });
  const answered = recent.filter((c) => c.repliedAt);
  const hours = answered
    .map((c) => (Date.parse(c.repliedAt!) - Date.parse(c.createdAt)) / 3_600_000)
    .filter((h) => Number.isFinite(h) && h >= 0)
    .sort((a, b) => a - b);
  const median =
    hours.length === 0
      ? null
      : hours.length % 2
        ? hours[(hours.length - 1) / 2]!
        : (hours[hours.length / 2 - 1]! + hours[hours.length / 2]!) / 2;
  return {
    responseRate: recent.length === 0 ? null : Math.round((answered.length / recent.length) * 100),
    medianHours: median === null ? null : Math.round(median * 10) / 10,
    answered: answered.length,
    total: recent.length,
  };
}

/** 응답 시간 표시 라벨 — 실측이 있으면 실측, 없으면 전문가가 적은 안내문 */
export function responseTimeLabel(
  medianHours: number | null,
  declared: string | null | undefined,
): string | null {
  if (medianHours !== null) {
    if (medianHours < 1) return "1시간 내 답변";
    if (medianHours < 24) return `약 ${Math.round(medianHours)}시간 내 답변`;
    return `약 ${Math.round(medianHours / 24)}일 내 답변`;
  }
  const d = (declared ?? "").trim();
  return d && d !== "대기" ? d : null;
}
