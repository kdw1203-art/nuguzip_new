import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/log";

export interface ComplexReview {
  id: string;
  complexId: string;
  complexName: string;
  authorEmail: string;
  noiseScore: number;
  parkingScore: number;
  mgmtScore: number;
  neighborScore: number;
  transportScore: number;
  comment: string | null;
  createdAt: string;
  /** 도움돼요 누적 수 */
  helpfulCount: number;
  /** 실거주(자가/세입자) 인증 */
  isResident: boolean;
  /** 방문(임장) 인증 */
  isVisitVerified: boolean;
  /** 거주/방문 시기 (예: "2023~2024", 자유 입력) */
  residentPeriod: string | null;
}

/**
 * 후기 생성/갱신 입력 — 신규 신뢰 신호(실거주/방문/시기)는 선택값.
 * 생략 시 기존 동작을 유지한다(false / null). `helpfulCount` 는 서버가 관리하므로 입력에서 제외.
 */
export type ComplexReviewInput = Omit<
  ComplexReview,
  "id" | "createdAt" | "helpfulCount" | "isResident" | "isVisitVerified" | "residentPeriod"
> & {
  isResident?: boolean;
  isVisitVerified?: boolean;
  residentPeriod?: string | null;
};

export interface ReviewSummary {
  count: number;
  avgNoise: number;
  avgParking: number;
  avgMgmt: number;
  avgNeighbor: number;
  avgTransport: number;
  overall: number;
}

const inMemory: ComplexReview[] = [];
/** 서비스 롤 미설정(로컬/테스트) 환경용 도움돼요 중복 방지 집합 — key: `${reviewId}::${voterEmail}` */
const inMemoryVotes = new Set<string>();

function dbToReview(r: Record<string, unknown>): ComplexReview {
  return {
    id: String(r.id),
    complexId: String(r.complex_id),
    complexName: String(r.complex_name),
    authorEmail: String(r.author_email),
    noiseScore: Number(r.noise_score),
    parkingScore: Number(r.parking_score),
    mgmtScore: Number(r.mgmt_score),
    neighborScore: Number(r.neighbor_score),
    transportScore: Number(r.transport_score),
    comment: r.comment ? String(r.comment) : null,
    createdAt: String(r.created_at),
    helpfulCount: Number(r.helpful_count ?? 0),
    isResident: Boolean(r.is_resident),
    isVisitVerified: Boolean(r.is_visit_verified),
    residentPeriod: r.resident_period ? String(r.resident_period) : null,
  };
}

/** 도움돼요(helpful_count) 내림차순 → 최신순 정렬 비교자. */
function byHelpfulThenRecent(a: ComplexReview, b: ComplexReview): number {
  if (b.helpfulCount !== a.helpfulCount) return b.helpfulCount - a.helpfulCount;
  return a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0;
}

export async function listReviews(complexId: string): Promise<ComplexReview[]> {
  const sb = getServiceSupabase();
  if (!sb)
    return inMemory.filter((r) => r.complexId === complexId).sort(byHelpfulThenRecent);
  const { data } = await sb
    .from("complex_reviews")
    .select("*")
    .eq("complex_id", complexId)
    .order("helpful_count", { ascending: false })
    .order("created_at", { ascending: false });
  return (data ?? []).map(dbToReview);
}

export async function upsertReview(review: ComplexReviewInput): Promise<ComplexReview> {
  const now = new Date().toISOString();
  const isResident = review.isResident ?? false;
  const isVisitVerified = review.isVisitVerified ?? false;
  const residentPeriod = review.residentPeriod ?? null;
  const sb = getServiceSupabase();
  if (!sb) {
    const existing = inMemory.findIndex(
      (r) => r.complexId === review.complexId && r.authorEmail === review.authorEmail,
    );
    const entry: ComplexReview = {
      complexId: review.complexId,
      complexName: review.complexName,
      authorEmail: review.authorEmail,
      noiseScore: review.noiseScore,
      parkingScore: review.parkingScore,
      mgmtScore: review.mgmtScore,
      neighborScore: review.neighborScore,
      transportScore: review.transportScore,
      comment: review.comment,
      id: existing >= 0 ? inMemory[existing]!.id : `mem-${Date.now()}`,
      createdAt: existing >= 0 ? inMemory[existing]!.createdAt : now,
      // 재작성 시 기존 도움돼요 수 유지
      helpfulCount: existing >= 0 ? inMemory[existing]!.helpfulCount : 0,
      isResident,
      isVisitVerified,
      residentPeriod,
    };
    if (existing >= 0) inMemory[existing] = entry;
    else inMemory.unshift(entry);
    return entry;
  }
  const { data, error } = await sb
    .from("complex_reviews")
    .upsert(
      {
        complex_id: review.complexId,
        complex_name: review.complexName,
        author_email: review.authorEmail,
        noise_score: review.noiseScore,
        parking_score: review.parkingScore,
        mgmt_score: review.mgmtScore,
        neighbor_score: review.neighborScore,
        transport_score: review.transportScore,
        comment: review.comment,
        is_resident: isResident,
        is_visit_verified: isVisitVerified,
        resident_period: residentPeriod,
        updated_at: now,
        // helpful_count 는 upsert payload 에서 제외 → 재작성 시 기존 값 보존
      },
      { onConflict: "complex_id,author_email" },
    )
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return dbToReview(data as Record<string, unknown>);
}

/** Postgres unique_violation(23505) 판별 — 도움돼요 중복 투표를 already 로 처리. */
function isUniqueViolation(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  if (err.code === "23505") return true;
  return /duplicate key|unique constraint/i.test(err.message ?? "");
}

/** 특정 리뷰의 도움돼요 총 수를 votes 테이블에서 직접 집계(정합성 우선). */
async function countHelpful(
  sb: NonNullable<ReturnType<typeof getServiceSupabase>>,
  reviewId: string,
): Promise<number> {
  const { count } = await sb
    .from("complex_review_helpful")
    .select("*", { count: "exact", head: true })
    .eq("review_id", reviewId);
  return count ?? 0;
}

/**
 * 도움돼요 투표. voter 당 리뷰 1회(UNIQUE 제약). 이미 투표했으면 already=true.
 * votes 테이블에서 재집계한 값을 complex_reviews.helpful_count 에 반영해 정합성을 유지한다.
 */
export async function markReviewHelpful(
  reviewId: string,
  voterEmail: string,
): Promise<{ ok: boolean; count: number; already?: boolean }> {
  const sb = getServiceSupabase();
  if (!sb) {
    const key = `${reviewId}::${voterEmail}`;
    const rev = inMemory.find((r) => r.id === reviewId);
    if (inMemoryVotes.has(key)) {
      return { ok: true, count: rev?.helpfulCount ?? 0, already: true };
    }
    inMemoryVotes.add(key);
    if (rev) rev.helpfulCount += 1;
    return { ok: true, count: rev?.helpfulCount ?? 0 };
  }

  const { error: insertErr } = await sb
    .from("complex_review_helpful")
    .insert({ review_id: reviewId, voter_email: voterEmail });

  let already = false;
  if (insertErr) {
    if (isUniqueViolation(insertErr)) {
      already = true;
    } else {
      logger.error("[markReviewHelpful] insert 실패", insertErr);
      throw new Error(insertErr.message);
    }
  }

  const count = await countHelpful(sb, reviewId);
  const { error: updErr } = await sb
    .from("complex_reviews")
    .update({ helpful_count: count })
    .eq("id", reviewId);
  if (updErr) logger.warn("[markReviewHelpful] helpful_count 반영 실패", updErr);

  return already ? { ok: true, count, already: true } : { ok: true, count };
}

/** 로그인 사용자가 이미 도움돼요를 눌렀는지 여부. */
export async function hasVotedHelpful(
  reviewId: string,
  voterEmail: string,
): Promise<boolean> {
  const sb = getServiceSupabase();
  if (!sb) return inMemoryVotes.has(`${reviewId}::${voterEmail}`);
  const { count } = await sb
    .from("complex_review_helpful")
    .select("*", { count: "exact", head: true })
    .eq("review_id", reviewId)
    .eq("voter_email", voterEmail);
  return (count ?? 0) > 0;
}

export function calcSummary(reviews: ComplexReview[]): ReviewSummary {
  if (!reviews.length) return { count: 0, avgNoise: 0, avgParking: 0, avgMgmt: 0, avgNeighbor: 0, avgTransport: 0, overall: 0 };
  const avg = (key: keyof ComplexReview) =>
    reviews.reduce((s, r) => s + (r[key] as number), 0) / reviews.length;
  const avgNoise = avg("noiseScore");
  const avgParking = avg("parkingScore");
  const avgMgmt = avg("mgmtScore");
  const avgNeighbor = avg("neighborScore");
  const avgTransport = avg("transportScore");
  const overall = (avgNoise + avgParking + avgMgmt + avgNeighbor + avgTransport) / 5;
  return { count: reviews.length, avgNoise, avgParking, avgMgmt, avgNeighbor, avgTransport, overall };
}
