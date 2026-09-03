/**
 * expert_reviews — 전문가 상담 후기·평점 (953).
 *
 * 규칙
 *  · 답변이 완료된 상담(replied_at 존재)에만, 그 상담의 의뢰자만, 상담당 1건.
 *  · 저장 뒤 expert_profiles.rating(평균, 소수 2자리)·reviews(건수)를 다시 계산해 써 넣는다 —
 *    두 컬럼은 953 전까지 아무도 쓰지 않는 상수 0 이었다(목록·상세가 "평가 없음"으로 그렸다).
 *  · 공개 목록은 reviewer_email 을 싣지 않는다(마스킹 라벨만).
 *  · Supabase 미설정 시 인메모리 폴백(다른 전문가 스토어와 동일).
 */
import { getServiceSupabase } from "@/lib/supabase/service";
import { normalizeReviewComment, reviewerLabelOf, summarizeRatings } from "./review-rules";

export type ExpertReview = {
  id: string;
  expertId: string;
  consultationId: string;
  reviewerLabel: string;
  rating: number;
  comment: string | null;
  createdAt: string;
};

const memory: Array<ExpertReview & { reviewerEmail: string; isPublic: boolean }> = [];

function mapRow(r: Record<string, unknown>): ExpertReview {
  return {
    id: String(r.id ?? ""),
    expertId: String(r.expert_id ?? ""),
    consultationId: String(r.consultation_id ?? ""),
    reviewerLabel: String(r.reviewer_label ?? "이웃"),
    rating: Number(r.rating ?? 0),
    comment: r.comment ? String(r.comment) : null,
    createdAt: String(r.created_at ?? ""),
  };
}

/** 공개 후기 목록(최신순) — 상세 페이지·API */
export async function listPublicReviews(expertId: string, limit = 20): Promise<ExpertReview[]> {
  const sb = getServiceSupabase();
  if (!sb) {
    return memory
      .filter((r) => r.expertId === expertId && r.isPublic)
      .slice(0, limit)
      .map(({ reviewerEmail: _e, isPublic: _p, ...rest }) => rest);
  }
  const { data, error } = await sb
    .from("expert_reviews")
    .select("id, expert_id, consultation_id, reviewer_label, rating, comment, created_at")
    .eq("expert_id", expertId)
    .eq("is_public", true)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return [];
  return (data ?? []).map((r) => mapRow(r as Record<string, unknown>));
}

/** 의뢰자가 이미 남긴 후기가 있는 상담 id 집합 — 상담함에서 "후기 쓰기" 버튼 결정 */
export async function reviewedConsultationIds(reviewerEmail: string): Promise<Set<string>> {
  const em = reviewerEmail.trim().toLowerCase();
  const sb = getServiceSupabase();
  if (!sb) return new Set(memory.filter((r) => r.reviewerEmail === em).map((r) => r.consultationId));
  const { data, error } = await sb
    .from("expert_reviews")
    .select("consultation_id")
    .eq("reviewer_email", em)
    .limit(500);
  if (error) return new Set();
  return new Set((data ?? []).map((r) => String((r as { consultation_id: unknown }).consultation_id)));
}

export type CreateReviewResult =
  | { ok: true; review: ExpertReview; aggregate: { rating: number; reviews: number } }
  | { ok: false; code: "not_found" | "forbidden" | "not_replied" | "duplicate" | "invalid" | "unavailable"; message: string };

/**
 * 후기 작성 — 서버 라우트가 세션 이메일을 넘긴다. 상담 소유·답변 완료·중복을 여기서 판정한다.
 */
export async function createReview(input: {
  consultationId: string;
  reviewerEmail: string;
  reviewerName?: string | null;
  rating: number;
  comment?: string | null;
}): Promise<CreateReviewResult> {
  const rating = Math.round(Number(input.rating));
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    return { ok: false, code: "invalid", message: "별점은 1~5점 사이여야 해요." };
  }
  const comment = normalizeReviewComment(input.comment);
  if (comment.error) return { ok: false, code: "invalid", message: comment.error };
  const em = input.reviewerEmail.trim().toLowerCase();
  const label = reviewerLabelOf(input.reviewerName, em);

  const sb = getServiceSupabase();
  if (!sb) {
    /* 인메모리 폴백은 상담 원장을 볼 수 없으므로 중복만 막는다(개발 환경용). */
    if (memory.some((r) => r.consultationId === input.consultationId)) {
      return { ok: false, code: "duplicate", message: "이미 후기를 남긴 상담이에요." };
    }
    const review: ExpertReview & { reviewerEmail: string; isPublic: boolean } = {
      id: crypto.randomUUID(),
      expertId: "mem",
      consultationId: input.consultationId,
      reviewerLabel: label,
      rating,
      comment: comment.value,
      createdAt: new Date().toISOString(),
      reviewerEmail: em,
      isPublic: true,
    };
    memory.unshift(review);
    const { reviewerEmail: _e, isPublic: _p, ...pub } = review;
    return { ok: true, review: pub, aggregate: { rating, reviews: memory.length } };
  }

  const { data: consult, error: cErr } = await sb
    .from("expert_consultations")
    .select("id, expert_id, requester_email, replied_at")
    .eq("id", input.consultationId)
    .maybeSingle();
  if (cErr) return { ok: false, code: "unavailable", message: "상담을 지금 확인할 수 없어요. 잠시 후 다시 시도해 주세요." };
  if (!consult) return { ok: false, code: "not_found", message: "상담을 찾을 수 없어요." };
  const row = consult as { id: string; expert_id: string; requester_email: string; replied_at: string | null };
  if (String(row.requester_email ?? "").trim().toLowerCase() !== em) {
    return { ok: false, code: "forbidden", message: "내가 신청한 상담에만 후기를 남길 수 있어요." };
  }
  if (!row.replied_at) {
    return { ok: false, code: "not_replied", message: "전문가 답변이 도착한 뒤에 후기를 남길 수 있어요." };
  }

  const { data, error } = await sb
    .from("expert_reviews")
    .insert({
      expert_id: row.expert_id,
      consultation_id: row.id,
      reviewer_email: em,
      reviewer_label: label,
      rating,
      comment: comment.value,
    })
    .select("id, expert_id, consultation_id, reviewer_label, rating, comment, created_at")
    .single();
  if (error) {
    if (error.code === "23505") {
      return { ok: false, code: "duplicate", message: "이미 후기를 남긴 상담이에요." };
    }
    return { ok: false, code: "unavailable", message: "후기를 저장하지 못했어요. 잠시 후 다시 시도해 주세요." };
  }

  const aggregate = await recomputeExpertRating(row.expert_id);
  return { ok: true, review: mapRow(data as Record<string, unknown>), aggregate };
}

/**
 * expert_profiles.rating / reviews 재계산. 후기 작성·삭제 뒤 호출.
 * PostgREST 는 avg() 를 못 하므로 rating 열만 받아 JS 에서 센다(전문가당 후기 수는 작다).
 */
export async function recomputeExpertRating(
  expertId: string,
): Promise<{ rating: number; reviews: number }> {
  const sb = getServiceSupabase();
  if (!sb) {
    const mine = memory.filter((r) => r.expertId === expertId && r.isPublic).map((r) => r.rating);
    return summarizeRatings(mine);
  }
  const { data, error } = await sb
    .from("expert_reviews")
    .select("rating")
    .eq("expert_id", expertId)
    .eq("is_public", true)
    .limit(5000);
  if (error) return { rating: 0, reviews: 0 };
  const agg = summarizeRatings((data ?? []).map((r) => Number((r as { rating: unknown }).rating)));
  await sb
    .from("expert_profiles")
    .update({ rating: agg.rating, reviews: agg.reviews, updated_at: new Date().toISOString() })
    .eq("id", expertId);
  return agg;
}
